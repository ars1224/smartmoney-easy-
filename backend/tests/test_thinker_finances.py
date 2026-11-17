import unittest
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch
from sqlalchemy.exc import OperationalError
from config import Config
from app import create_app
from app.extensions import db
from app.models import User, BankConnection, BankAccount, CashWallet, Transaction
from app.services.thinker_finances import financial_reply


class FinancialReplyTests(unittest.TestCase):
    def setUp(self):
        with patch.object(Config, "SQLALCHEMY_DATABASE_URI", "sqlite:///:memory:"), patch.object(
            Config,
            "SECRET_KEY",
            "financial-test"
        ):
            self.app = create_app()
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        self.user = User(email="owner@example.test")
        self.other = User(email="other@example.test")
        db.session.add_all([self.user, self.other])
        db.session.flush()
        self.connection = BankConnection(
            user_id=self.user.id,
            external_customer_id="fixture",
            status="CONNECTED"
        )
        self.secret = BankConnection(
            user_id=self.other.id,
            external_customer_id="private",
            status="CONNECTED"
        )
        db.session.add_all([self.connection, self.secret])
        db.session.flush()
        self.account = BankAccount(
            connection_id=self.connection.id,
            external_account_id="fixture",
            balance=Decimal("125.25")
        )
        self.foreign = BankAccount(
            connection_id=self.secret.id,
            external_account_id="private",
            balance=Decimal("999.99")
        )
        db.session.add_all([self.account, self.foreign])
        db.session.commit()
        self.client = self.app.test_client()
        self.app.config.update(THINKER_MODE="demo", OPENAI_API_KEY="")
        with self.client.session_transaction() as session:
            session.update(user_id=self.user.id, csrf_token="fixture")

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def row(self, amount, **changes):
        fields = dict(
            user_id=self.user.id,
            bank_account_id=self.account.id,
            source="BANK",
            description="Groceries",
            category="Groceries",
            currency="NZD",
            transaction_type="DEBIT",
            transaction_date=datetime(2026, 11, 10, tzinfo=timezone.utc),
            amount=Decimal(amount)
        )
        fields.update(changes)
        row = Transaction(**fields)
        db.session.add(row)
        db.session.commit()
        return row

    def send(self, question, **extra):
        return self.client.post(
            "/api/thinker/messages",
            json={"message":question, **extra},
            headers={"X-CSRF-Token":"fixture"}
        )

    def test_authenticated_owner_only_ignores_client_context_and_never_calls_provider(self):
        self.row("-12.30")
        self.row(
            "-999",
            user_id=self.other.id,
            bank_account_id=self.foreign.id,
            description="PRIVATE"
        )
        self.row("-888", bank_account_id=self.foreign.id, description="INVALID CROSS OWNER")
        with patch("requests.post", side_effect=AssertionError("No provider allowed")):
            response = self.send("My latest transaction", user_id=self.other.id, accountData="forged")
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json['mode'],'records')
        self.assertIn("12.30",response.json['message'])
        self.assertNotIn("PRIVATE",str(response.json))
        self.assertNotIn("888",str(response.json))
        self.assertIn("no-store",response.headers['Cache-Control'])
        with self.client.session_transaction() as session: session.pop('user_id')
        self.assertEqual(self.send("My balances").status_code,401)

    def test_balance_currencies_exclusions_wallet_math_and_freshness(self):
        wallet = CashWallet(user_id=self.user.id,name="Wallet",opening_balance=Decimal('100'))
        db.session.add_all(
            [
                wallet,
                CashWallet(
                    user_id=self.other.id,
                    name="PRIVATE",
                    opening_balance=Decimal('999')
                ),
                CashWallet(
                    user_id=self.user.id,
                    name="Archive",
                    opening_balance=Decimal('777'),
                    is_archived=True
                ),
                BankAccount(
                    connection_id=self.connection.id,
                    external_account_id="usd",
                    currency="USD",
                    balance=Decimal('20')
                )
            ]
        )
        db.session.commit()
        self.row(
            '-10',
            source='CASH',
            bank_account_id=None,
            cash_wallet_id=wallet.id,
            transaction_type='expense'
        )
        message = self.send('My balances').json['message']
        self.assertIn('NZD 90.00',message)
        self.assertIn('NZD 125.25',message)
        self.assertIn('USD 20.00',message)
        self.assertNotIn('777.00',message)
        self.assertNotIn('999.99',message)
        self.assertIn('partial sync',message)
        self.assertIn('not recorded',message)
        self.account.is_connected = False
        db.session.commit()
        self.assertNotIn('125.25',self.send('My balances').json['message'])

    def test_monthly_summary_reconciles_with_reports_and_discloses_exclusions(self):
        self.row('100',transaction_type='CREDIT',category='Income')
        self.row('-30')
        self.row('5',transaction_type='REFUND')
        self.row('7',transaction_type='CREDIT',category=None)
        self.row('-50',category='Savings Transfer')
        self.row('-9',currency='USD')
        result = self.send('My finances 2026-11')
        self.assertEqual(result.status_code,200)
        report = self.client.get('/api/reports?month=2026-11').json
        for field in ['income','expenses','refunds','uncategorisedInflows','netCashFlow']:
            self.assertIn('NZD '+report[field],result.json['message'])
        self.assertIn('1 transfers, 1 foreign-currency',result.json['message'])
        self.assertIn('not your bank balance',result.json['message'])
        self.assertEqual(Transaction.query.count(),6)

    def test_latest_is_all_time_respects_selected_month_and_original_currency(self):
        self.row('-8',currency='USD')
        self.row('-7',transaction_date=datetime(2026,10,31,11,tzinfo=timezone.utc))
        self.row('-555',transaction_date=datetime(2099,1,1,tzinfo=timezone.utc))
        message = financial_reply(
            self.user.id,
            'My recent transactions 2026-11',
            datetime(2026, 11, 17, tzinfo=timezone.utc)
        )['message']
        self.assertIn('USD -8.00',message)
        self.assertIn('2026-11-01',message)
        self.assertNotIn('555',message)
        self.assertIn('No matching',self.send('My transactions 2025-01').json['message'])

    def test_empty_invalid_month_history_and_no_external_access(self):
        self.assertIn('No saved records',self.send('My finances 2026-11').json['message'])
        self.assertEqual(self.send('My finances 2026-13').status_code,400)
        self.assertIn('YYYY-MM',self.send('My finances last month').json['message'])
        self.assertIn('cannot retrieve',self.send('My balances for another client').json['message'])
        self.assertEqual(
            self.client.post('/api/thinker/messages', json={'message':'My balances'}).status_code,
            403
        )

    def test_failure_does_not_return_zero_or_call_ai_and_recovers(self):
        with patch(
            'sqlalchemy.orm.Query.all',
            side_effect=OperationalError('fixture', {}, Exception('offline'))
        ), patch('requests.post', side_effect=AssertionError('No paid fallback')):
            result = self.send('My balances')
        self.assertEqual(result.status_code,503)
        self.assertNotIn('message',result.json)
        self.assertEqual(self.send('My balances').status_code,200)

    def test_help_and_educational_questions_do_not_read_records(self):
        with patch('sqlalchemy.orm.Query.all',side_effect=AssertionError('No records')):
            for text in [
                'How do I check my balances?',
                'Using SmartMoney',
                'What is the difference between net cash flow and my bank balance?'
            ]:
                self.assertEqual(self.send(text).status_code,200)

    def test_historical_balances_never_masquerade_as_current(self):
        for question in [
            'My balance last month',
            'My balances 2026-10',
            'My wallet balance yesterday'
        ]:
            result = self.send(question)
            self.assertEqual(result.status_code,200)
            self.assertIn('not historical balance snapshots',result.json['message'])
            self.assertNotIn('125.25',result.json['message'])

    def test_bank_month_boundary_and_cash_date_match_reports(self):
        self.row('-10',transaction_date=datetime(2026,10,31,11,tzinfo=timezone.utc))
        self.row('-99',transaction_date=datetime(2026,10,31,10,59,tzinfo=timezone.utc))
        self.row(
            '-20',
            source='CASH',
            bank_account_id=None,
            transaction_type='expense',
            transaction_date=datetime(2026, 11, 30, tzinfo=timezone.utc)
        )
        self.assertIn('Expenses: NZD 30.00',self.send('My finances 2026-11').json['message'])
