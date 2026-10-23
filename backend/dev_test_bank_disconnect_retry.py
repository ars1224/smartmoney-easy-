
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from uuid import uuid4

from app import create_app
from app.extensions import db
from app.models import (
    User,
    BankConnection,
    BankAccount,
    BankOAuthAttempt,
    Transaction,
)
from app.services.bank_crypto import (
    encrypt_secret,
    decrypt_secret,
)

from app.services.mock_bank import MockBankError


app = create_app()
app.config["TESTING"] = True

test_email = f"disconnect-retry-{uuid4().hex}@example.test"
test_password = "SmartMoneyRetryTest!2026"
test_customer_id = str(uuid4())
test_token = f"temporary-token-{uuid4().hex}"


try:
    with app.app_context():
        original_accounts = BankAccount.query.count()
        original_transactions = Transaction.query.count()

    client = app.test_client()

    # 1. Register and authenticate a temporary user.
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200

    csrf_token = response.get_json()["csrf_token"]

    response = client.post(
        "/api/auth/register",
        json={
            "email": test_email,
            "password": test_password,
        },
        headers={"X-CSRF-Token": csrf_token},
    )

    assert response.status_code == 201, response.get_json()

    user_id = response.get_json()["user"]["id"]
    csrf_token = response.get_json()["csrf_token"]

    print("SmartMoney authentication: OK")

    # 2. Create a temporary connected bank.
    with app.app_context():
        connection = BankConnection(
            user_id=user_id,
            provider="MOCK_BANK",
            external_customer_id=test_customer_id,
            status="CONNECTED",
            access_token_encrypted=encrypt_secret(test_token),
            access_token_expires_at=(
                datetime.now(timezone.utc)
                + timedelta(days=1)
            ),
        )

        db.session.add(connection)
        db.session.commit()

        connection_id = connection.id

    print("Temporary bank connection created: OK")

    disconnect_url = (
        f"/api/bank/connections/{connection_id}/disconnect"
    )



    # 3. Temporary bank failure must preserve the credential.
    with patch(
        "app.routes.bank_accounts.MockBankAuthorizedClient"
    ) as bank_client_class:
        bank = bank_client_class.return_value

        bank.revoke_access.side_effect = MockBankError(
            "Mock Bank temporarily unavailable.",
            status_code=503,
        )

        response = client.post(
            disconnect_url,
            headers={"X-CSRF-Token": csrf_token},
        )

        assert response.status_code == 502, response.get_json()
        assert response.get_json()["status"] == "DISCONNECTING"
        assert response.get_json()["action"] == "retry_disconnect"

        with app.app_context():
            connection = db.session.get(
                BankConnection, connection_id
            )

            assert connection.status == "DISCONNECTING"
            assert decrypt_secret(
                connection.access_token_encrypted
            ) == test_token

        print("Temporary failure preserves credential: OK")

        # 4. A retry should finish the disconnection.
        bank.revoke_access.side_effect = None
        bank.revoke_access.return_value = {
            "status": "revoked"
        }

        response = client.post(
            disconnect_url,
            headers={"X-CSRF-Token": csrf_token},
        )

        assert response.status_code == 200, response.get_json()
        assert response.get_json()["status"] == "DISCONNECTED"

        with app.app_context():
            connection = db.session.get(
                BankConnection, connection_id
            )

            assert connection.status == "DISCONNECTED"
            assert connection.access_token_encrypted is None
            assert connection.access_token_expires_at is None

        print("Successful disconnection retry: OK")

        # 5. Rejected credentials with missing expiry
        # should still allow local disconnection.
        rejected_token = f"rejected-token-{uuid4().hex}"

        with app.app_context():
            rejected_connection = BankConnection(
                user_id=user_id,
                provider="MOCK_BANK",
                external_customer_id=str(uuid4()),
                status="CONNECTED",
                access_token_encrypted=encrypt_secret(
                    rejected_token
                ),
                access_token_expires_at=None,
            )

            db.session.add(rejected_connection)
            db.session.commit()
            rejected_id = rejected_connection.id

        bank.revoke_access.side_effect = MockBankError(
            "Bank credential rejected.",
            status_code=401,
        )

        response = client.post(
            f"/api/bank/connections/{rejected_id}/disconnect",
            headers={"X-CSRF-Token": csrf_token},
        )

        assert response.status_code == 200, response.get_json()
        assert response.get_json()["status"] == "DISCONNECTED"

        bank.revoke_access.assert_called_with(rejected_token)

        with app.app_context():
            rejected_connection = db.session.get(
                BankConnection, rejected_id
            )

            assert rejected_connection.status == "DISCONNECTED"
            assert rejected_connection.access_token_encrypted is None
            assert rejected_connection.access_token_expires_at is None

            assert BankAccount.query.count() == original_accounts
            assert Transaction.query.count() == original_transactions

        print("Rejected token recovery: OK")
        print("Missing expiry recovery: OK")
        print("Existing financial data preserved: OK")


        # 6. Database failure after remote revocation.
        # Begin in DISCONNECTING to isolate the final commit.
        recovery_token = f"recovery-token-{uuid4().hex}"

        with app.app_context():
            recovery_connection = BankConnection(
                user_id=user_id,
                provider="MOCK_BANK",
                external_customer_id=str(uuid4()),
                status="DISCONNECTING",
                access_token_encrypted=encrypt_secret(
                    recovery_token
                ),
                access_token_expires_at=(
                    datetime.now(timezone.utc)
                    + timedelta(days=1)
                ),
            )

            db.session.add(recovery_connection)
            db.session.commit()
            recovery_id = recovery_connection.id

        recovery_url = (
            f"/api/bank/connections/{recovery_id}/disconnect"
        )

        bank.revoke_access.side_effect = None
        bank.revoke_access.return_value = {
            "status": "revoked"
        }

        # Mock only the final database commit failure.
        with patch.object(
            db.session,
            "commit",
            side_effect=RuntimeError(
                "Simulated database commit failure"
            ),
        ):
            response = client.post(
                recovery_url,
                headers={"X-CSRF-Token": csrf_token},
            )

        assert response.status_code == 500, response.get_json()
        assert response.get_json()["action"] == "retry_disconnect"
        bank.revoke_access.assert_called_with(recovery_token)

        with app.app_context():
            recovery = db.session.get(
                BankConnection, recovery_id
            )

            assert recovery.status == "DISCONNECTING"
            assert recovery.access_token_encrypted is not None

        print("Database commit failure recovery state: OK")

        # Mock Bank now rejects the already-revoked token.
        bank.revoke_access.side_effect = MockBankError(
            "Credential already revoked.",
            status_code=401,
        )

        response = client.post(
            recovery_url,
            headers={"X-CSRF-Token": csrf_token},
        )

        assert response.status_code == 200, response.get_json()
        assert response.get_json()["status"] == "DISCONNECTED"

        with app.app_context():
            recovery = db.session.get(
                BankConnection, recovery_id
            )

            assert recovery.status == "DISCONNECTED"
            assert recovery.access_token_encrypted is None
            assert recovery.access_token_expires_at is None

            assert BankAccount.query.count() == original_accounts
            assert Transaction.query.count() == original_transactions

        print("Retry after database failure: OK")
        print("Final database recovery: OK")


    print("\nALL BANK DISCONNECT RETRY TESTS PASSED!")



finally:
    # Remove only records belonging to this temporary user.
    with app.app_context():
        db.session.rollback()

        user = User.query.filter_by(email=test_email).first()

        if user is not None:
            BankOAuthAttempt.query.filter_by(
                user_id=user.id
            ).delete(synchronize_session=False)

            connections = BankConnection.query.filter_by(
                user_id=user.id
            ).all()

            for connection in connections:
                Transaction.query.filter_by(
                    user_id=user.id
                ).delete(synchronize_session=False)

                BankAccount.query.filter_by(
                    connection_id=connection.id
                ).delete(synchronize_session=False)

                db.session.delete(connection)

            db.session.delete(user)
            db.session.commit()

            print("Temporary retry test data cleaned up.")
