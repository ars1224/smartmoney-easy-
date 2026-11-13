from sqlalchemy import text
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch

from sqlalchemy.engine import make_url

from app import create_app
from app.extensions import db
from app.models import (
    User, BankConnection, BankAccount, Transaction,
)
from app.services.bank_sync import sync_bank_connection

from app.services.transaction_backfill import (
    backfill_bank_categories,
)


app = create_app()


def run_tests():
    url = make_url(app.config["SQLALCHEMY_DATABASE_URI"])

    if (
        url.host not in ("localhost", "127.0.0.1")
        or url.database != "smartmoney_easy_category_test"
    ):
        raise RuntimeError("STOP: Requires local test database.")

    suffix = uuid.uuid4().hex
    user_id = str(uuid.uuid4())
    connection_id = str(uuid.uuid4())
    account_id = str(uuid.uuid4())
    external_account_id = f"demo-{suffix}"

    def bank_transaction(key, description, amount, kind):
        return {
            "id": f"{suffix}-{key}",
            "description": description,
            "amount": amount,
            "balance_after": "2000.00",
            "transaction_type": kind,
            "transaction_date": "2026-11-11T02:00:00Z",
        }

    transactions = [
        bank_transaction(
            "grocery", "PAKNSAVE", "-125.00", "DEBIT"
        ),
        bank_transaction(
            "unknown", "UNKNOWN MERCHANT", "-45.00", "DEBIT"
        ),
        bank_transaction(
            "transfer", "TRANSFER TO SAVINGS", "-200.00",
            "TRANSFER"
        ),
    ]

    with app.app_context():
        try:

            # 1. Create the temporary test user.
            db.session.add(User(
                id=user_id,
                email=f"sync-test-{suffix}@example.test",
            ))
            db.session.flush()

            # 2. Create the bank connection.
            db.session.add(BankConnection(
                id=connection_id,
                user_id=user_id,
                provider="MOCK_BANK",
                external_customer_id=f"customer-{suffix}",
                access_token_encrypted="TEST_ONLY",
                access_token_expires_at=(
                    datetime.now(timezone.utc)
                    + timedelta(hours=2)
                ),
                status="CONNECTED",
            ))
            db.session.flush()

            # 3. Create the connected bank account.
            db.session.add(BankAccount(
                id=account_id,
                connection_id=connection_id,
                external_account_id=external_account_id,
                account_name="Test Everyday Account",
                currency="NZD",
                balance=Decimal("2000.00"),
                status="ACTIVE",
                is_connected=True,
            ))
            db.session.commit()


            with patch(
                "app.services.bank_sync.decrypt_secret",
                return_value="fake-test-token",
            ), patch(
                "app.services.bank_sync.MockBankAuthorizedClient"
            ) as bank_factory:

                fake_bank = bank_factory.return_value

                fake_bank.get_account_balance.return_value = {
                    "account_id": external_account_id,
                    "balance": "2000.00",
                    "currency": "NZD",
                    "status": "ACTIVE",
                }

                fake_bank.get_account_transactions.return_value = {
                    "account_id": external_account_id,
                    "transactions": transactions,
                }

                # First import
                result = sync_bank_connection(connection_id)

                print("\n=== BANK SYNC DIAGNOSTICS ===", flush=True)
                print("Sync result:", result, flush=True)

                print(
                    "Bank transaction API calls:",
                    fake_bank.get_account_transactions.call_count,
                    flush=True,
                )

                print(
                    "Mock transactions available:",
                    len(transactions),
                    flush=True,
                )

                debug_records = Transaction.query.filter_by(
                    bank_account_id=account_id
                ).all()

                print(
                    "Transactions saved:",
                    len(debug_records),
                    flush=True,
                )

                for record in debug_records:
                    print(
                        record.description,
                        record.category,
                        record.amount,
                        flush=True,
                    )

                assert result["status"] == "success", result

                assert result["transactions_imported"] == 3, (
                    f"Expected 3 imported transactions. Got: {result}"
                )

                records = Transaction.query.filter_by(
                    bank_account_id=account_id
                ).all()

                assert len(records) == 3

                by_description = {
                    item.description: item for item in records
                }

                grocery = by_description["PAKNSAVE"]
                assert grocery.category == "Groceries"
                assert grocery.category_source == "AUTO"
                print("PASS: Grocery classification source is AUTO")
                print("PASS: Grocery automatically classified")

                assert (
                    by_description["UNKNOWN MERCHANT"].category
                    is None
                )
                assert (
                    by_description["UNKNOWN MERCHANT"].category_source
                    == "UNCLASSIFIED"
                )

                assert (
                    by_description["TRANSFER TO SAVINGS"].category_source
                    == "UNCLASSIFIED"
                )

                print("PASS: Unclassified transactions tracked correctly")
                print("PASS: Unknown merchant unclassified")

                assert (
                    by_description["TRANSFER TO SAVINGS"].category
                    is None
                )
                print("PASS: Transfer not classified as expense")

                # User manually corrects the category via API.
                client = app.test_client()
                csrf = secrets.token_urlsafe(32)

                with client.session_transaction() as session:
                    session["user_id"] = user_id
                    session["csrf_token"] = csrf


                # Verify budget groups returned by the Activity API.
                response = client.get("/api/bank/transactions")

                assert response.status_code == 200, (
                    response.get_json()
                )

                api_transactions = {
                    item["id"]: item
                    for item in response.get_json()["transactions"]
                }

                assert (
                    api_transactions[grocery.id]["budget_group"]
                    == "NEEDS"
                )

                unknown = by_description["UNKNOWN MERCHANT"]
                transfer = by_description["TRANSFER TO SAVINGS"]

                assert (
                    api_transactions[unknown.id]["budget_group"]
                    is None
                )

                assert (
                    api_transactions[transfer.id]["budget_group"]
                    is None
                )

                print("PASS: Activity API classification correct")


                response = client.patch(
                    f"/api/bank/transactions/{grocery.id}/category",
                    json={"category": "Shopping"},
                    headers={"X-CSRF-Token": csrf},
                )

                db.session.expire_all()

                grocery = db.session.get(Transaction, grocery.id)

                assert grocery.category == "Shopping"
                assert grocery.category_source == "MANUAL"

                print("PASS: Manual category source recorded")

                assert response.status_code == 200, (
                    response.get_json()
                )
                print("PASS: Manual correction accepted")


                # Changing category must also update budget group.
                response = client.get("/api/bank/transactions")

                assert response.status_code == 200

                updated_transactions = {
                    item["id"]: item
                    for item in response.get_json()["transactions"]
                }

                corrected = updated_transactions[grocery.id]

                assert corrected["category"] == "Shopping"
                assert corrected["budget_group"] == "WANTS"

                print("PASS: Manual correction updates budget group")

                # Re-sync the same bank data.
                second = sync_bank_connection(connection_id)
                assert second["transactions_imported"] == 0

                grocery = db.session.get(
                    Transaction, grocery.id
                )
                db.session.refresh(grocery)

                assert grocery.category == "Shopping"
                print("PASS: Manual correction survives re-sync")

                assert grocery.category_source == "MANUAL"

                print("PASS: Manual source preserved after re-sync")

                assert Transaction.query.filter_by(
                    bank_account_id=account_id
                ).count() == 3

                print("PASS: Repeated sync creates no duplicates")

                # Test automatic categorisation of older records.
                def historical(key, description, source, category=None):
                    return Transaction(
                        user_id=user_id,
                        bank_account_id=account_id,
                        external_transaction_id=f"{suffix}-{key}",
                        source="BANK",
                        description=description,
                        category=category,
                        category_source=source,
                        amount=Decimal("-25.00"),
                        currency="NZD",
                        transaction_type="DEBIT",
                        transaction_date=datetime.now(timezone.utc),
                    )

                legacy = historical(
                    "legacy", "NETFLIX", "LEGACY"
                )
                unclassified = historical(
                    "unclassified", "Z ENERGY", "UNCLASSIFIED"
                )
                manual_clear = historical(
                    "manual-clear", "PAKNSAVE", "MANUAL"
                )
                legacy_named = historical(
                    "legacy-named", "NETFLIX", "LEGACY",
                    "Shopping"
                )
    
                api_legacy = historical(
                    "api-legacy",
                    "NETFLIX",
                    "LEGACY",
                )

                api_manual_clear = historical(
                    "api-manual-clear",
                    "PAKNSAVE",
                    "MANUAL",
                )

                db.session.add_all([
                    api_legacy,
                    api_manual_clear,
                ])
                db.session.commit()


                preview_url = (
                    "/api/bank/transactions/"
                    "categories/backfill/preview"
                )

                apply_url = (
                    "/api/bank/transactions/"
                    "categories/backfill/apply"
                )

                # Unauthenticated access must be blocked.
                anonymous = app.test_client()

                response = anonymous.get(preview_url)
                assert response.status_code == 401

                print("PASS: Anonymous preview rejected")

                # Preview should not change the database.
                response = client.get(preview_url)

                assert response.status_code == 200
                assert response.get_json()["count"] == 1

                db.session.refresh(api_legacy)
                assert api_legacy.category is None

                print("PASS: API preview is read-only")

                # Applying without CSRF must fail.
                response = client.post(
                    apply_url,
                    json={"confirm": True},
                )

                assert response.status_code == 403

                print("PASS: Backfill requires CSRF")

                # Explicit confirmation must be provided.
                response = client.post(
                    apply_url,
                    json={"confirm": False},
                    headers={"X-CSRF-Token": csrf},
                )

                assert response.status_code == 400

                print("PASS: Backfill requires confirmation")

                # Apply the approved suggestions.
                response = client.post(
                    apply_url,
                    json={"confirm": True},
                    headers={"X-CSRF-Token": csrf},
                )

                assert response.status_code == 200
                assert response.get_json()["count"] == 1

                db.session.refresh(api_legacy)

                assert api_legacy.category == "Entertainment"
                assert api_legacy.category_source == "AUTO"

                print("PASS: Legacy API categorisation applied")


                # Manual clearing must remain protected.
                # Re-query because API requests may change
                # the SQLAlchemy session context.

                # Re-query the manually cleared transaction.
                # Avoid relying on an old ORM instance or
                # a separate manual_clear_id variable.

                saved_manual_clear = Transaction.query.filter_by(
                    user_id=user_id,
                    external_transaction_id=(
                        f"{suffix}-api-manual-clear"
                    ),
                    source="BANK",
                ).one_or_none()

                assert saved_manual_clear is not None
                assert saved_manual_clear.category is None
                assert (
                    saved_manual_clear.category_source
                    == "MANUAL"
                )

                print("PASS: Manual category remains protected")


                assert saved_manual_clear is not None
                assert saved_manual_clear.category is None
                assert (
                    saved_manual_clear.category_source
                    == "MANUAL"
                )

                print("PASS: Manual category remains protected")


                assert saved_manual_clear is not None
                assert saved_manual_clear.category is None
                assert (
                    saved_manual_clear.category_source
                    == "MANUAL"
                )

                print("PASS: Manual category remains protected")


                print("PASS: Manual category remains protected")

                # Applying again must not change anything.
                response = client.post(
                    apply_url,
                    json={"confirm": True},
                    headers={"X-CSRF-Token": csrf},
                )

                assert response.status_code == 200
                assert response.get_json()["count"] == 0

                print("PASS: Legacy API backfill is idempotent")

                db.session.add_all([
                    legacy,
                    unclassified,
                    manual_clear,
                    legacy_named,
                ])
                db.session.commit()
                manual_clear_id = manual_clear.id

                # Preview must not change any records.
                preview = backfill_bank_categories(user_id)

                assert preview["mode"] == "preview"
                assert preview["count"] == 1
                assert unclassified.category is None
                assert legacy.category is None

                print("PASS: Preview does not modify records")

                # Legacy classification requires explicit opt-in.
                preview_legacy = backfill_bank_categories(
                    user_id, include_legacy=True
                )
                assert preview_legacy["count"] == 2

                print("PASS: Legacy records previewed")

                # Apply to temporary test records only.
                applied = backfill_bank_categories(
                    user_id,
                    include_legacy=True,
                    apply=True,
                )

                assert applied["count"] == 2

                db.session.refresh(legacy)
                db.session.refresh(unclassified)
                db.session.refresh(manual_clear)
                db.session.refresh(legacy_named)
                db.session.refresh(grocery)

                assert legacy.category == "Entertainment"
                assert legacy.category_source == "AUTO"

                assert unclassified.category == "Transport"
                assert unclassified.category_source == "AUTO"

                print("PASS: Eligible historical transactions classified")

                # Explicit user decisions are protected.
                assert manual_clear.category is None
                assert manual_clear.category_source == "MANUAL"

                assert grocery.category == "Shopping"
                assert grocery.category_source == "MANUAL"

                assert legacy_named.category == "Shopping"
                assert legacy_named.category_source == "LEGACY"

                print("PASS: Existing user categories preserved")

                # Running the backfill twice must be safe.
                repeated = backfill_bank_categories(
                    user_id,
                    include_legacy=True,
                    apply=True,
                )

                assert repeated["count"] == 0

                print("PASS: Historical backfill is idempotent")


                # Verify automatic categorisation during normal sync.
                pending = Transaction(
                    user_id=user_id,
                    bank_account_id=account_id,
                    external_transaction_id=f"{suffix}-auto-pending",
                    source="BANK",
                    description="PAKNSAVE",
                    category=None,
                    category_source="UNCLASSIFIED",
                    amount=Decimal("-75.00"),
                    currency="NZD",
                    transaction_type="DEBIT",
                    transaction_date=datetime.now(timezone.utc),
                )

                protected = Transaction(
                    user_id=user_id,
                    bank_account_id=account_id,
                    external_transaction_id=f"{suffix}-manual-protected",
                    source="BANK",
                    description="PAKNSAVE",
                    category=None,
                    category_source="MANUAL",
                    amount=Decimal("-40.00"),
                    currency="NZD",
                    transaction_type="DEBIT",
                    transaction_date=datetime.now(timezone.utc),
                )

                db.session.add_all([pending, protected])
                db.session.commit()

                # Normal sync must trigger automatic backfill.
                sync_result = sync_bank_connection(connection_id)

                assert sync_result["transactions_imported"] == 0
                assert sync_result["transactions_categorised"] == 1

                db.session.refresh(pending)
                db.session.refresh(protected)

                assert pending.category == "Groceries"
                assert pending.category_source == "AUTO"

                print("PASS: Normal sync automatically categorises existing transactions")

                assert protected.category is None
                assert protected.category_source == "MANUAL"

                print("PASS: Normal sync preserves manually cleared categories")

                # Re-sync must not repeatedly categorise the same record.
                repeat_sync = sync_bank_connection(connection_id)

                assert repeat_sync["transactions_imported"] == 0
                assert repeat_sync["transactions_categorised"] == 0

                print("PASS: Automatic sync backfill is idempotent")


                print("\nALL BANK SYNC INTEGRATION TESTS PASSED")

                revision = db.session.execute(
                    text("SELECT version_num FROM alembic_version")
                ).scalar_one()

                if revision != "4b64fa121502":
                    raise RuntimeError(
                        f"STOP: Unexpected migration revision: {revision}"
                    )

        finally:
            db.session.rollback()

            # Delete only records created by this test.
            Transaction.query.filter_by(
                bank_account_id=account_id
            ).delete(synchronize_session=False)

            BankAccount.query.filter_by(
                id=account_id
            ).delete(synchronize_session=False)

            BankConnection.query.filter_by(
                id=connection_id
            ).delete(synchronize_session=False)

            User.query.filter_by(
                id=user_id
            ).delete(synchronize_session=False)

            db.session.commit()
            print("Temporary test data cleaned.")


if __name__ == "__main__":
    run_tests()