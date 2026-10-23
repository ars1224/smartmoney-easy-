
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from uuid import uuid4

from app import create_app
from app.extensions import db
from app.models import User, BankConnection
from app.services.bank_crypto import encrypt_secret
from app.services.mock_bank import MockBankError


app = create_app()
app.config["TESTING"] = True

password = "SmartMoneyPendingTest!2026"
user_ids = []

owner_token = f"owner-token-{uuid4().hex}"
other_token = f"other-token-{uuid4().hex}"

owner_customer = str(uuid4())
other_customer = str(uuid4())
account_id = str(uuid4())


def register_user():
    email = f"pending-test-{uuid4().hex}@example.test"
    client = app.test_client()

    response = client.get("/api/auth/csrf")
    csrf_token = response.get_json()["csrf_token"]

    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": password,
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 201, response.get_json()

    user_id = response.get_json()["user"]["id"]
    user_ids.append(user_id)

    return client, user_id


try:
    # 1. Unauthenticated requests must be rejected.
    anonymous = app.test_client()

    response = anonymous.get(
        "/api/bank/connections/pending"
    )

    assert response.status_code == 401
    print("Unauthenticated request rejected: OK")

    # 2. Create two separate SmartMoney users.
    owner_client, owner_id = register_user()
    other_client, other_id = register_user()

    response = owner_client.get(
        "/api/bank/connections/pending"
    )

    assert response.status_code == 200
    assert response.get_json()["count"] == 0

    print("Empty pending connections response: OK")

    # 3. Create valid, expired and other-user connections.
    with app.app_context():
        valid_connection = BankConnection(
            user_id=owner_id,
            provider="MOCK_BANK",
            external_customer_id=owner_customer,
            status="PENDING",
            access_token_encrypted=encrypt_secret(owner_token),
            access_token_expires_at=(
                datetime.now(timezone.utc) + timedelta(days=1)
            ),
        )

        expired_connection = BankConnection(
            user_id=owner_id,
            provider="MOCK_BANK",
            external_customer_id=str(uuid4()),
            status="PENDING",
            access_token_encrypted=encrypt_secret(
                f"expired-{uuid4().hex}"
            ),
            access_token_expires_at=(
                datetime.now(timezone.utc) - timedelta(days=1)
            ),
        )

        other_connection = BankConnection(
            user_id=other_id,
            provider="MOCK_BANK",
            external_customer_id=other_customer,
            status="PENDING",
            access_token_encrypted=encrypt_secret(other_token),
            access_token_expires_at=(
                datetime.now(timezone.utc) + timedelta(days=1)
            ),
        )

        db.session.add_all([
            valid_connection,
            expired_connection,
            other_connection,
        ])

        db.session.commit()

        valid_id = valid_connection.id
        expired_id = expired_connection.id
        other_id_connection = other_connection.id

    def authorized_accounts(token):
        if token == owner_token:
            customer_id = owner_customer
        elif token == other_token:
            customer_id = other_customer
        else:
            raise AssertionError(
                "Expired or unexpected credential was used."
            )

        return {
            "customer_id": customer_id,
            "accounts": [{
                "id": account_id,
                "account_name": "Everyday Account",
                "account_number": "1234567890",
                "account_type": "EVERYDAY",
                "currency": "NZD",
                "status": "ACTIVE",
            }],
        }

    with patch(
        "app.routes.bank_accounts.MockBankAuthorizedClient"
    ) as bank_class:
        bank = bank_class.return_value
        bank.get_authorized_accounts.side_effect = authorized_accounts

        # 4. Owner sees only their own connections.
        response = owner_client.get(
            "/api/bank/connections/pending"
        )

        assert response.status_code == 200, response.get_json()
        result = response.get_json()

        assert result["count"] == 2
        assert response.headers["Cache-Control"] == "no-store"

        records = {
            item["connection_id"]: item
            for item in result["connections"]
        }

        assert valid_id in records
        assert expired_id in records
        assert other_id_connection not in records

        print("Connection ownership isolation: OK")

        # 5. Valid account previews contain only safe fields.
        valid = records[valid_id]

        assert valid["status"] == "PENDING"
        assert len(valid["accounts"]) == 1
        assert (
            valid["accounts"][0]["account_number_last4"]
            == "7890"
        )

        serialized = json.dumps(result)

        assert owner_token not in serialized
        assert "1234567890" not in serialized
        assert "access_token_encrypted" not in serialized

        print("Safe account preview: OK")
        print("Bank credentials not exposed: OK")

        # 6. Expired connections must not call Mock Bank.
        expired = records[expired_id]

        assert expired["status"] == "EXPIRED"
        assert expired["accounts"] == []

        bank.get_authorized_accounts.assert_called_once_with(
            owner_token
        )

        print("Expired connection handling: OK")

        # 7. The other user sees only their own connection.
        bank.get_authorized_accounts.reset_mock()

        response = other_client.get(
            "/api/bank/connections/pending"
        )

        assert response.status_code == 200
        other_result = response.get_json()

        assert other_result["count"] == 1
        assert (
            other_result["connections"][0]["connection_id"]
            == other_id_connection
        )

        bank.get_authorized_accounts.assert_called_once_with(
            other_token
        )

        print("Other user isolation: OK")

        # 8. Rejected credentials are shown as expired.
        bank.get_authorized_accounts.side_effect = MockBankError(
            "Credential rejected.",
            status_code=401,
        )

        response = owner_client.get(
            "/api/bank/connections/pending"
        )

        assert response.status_code == 200

        records = {
            item["connection_id"]: item
            for item in response.get_json()["connections"]
        }

        assert records[valid_id]["status"] == "EXPIRED"
        assert records[valid_id]["accounts"] == []

        print("Rejected token recovery: OK")

        # 9. Temporary API errors must not silently
        # mark connections as expired.
        bank.get_authorized_accounts.side_effect = MockBankError(
            "Mock Bank temporarily unavailable.",
            status_code=503,
        )

        response = owner_client.get(
            "/api/bank/connections/pending"
        )

        assert response.status_code == 502

        with app.app_context():
            connection = db.session.get(
                BankConnection, valid_id
            )

            assert connection.status == "PENDING"
            assert connection.access_token_encrypted is not None

        print("Temporary bank error handling: OK")

    print("\nALL PENDING CONNECTION TESTS PASSED!")

finally:
    # Remove only records created for these test users.
    with app.app_context():
        db.session.rollback()

        if user_ids:
            BankConnection.query.filter(
                BankConnection.user_id.in_(user_ids)
            ).delete(synchronize_session=False)

            User.query.filter(
                User.id.in_(user_ids)
            ).delete(synchronize_session=False)

            db.session.commit()

            print("Temporary test data cleaned up.")
