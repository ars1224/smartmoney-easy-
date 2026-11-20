"""Isolated Dashboard acceptance; never connects to the developer database."""

import unittest
from datetime import datetime
from decimal import Decimal
from unittest.mock import patch

from sqlalchemy.exc import OperationalError

from config import Config
from app import create_app
from app.extensions import db
from app.models import User, BankConnection, BankAccount, Transaction


class DashboardTests(unittest.TestCase):
    def setUp(self):
        with patch.object(
            Config, 'SQLALCHEMY_DATABASE_URI', 'sqlite:///:memory:'
        ), patch.object(Config, 'SECRET_KEY', 'dashboard-test-only'):
            self.app = create_app()

        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        self.user = User(email='dashboard-owner@example.test')
        self.other = User(email='dashboard-other@example.test')
        db.session.add_all([self.user, self.other])
        db.session.flush()

        connection = BankConnection(
            user_id=self.user.id,
            external_customer_id='fixture',
            status='DISCONNECTED',
        )
        db.session.add(connection)
        db.session.flush()
        self.account = BankAccount(
            connection_id=connection.id,
            external_account_id='fixture-account',
            is_connected=False,
        )
        db.session.add(self.account)
        db.session.commit()
        self.client = self.app.test_client()

        with self.client.session_transaction() as session:
            session['user_id'] = self.user.id

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.context.pop()

    def row(self, amount, **kwargs):
        values = dict(
            user_id=self.user.id,
            bank_account_id=self.account.id,
            source='BANK',
            description='Example record',
            category='Groceries',
            currency='NZD',
            transaction_type='DEBIT',
            transaction_date=datetime.fromisoformat('2026-11-10T00:00:00+00:00'),
            amount=Decimal(amount),
        )
        values.update(kwargs)
        row = Transaction(**values)
        db.session.add(row)
        db.session.commit()
        return row

    def load(self):
        response = self.client.get('/api/dashboard?month=2026-11')
        self.assertEqual(response.status_code, 200)
        return response.json

    def test_auth_validation_and_no_store(self):
        self.assertEqual(self.app.test_client().get('/api/dashboard').status_code, 401)
        for value in ['', '2026-13', '2026-1', '9999-01']:
            self.assertEqual(
                self.client.get('/api/dashboard?month=' + value).status_code, 400
            )
        self.assertIn(
            'no-store',
            self.client.get('/api/dashboard?month=2026-11').headers['Cache-Control'],
        )

    def test_recent_activity_uses_transaction_note_as_title(self):
        transaction = self.row(
            '125.00',
            source='CASH',
            bank_account_id=None,
            description='QA Test Income - 1',
            note='QA Test Income - 1',
            category='Other',
            transaction_type='income',
        )

        dashboard = self.load()

        recent = next(
            item
            for item in dashboard['transactions']
            if item['id'] == transaction.id
        )

        self.assertEqual(
            recent['name'],
            'QA Test Income - 1',
        )

        self.assertEqual(
            recent['category'],
            'Other',
        )

        self.assertEqual(
            Decimal(recent['amount']),
            Decimal('125.00'),
        )

        self.assertEqual(
            recent['source'],
            'cash',
        )

    def test_totals_exactly_match_reports_and_do_not_invent_available_money(self):
        self.row('1000.10', transaction_type='CREDIT', category='Income')
        self.row('-100.20')
        self.row('20.05', transaction_type='REFUND')
        self.row('-30', category='Savings Transfer')
        self.row('30', category='Internal Transfer', transaction_type='CREDIT')
        self.row('-7', currency='USD')
        self.row('-9', category='Transfer')
        dashboard = self.load()
        report = self.client.get('/api/reports?month=2026-11&source=all').json

        self.assertEqual(dashboard['report'], report)
        self.assertEqual(
            (
                report['income'],
                report['expenses'],
                report['refunds'],
                report['netCashFlow'],
            ),
            ('1000.10', '100.20', '20.05', '919.95'),
        )
        self.assertNotIn('safeToSpend', dashboard)
        self.assertNotIn('availableBalance', dashboard)
        self.assertEqual(dashboard['recordCount'], 7)
        self.assertEqual(report['coverage'], 'partial')

    def test_ownership_and_linked_history(self):
        owned = self.row('-10')
        self.row('-999', user_id=self.other.id, description='Other user private record')
        self.row('-111', bank_account_id=None)
        result = self.load()

        self.assertEqual(result['report']['expenses'], '10.00')
        self.assertEqual([entry['id'] for entry in result['transactions']], [owned.id])
        self.assertNotIn('Other user', str(result))

    def test_nz_bank_and_cash_month_boundaries(self):
        self.row('-10', transaction_date=datetime.fromisoformat('2026-10-31T11:00:00+00:00'))
        self.row('-999', transaction_date=datetime.fromisoformat('2026-10-31T10:59:59+00:00'))
        self.row(
            '-20',
            source='CASH',
            bank_account_id=None,
            transaction_type='expense',
            transaction_date=datetime.fromisoformat('2026-11-30T00:00:00+00:00'),
        )
        self.row('-999', transaction_date=datetime.fromisoformat('2026-11-30T11:00:00+00:00'))
        result = self.load()

        self.assertEqual(result['report']['expenses'], '30.00')
        self.assertEqual(
            {row['reportDate'] for row in result['transactions']},
            {'2026-11-01', '2026-11-30'},
        )

    def test_recent_five_are_real_records_and_keep_original_dates(self):
        for day in range(1, 8):
            self.row(
                '-1',
                description=f'Record {day}',
                transaction_date=datetime.fromisoformat(f'2026-11-{day:02}T00:00:00+00:00'),
            )
        self.row(
            '-50',
            currency='USD',
            transaction_date=datetime.fromisoformat('2026-11-09T00:00:00+00:00'),
        )
        result = self.load()

        self.assertEqual(result['recordCount'], 8)
        self.assertEqual(
            [row['name'] for row in result['transactions']],
            ['Record 7', 'Record 6', 'Record 5', 'Record 4', 'Record 3'],
        )
        self.assertTrue(
            all(
                row['currency'] == 'NZD' and row['date'] and row['reportDate']
                for row in result['transactions']
            )
        )

    def test_transfer_can_be_recent_without_becoming_spending(self):
        transfer = self.row('-100', category='Savings Transfer')
        result = self.load()

        self.assertEqual(result['report']['expenses'], '0.00')
        self.assertEqual(result['transactions'][0]['id'], transfer.id)
        self.assertEqual(result['report']['excluded']['transfers'], 1)

    def test_empty_and_database_failure(self):
        self.assertEqual(self.load()['recordCount'], 0)
        with patch(
            'sqlalchemy.orm.Query.all',
            side_effect=OperationalError('test', {}, Exception('offline')),
        ), patch.object(self.app.logger, 'exception'):
            response = self.client.get('/api/dashboard?month=2026-11')

        self.assertEqual(response.status_code, 503)
        self.assertNotIn('report', response.json)

    def test_read_only_and_no_provider_calls(self):
        self.row('-1')
        before = Transaction.query.count()
        with patch(
            'requests.sessions.Session.request',
            side_effect=AssertionError('No external calls allowed'),
        ):
            result = self.load()

        self.assertEqual(result['report']['expenses'], '1.00')
        self.assertEqual(Transaction.query.count(), before)
