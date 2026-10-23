
from decimal import Decimal

from app import create_app
from app.extensions import db
from app.models import User, BankConnection, BankAccount, Transaction
from app.services.mock_bank import MockBankClient
from app.services.bank_sync import sync_bank_connection


app = create_app()

with app.app_context():
    client = MockBankClient()

    user_email = "smartmoney-dev@example.test"
    bank_email = "john.smith@example.test"

    try:
        user = User.query.filter_by(email=user_email).first()

        if user is None:
            user = User(email=user_email)
            db.session.add(user)
            db.session.flush()

        customer = client.lookup_customer(bank_email)

        connection = BankConnection.query.filter_by(
            user_id=user.id,
            provider="MOCK_BANK",
            external_customer_id=customer["id"]
        ).first()

        if connection is None:
            connection = BankConnection(
                user_id=user.id,
                provider="MOCK_BANK",
                external_customer_id=customer["id"],
                status="CONNECTED"
            )
            db.session.add(connection)
            db.session.flush()

        response = client.get_customer_accounts(customer["id"])

        for item in response["accounts"]:
            if item["status"] != "ACTIVE":
                continue

            account = BankAccount.query.filter_by(
                connection_id=connection.id,
                external_account_id=item["id"]
            ).first()

            if account is None:
                account = BankAccount(
                    connection_id=connection.id,
                    external_account_id=item["id"]
                )
                db.session.add(account)

            account.account_name = item["account_name"]
            account.account_number = item["account_number"]
            account.account_type = item["account_type"]
            account.currency = item["currency"]
            account.balance = Decimal(str(item["balance"]))
            account.status = item["status"]
            account.is_connected = True

        db.session.commit()

        print("Bank connection created successfully.")

        first_result = sync_bank_connection(connection.id)
        print("First sync:", first_result)

        second_result = sync_bank_connection(connection.id)
        print("Second sync:", second_result)

        print("Users:", User.query.count())
        print("Bank Connections:", BankConnection.query.count())
        print("Bank Accounts:", BankAccount.query.count())
        print("Transactions:", Transaction.query.count())

    except Exception:
        db.session.rollback()
        raise
