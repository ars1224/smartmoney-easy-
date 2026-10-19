
from datetime import datetime, timezone
from decimal import Decimal

from app.extensions import db
from app.models import BankConnection, BankAccount, Transaction
from app.services.mock_bank_authorized import MockBankAuthorizedClient
from app.services.bank_crypto import decrypt_secret

# Keep your other existing imports.
class BankReauthorizationRequired(Exception):
    """Bank connection requires reauthorisation."""
    pass
    
def parse_bank_date(value):
    return datetime.fromisoformat(
        value.replace("Z", "+00:00")
    )

def sync_bank_connection(connection_id):
    connection = db.session.get(
        BankConnection,
        connection_id
    )

    if connection is None:
        raise ValueError("Bank connection not found.")

    if connection.status != "CONNECTED":
        raise ValueError("Bank connection is not active.")

    accounts = BankAccount.query.filter_by(
        connection_id=connection.id,
        is_connected=True
    ).all()

    if not accounts:
        raise ValueError("No connected bank accounts found.")

    if (
        not connection.access_token_encrypted
        or not connection.access_token_expires_at
    ):
        raise BankReauthorizationRequired(
            "Bank authorisation is required."
        )

    expires_at = connection.access_token_expires_at

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(
            tzinfo=timezone.utc
        )

    if expires_at <= datetime.now(timezone.utc):
        raise BankReauthorizationRequired(
            "Bank authorisation has expired."
        )

    access_token = decrypt_secret(
        connection.access_token_encrypted
    )

    client = MockBankAuthorizedClient()

    accounts_synced = 0
    transactions_imported = 0

    try:
        for account in accounts:
            balance_data = client.get_account_balance(
                access_token,
                account.external_account_id
            )

            transaction_data = client.get_account_transactions(
                access_token,
                account.external_account_id
            )

            if str(balance_data["account_id"]) != account.external_account_id:
                raise ValueError("Bank account ID mismatch.")

            if str(transaction_data["account_id"]) != account.external_account_id:
                raise ValueError("Transaction account ID mismatch.")

            account.balance = Decimal(str(balance_data["balance"]))
            account.currency = balance_data.get(
                "currency", account.currency
            )
            account.status = balance_data.get(
                "status", account.status
            )

            existing_ids = {
                row[0]
                for row in db.session.query(
                    Transaction.external_transaction_id
                ).filter(
                    Transaction.bank_account_id == account.id,
                    Transaction.external_transaction_id.isnot(None)
                ).all()
            }

            for item in transaction_data["transactions"]:
                external_id = str(item["id"])

                if external_id in existing_ids:
                    continue

                transaction = Transaction(
                    user_id=connection.user_id,
                    bank_account_id=account.id,
                    external_transaction_id=external_id,
                    source="BANK",
                    description=item["description"],
                    amount=Decimal(str(item["amount"])),
                    balance_after=(
                        Decimal(str(item["balance_after"]))
                        if item.get("balance_after") is not None
                        else None
                    ),
                    currency=account.currency,
                    transaction_type=item["transaction_type"],
                    transaction_date=parse_bank_date(
                        item["transaction_date"]
                    )
                )

                db.session.add(transaction)
                existing_ids.add(external_id)
                transactions_imported += 1

            accounts_synced += 1

        sync_time = datetime.now(timezone.utc)
        connection.last_synced_at = sync_time

        # Lock and recheck the connection immediately
        # before committing imported bank transactions.
        db.session.refresh(
            connection,
            with_for_update=True
        )

        if connection.status != "CONNECTED":
            db.session.rollback()

            raise BankReauthorizationRequired(
                "Bank connection was disconnected during synchronisation."
            )

        db.session.commit()

        return {
            "status": "success",
            "accounts_synced": accounts_synced,
            "transactions_imported": transactions_imported,
            "last_synced_at": sync_time.isoformat()
        }

    except Exception:
        db.session.rollback()
        raise
