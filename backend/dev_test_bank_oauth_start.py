
import base64
import hashlib
from uuid import uuid4
from datetime import datetime, timezone
from urllib.parse import urlsplit, parse_qs

from app import create_app
from app.extensions import db
from app.models import User, BankOAuthAttempt
from app.services.bank_crypto import decrypt_secret


app = create_app()
app.config["TESTING"] = True

test_email = f"oauth-test-{uuid4().hex}@example.test"
test_password = "SmartMoneyOAuthTest!2026"


try:
    with app.test_client() as client:

        # 1. Get CSRF token
        response = client.get("/api/auth/csrf")

        assert response.status_code == 200
        csrf_token = response.get_json()["csrf_token"]

        print("CSRF token: OK")

        # 2. Register and authenticate temporary user
        response = client.post(
            "/api/auth/register",
            json={
                "email": test_email,
                "password": test_password
            },
            headers={"X-CSRF-Token": csrf_token}
        )

        print("User registration:", response.status_code)

        assert response.status_code == 201, response.get_json()

        user_id = response.get_json()["user"]["id"]
        csrf_token = response.get_json()["csrf_token"]

        # 3. Start Mock Bank OAuth
        response = client.post(
            "/api/bank/oauth/start",
            headers={"X-CSRF-Token": csrf_token}
        )

        print("OAuth start:", response.status_code)

        assert response.status_code == 201, response.get_json()

        data = response.get_json()
        authorization_url = data["authorization_url"]

        # Do not print the full authorization URL.
        parsed = urlsplit(authorization_url)
        params = parse_qs(parsed.query)

        assert parsed.path.endswith("/api/v1/authorize")
        assert params["response_type"] == ["code"]
        assert params["code_challenge_method"] == ["S256"]

        assert params["client_id"] == [
            app.config["MOCK_BANK_OAUTH_CLIENT_ID"]
        ]

        assert params["redirect_uri"] == [
            app.config["MOCK_BANK_OAUTH_REDIRECT_URI"]
        ]

        print("Authorization URL: OK")

        # 4. Verify OAuth state stored securely
        state = params["state"][0]

        state_hash = hashlib.sha256(
            state.encode("ascii")
        ).hexdigest()

        with app.app_context():
            attempt = BankOAuthAttempt.query.filter_by(
                state_hash=state_hash
            ).first()

            assert attempt is not None
            assert attempt.user_id == user_id
            assert attempt.consumed_at is None

            print("OAuth state stored: OK")

            # 5. Verify encrypted PKCE verifier
            encrypted = attempt.code_verifier_encrypted

            verifier = decrypt_secret(encrypted)

            assert encrypted != verifier

            challenge = base64.urlsafe_b64encode(
                hashlib.sha256(
                    verifier.encode("ascii")
                ).digest()
            ).rstrip(b"=").decode("ascii")

            assert challenge == params["code_challenge"][0]

            print("PKCE encryption: OK")
            print("PKCE challenge: OK")

            # 6. Verify expiry
            expiry = attempt.expires_at

            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)

            assert expiry > datetime.now(timezone.utc)

            print("OAuth expiry: OK")

        print("\nALL OAUTH START TESTS PASSED!")

finally:
    # Remove temporary test records only.
    with app.app_context():
        db.session.rollback()

        user = User.query.filter_by(
            email=test_email
        ).first()

        if user is not None:
            BankOAuthAttempt.query.filter_by(
                user_id=user.id
            ).delete()

            db.session.delete(user)
            db.session.commit()

            print("Temporary OAuth test data cleaned up.")
