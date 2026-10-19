
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


    # 3. Test ambiguous 401 and temporary 503 failures.
    with patch(
        "app.routes.bank_accounts.MockBankAuthorizedClient"
    ) as bank_client_class:

        bank = bank_client_class.return_value

        for attempt_number, status_code in enumerate(
            (401, 503),
            start=1
        ):
            bank.revoke_access.side_effect = MockBankError(
                "Simulated bank revocation failure.",
                status_code=status_code
            )

            response = client.post(
                disconnect_url,
                headers={"X-CSRF-Token": csrf_token},
            )

            print(
                f"Revocation HTTP {status_code}:",
                response.status_code
            )

            assert response.status_code == 502, (
                response.get_json()
            )

            result = response.get_json()

            assert result["status"] == "DISCONNECTING"
            assert result["action"] == "retry_disconnect"

            assert (
                bank.revoke_access.call_count
                == attempt_number
            )

            bank.revoke_access.assert_called_with(test_token)

            # No failed revocation may discard the token.
            with app.app_context():
                connection = db.session.get(
                    BankConnection,
                    connection_id,
                )

                assert connection.status == "DISCONNECTING"

                assert (
                    connection.access_token_encrypted
                    is not None
                )

                assert decrypt_secret(
                    connection.access_token_encrypted
                ) == test_token

            print(
                f"HTTP {status_code} credential preserved: OK"
            )
            print(
                f"HTTP {status_code} retry allowed: OK"
            )

        # 4. Simulate successful bank revocation.
        bank.revoke_access.side_effect = None
        bank.revoke_access.return_value = {
            "status": "revoked"
        }

        response = client.post(
            disconnect_url,
            headers={"X-CSRF-Token": csrf_token},
        )

        print("Successful retry:", response.status_code)

        assert response.status_code == 200, (
            response.get_json()
        )

        assert (
            response.get_json()["status"]
            == "DISCONNECTED"
        )

        assert bank.revoke_access.call_count == 3

        bank.revoke_access.assert_called_with(test_token)

        print("Bank revocation retry: OK")

        # 5. Verify the final database state.
        with app.app_context():
            connection = db.session.get(
                BankConnection,
                connection_id,
            )

            assert connection.status == "DISCONNECTED"
            assert connection.access_token_encrypted is None
            assert connection.access_token_expires_at is None

            # Pre-existing financial records remain unchanged.
            assert (
                BankAccount.query.count()
                == original_accounts
            )
            assert (
                Transaction.query.count()
                == original_transactions
            )

        print("Encrypted credential cleared: OK")
        print("Final connection status: DISCONNECTED")
        print("Existing financial data preserved: OK")

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
