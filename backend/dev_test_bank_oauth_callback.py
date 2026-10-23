
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch
from uuid import uuid4

from app import create_app
from app.extensions import db
from app.models import (
    User,
    BankOAuthAttempt,
    BankConnection,
    BankAccount,
    Transaction,
)
from app.services.bank_crypto import decrypt_secret


app = create_app()
app.config["TESTING"] = True

owner_email = f"oauth-owner-{uuid4().hex}@example.test"
other_email = f"oauth-other-{uuid4().hex}@example.test"
password = "SmartMoneyOAuthTest!2026"

customer_id = str(uuid4())
account_id = str(uuid4())
fake_access_token = secrets.token_urlsafe(48)
valid_code = secrets.token_urlsafe(32)


def register_test_user(client, email):
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200

    csrf_token = response.get_json()["csrf_token"]

    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": password
        },
        headers={"X-CSRF-Token": csrf_token}
    )

    assert response.status_code == 201, response.get_json()

    return (
        response.get_json()["user"]["id"],
        response.get_json()["csrf_token"]
    )


try:
    with app.app_context():
        original_accounts = BankAccount.query.count()
        original_transactions = Transaction.query.count()

    owner_client = app.test_client()
    other_client = app.test_client()

    # 1. Register two separate SmartMoney users.
    owner_id, owner_csrf = register_test_user(
        owner_client, owner_email
    )

    other_id, other_csrf = register_test_user(
        other_client, other_email
    )

    print("Test users authenticated: OK")

    # 2. Start OAuth as the first user.
    response = owner_client.post(
        "/api/bank/oauth/start",
        headers={"X-CSRF-Token": owner_csrf}
    )

    print("OAuth start:", response.status_code)
    assert response.status_code == 201, response.get_json()

    authorization_url = response.get_json()["authorization_url"]
    params = parse_qs(urlsplit(authorization_url).query)

    state = params["state"][0]
    state_hash = hashlib.sha256(
        state.encode("ascii")
    ).hexdigest()

    print("OAuth state generated: OK")

    # 3. Simulate the bank's response.
    # No actual HTTP request is made to Mock Bank.
    with patch(
        "app.services.bank_oauth_callback.MockBankAuthorizedClient"
    ) as mocked_client_class:

        bank = mocked_client_class.return_value

        bank.exchange_authorization_code.return_value = {
            "access_token": fake_access_token,
            "customer_id": customer_id,
            "approved_account_ids": [account_id],
            "expires_at": (
                datetime.now(timezone.utc)
                + timedelta(days=7)
            ).isoformat()
        }

        bank.get_authorized_accounts.return_value = {
            "customer_id": customer_id,
            "accounts": [
                {
                    "id": account_id,
                    "account_name": "Test Everyday Account",
                    "account_number": "0000000001",
                    "account_type": "EVERYDAY",
                    "currency": "NZD",
                    "status": "ACTIVE"
                }
            ]
        }

        callback_payload = {
            "code": valid_code,
            "state": state
        }

        # 4. Incorrect state must be rejected.
        response = owner_client.post(
            "/api/bank/oauth/callback",
            json={
                "code": valid_code,
                "state": secrets.token_urlsafe(32)
            },
            headers={"X-CSRF-Token": owner_csrf}
        )

        print("Invalid state:", response.status_code)
        assert response.status_code == 400

        # 5. Another SmartMoney user cannot use
        # the original user's OAuth state.
        response = other_client.post(
            "/api/bank/oauth/callback",
            json=callback_payload,
            headers={"X-CSRF-Token": other_csrf}
        )

        print("Other user callback:", response.status_code)
        assert response.status_code == 400

        # 6. Correct user completes callback.
        response = owner_client.post(
            "/api/bank/oauth/callback",
            json=callback_payload,
            headers={"X-CSRF-Token": owner_csrf}
        )

        print("Valid callback:", response.status_code)
        assert response.status_code == 200, response.get_json()

        result = response.get_json()

        assert result["status"] == "PENDING"
        assert len(result["accounts"]) == 1
        assert result["accounts"][0]["id"] == account_id

        print("Approved accounts returned: OK")

        # 7. Verify PostgreSQL storage.
        with app.app_context():
            connection = BankConnection.query.filter_by(
                user_id=owner_id,
                provider="MOCK_BANK",
                external_customer_id=customer_id
            ).first()

            assert connection is not None
            assert connection.status == "PENDING"

            assert connection.access_token_encrypted
            assert (
                connection.access_token_encrypted
                != fake_access_token
            )

            assert decrypt_secret(
                connection.access_token_encrypted
            ) == fake_access_token

            assert connection.access_token_expires_at is not None

            print("Access token encrypted: OK")
            print("Pending connection saved: OK")

            attempt = BankOAuthAttempt.query.filter_by(
                state_hash=state_hash
            ).first()

            assert attempt is not None
            assert attempt.consumed_at is not None

            print("OAuth state consumed: OK")

        # 8. The same callback cannot be reused.
        response = owner_client.post(
            "/api/bank/oauth/callback",
            json=callback_payload,
            headers={"X-CSRF-Token": owner_csrf}
        )

        print("Callback replay:", response.status_code)
        assert response.status_code == 400

        # Bank exchange must occur only once.
        assert bank.exchange_authorization_code.call_count == 1


        # 9. Test bank reconnection lifecycle protection.
        # Every callback must have a fresh OAuth state and code.

        with app.app_context():
            existing_connection = BankConnection.query.filter_by(
                user_id=owner_id,
                provider="MOCK_BANK",
                external_customer_id=customer_id
            ).one()

            existing_connection_id = existing_connection.id
            original_encrypted_token = (
                existing_connection.access_token_encrypted
            )

        def fresh_oauth_callback(new_token):
            # Configure the mock to issue a different bank grant.
            bank.exchange_authorization_code.return_value = {
                "access_token": new_token,
                "customer_id": customer_id,
                "approved_account_ids": [account_id],
                "expires_at": (
                    datetime.now(timezone.utc)
                    + timedelta(days=7)
                ).isoformat()
            }

            start_response = owner_client.post(
                "/api/bank/oauth/start",
                headers={"X-CSRF-Token": owner_csrf}
            )

            assert start_response.status_code == 201, (
                start_response.get_json()
            )

            parameters = parse_qs(
                urlsplit(
                    start_response.get_json()["authorization_url"]
                ).query
            )

            return owner_client.post(
                "/api/bank/oauth/callback",
                json={
                    "code": secrets.token_urlsafe(32),
                    "state": parameters["state"][0]
                },
                headers={"X-CSRF-Token": owner_csrf}
            )

        blocked_states = [
            "CONNECTED",
            "PENDING",
            "DISCONNECTING"
        ]

        for status in blocked_states:
            with app.app_context():
                existing_connection = db.session.get(
                    BankConnection,
                    existing_connection_id
                )

                existing_connection.status = status
                db.session.commit()

            new_token = secrets.token_urlsafe(48)
            bank.revoke_access.reset_mock()

            exchange_calls_before = (
                bank.exchange_authorization_code.call_count
            )

            response = fresh_oauth_callback(new_token)

            assert response.status_code == 400, (
                status,
                response.get_json()
            )

            assert (
                "fully disconnected"
                in response.get_json()["error"]
            )

            assert (
                bank.exchange_authorization_code.call_count
                == exchange_calls_before + 1
            )

            # The newly issued grant must be revoked.
            bank.revoke_access.assert_called_once_with(
                new_token
            )

            # The previous connection and token must survive.
            with app.app_context():
                existing_connection = db.session.get(
                    BankConnection,
                    existing_connection_id
                )

                assert existing_connection.status == status
                assert (
                    existing_connection.access_token_encrypted
                    == original_encrypted_token
                )

            print(f"{status} replacement blocked: OK")

        # 10. A disconnected connection with a remaining
        # credential must also reject replacement.
        with app.app_context():
            existing_connection = db.session.get(
                BankConnection,
                existing_connection_id
            )

            existing_connection.status = "DISCONNECTED"
            db.session.commit()

        new_token = secrets.token_urlsafe(48)
        bank.revoke_access.reset_mock()

        response = fresh_oauth_callback(new_token)

        assert response.status_code == 400, (
            response.get_json()
        )

        bank.revoke_access.assert_called_once_with(new_token)

        print("Disconnected connection with token blocked: OK")

        # 11. Fully disconnected connections can reconnect
        # once their previous credential has been cleared.
        with app.app_context():
            existing_connection = db.session.get(
                BankConnection,
                existing_connection_id
            )

            existing_connection.status = "DISCONNECTED"
            existing_connection.access_token_encrypted = None
            existing_connection.access_token_expires_at = None

            db.session.commit()

        reconnect_token = secrets.token_urlsafe(48)
        bank.revoke_access.reset_mock()

        response = fresh_oauth_callback(reconnect_token)

        assert response.status_code == 200, (
            response.get_json()
        )

        reconnect_result = response.get_json()

        assert reconnect_result["status"] == "PENDING"
        assert (
            reconnect_result["connection_id"]
            == existing_connection_id
        )

        with app.app_context():
            existing_connection = db.session.get(
                BankConnection,
                existing_connection_id
            )

            assert existing_connection.status == "PENDING"
            assert decrypt_secret(
                existing_connection.access_token_encrypted
            ) == reconnect_token

            # Reuse the original connection, not a duplicate.
            assert BankConnection.query.filter_by(
                user_id=owner_id,
                provider="MOCK_BANK",
                external_customer_id=customer_id
            ).count() == 1

        bank.revoke_access.assert_not_called()

        print("Fully disconnected bank reconnection: OK")
        print("Original bank connection record reused: OK")

        # 9. No accounts or transactions were imported.
        with app.app_context():
            assert BankAccount.query.count() == original_accounts
            assert Transaction.query.count() == original_transactions

            print("Existing financial data preserved: OK")

        print("\nALL OAUTH CALLBACK TESTS PASSED!")

finally:
    # Remove only users and records created by this test.
    with app.app_context():
        db.session.rollback()

        test_users = User.query.filter(
            User.email.in_([owner_email, other_email])
        ).all()

        for user in test_users:
            BankOAuthAttempt.query.filter_by(
                user_id=user.id
            ).delete(synchronize_session=False)

            BankConnection.query.filter_by(
                user_id=user.id
            ).delete(synchronize_session=False)

            db.session.delete(user)

        db.session.commit()
        print("Temporary OAuth test data cleaned up.")
