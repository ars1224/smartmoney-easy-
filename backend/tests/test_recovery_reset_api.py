"""Integration tests for the account recovery password-reset API.

Run from the backend directory:

    python -m pytest tests/test_recovery_reset_api.py -v

Uses an isolated in-memory SQLite database.
"""

import unittest
from unittest.mock import patch

from sqlalchemy.exc import SQLAlchemyError

from app import create_app
from app.extensions import db
from app.models import User
from app.services.recovery_codes import (
    hash_recovery_code,
    verify_recovery_code,
)
from config import Config


TEST_EMAIL = "password-reset@example.test"
TEST_NAME = "Password Reset User"

OLD_PASSWORD = "OriginalPassword123!"
NEW_PASSWORD = "ReplacementPassword456!"

OLD_RECOVERY_CODE = "ABCD23"
INVALID_RECOVERY_CODE = "AAAAAA"

GENERIC_ERROR = {
    "error": (
        "Unable to verify recovery details. "
        "Check your information or try again later."
    )
}


class RecoveryResetApiTests(unittest.TestCase):

    def setUp(self):
        with patch.object(
            Config,
            "SQLALCHEMY_DATABASE_URI",
            "sqlite:///:memory:",
        ), patch.object(
            Config,
            "SECRET_KEY",
            "recovery-reset-api-test-only",
        ):
            self.app = create_app()

        self.app.config["TESTING"] = True

        self.app_context = self.app.app_context()
        self.app_context.push()

        # Prevent accidental PostgreSQL modifications.
        database_url = db.engine.url

        if (
            not database_url.drivername.startswith("sqlite")
            or database_url.database != ":memory:"
        ):
            self.app_context.pop()

            raise RuntimeError(
                "Recovery reset tests require "
                "an in-memory SQLite database."
            )

        db.create_all()

        user = User(
            name=TEST_NAME,
            email=TEST_EMAIL,
        )

        user.set_password(OLD_PASSWORD)

        user.recovery_code_hash = hash_recovery_code(
            OLD_RECOVERY_CODE
        )

        db.session.add(user)
        db.session.commit()

        self.test_user_id = user.id

        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        db.drop_all()

        self.app_context.pop()

    def get_user(self):
        """Retrieve the synthetic account."""

        return db.session.get(
            User,
            self.test_user_id,
        )

    def get_csrf_token(self, client):
        """Request a CSRF token for a specific test client."""

        response = client.get(
            "/api/auth/csrf"
        )

        self.assertEqual(
            response.status_code,
            200,
        )

        return response.get_json()["csrf_token"]

    def login(self, client, password):
        """Log in through the real authentication endpoint."""

        csrf_token = self.get_csrf_token(client)

        return client.post(
            "/api/auth/login",
            json={
                "email": TEST_EMAIL,
                "password": password,
            },
            headers={
                "X-CSRF-Token": csrf_token,
            },
        )

    def reset_password(
        self,
        *,
        code=OLD_RECOVERY_CODE,
        email=TEST_EMAIL,
        name=TEST_NAME,
        new_password=NEW_PASSWORD,
        confirm_password=NEW_PASSWORD,
    ):
        """Submit a password reset through the Flask endpoint."""

        csrf_token = self.get_csrf_token(
            self.client
        )

        return self.client.post(
            "/api/auth/recovery/reset",
            json={
                "email": email,
                "name": name,
                "recoveryCode": code,
                "newPassword": new_password,
                "confirmPassword": confirm_password,
            },
            headers={
                "X-CSRF-Token": csrf_token,
            },
        )

    def test_successful_reset_changes_password_and_rotates_code(self):
        """A successful reset must update both credentials atomically."""

        response = self.reset_password()

        self.assertEqual(
            response.status_code,
            200,
        )

        self.assertEqual(
            response.headers["Cache-Control"],
            "no-store",
        )

        result = response.get_json()

        self.assertEqual(
            result["message"],
            "Password reset successfully.",
        )

        new_recovery_code = result["recovery_code"]

        self.assertEqual(
            len(new_recovery_code),
            6,
        )

        self.assertNotEqual(
            new_recovery_code,
            OLD_RECOVERY_CODE,
        )

        user = self.get_user()

        # The password must be updated.
        self.assertTrue(
            user.check_password(NEW_PASSWORD)
        )

        self.assertFalse(
            user.check_password(OLD_PASSWORD)
        )

        # Only the replacement recovery-code hash is stored.
        self.assertNotEqual(
            user.recovery_code_hash,
            new_recovery_code,
        )

        self.assertFalse(
            verify_recovery_code(
                OLD_RECOVERY_CODE,
                user.recovery_code_hash,
            )
        )

        self.assertTrue(
            verify_recovery_code(
                new_recovery_code,
                user.recovery_code_hash,
            )
        )

        self.assertIsNotNone(
            user.credentials_changed_at
        )

        self.assertEqual(
            user.recovery_failed_attempts,
            0,
        )

        self.assertIsNone(
            user.recovery_locked_until
        )

        # The reset must not automatically log in the user.
        self.assertEqual(
            self.client.get("/api/auth/me").status_code,
            401,
        )

        # The old recovery code must not be reusable.
        repeated_reset = self.reset_password()

        self.assertEqual(
            repeated_reset.status_code,
            400,
        )

        # The old password must fail.
        fresh_client = self.app.test_client()

        self.assertEqual(
            self.login(
                fresh_client,
                OLD_PASSWORD,
            ).status_code,
            401,
        )

        # The new password must work.
        self.assertEqual(
            self.login(
                fresh_client,
                NEW_PASSWORD,
            ).status_code,
            200,
        )

    def test_password_reset_invalidates_existing_sessions(self):
        """Previously authenticated devices must lose access."""

        device_a = self.app.test_client()
        device_b = self.app.test_client()

        self.assertEqual(
            self.login(device_a, OLD_PASSWORD).status_code,
            200,
        )

        self.assertEqual(
            self.login(device_b, OLD_PASSWORD).status_code,
            200,
        )

        self.assertEqual(
            device_a.get("/api/auth/me").status_code,
            200,
        )

        self.assertEqual(
            device_b.get("/api/auth/me").status_code,
            200,
        )

        # Reset the password from a separate client.
        result = self.reset_password()

        self.assertEqual(
            result.status_code,
            200,
        )

        # Both older sessions must now be invalid.
        self.assertEqual(
            device_a.get("/api/auth/me").status_code,
            401,
        )

        self.assertEqual(
            device_b.get("/api/auth/me").status_code,
            401,
        )

    def test_wrong_code_and_unknown_account_return_generic_error(self):
        """Invalid recovery details must not disclose account existence."""

        wrong_code = self.reset_password(
            code=INVALID_RECOVERY_CODE
        )

        unknown_account = self.reset_password(
            email="unknown@example.test"
        )

        self.assertEqual(
            wrong_code.status_code,
            400,
        )

        self.assertEqual(
            unknown_account.status_code,
            400,
        )

        self.assertEqual(
            wrong_code.get_json(),
            GENERIC_ERROR,
        )

        self.assertEqual(
            unknown_account.get_json(),
            GENERIC_ERROR,
        )

        # Incorrect recovery details must not change the password.
        self.assertTrue(
            self.get_user().check_password(OLD_PASSWORD)
        )

        self.assertIsNone(
            self.get_user().credentials_changed_at
        )

    def test_five_wrong_codes_block_password_reset(self):
        """Recovery lockouts must also apply to the reset endpoint."""

        for _ in range(5):
            response = self.reset_password(
                code=INVALID_RECOVERY_CODE
            )

            self.assertEqual(
                response.status_code,
                400,
            )

        user = self.get_user()

        self.assertEqual(
            user.recovery_failed_attempts,
            5,
        )

        self.assertIsNotNone(
            user.recovery_locked_until
        )

        # Even the valid code must be rejected during lockout.
        valid_code_during_lockout = self.reset_password()

        self.assertEqual(
            valid_code_during_lockout.status_code,
            400,
        )

        self.assertEqual(
            valid_code_during_lockout.get_json(),
            GENERIC_ERROR,
        )

        # The original password must remain unchanged.
        self.assertTrue(
            self.get_user().check_password(OLD_PASSWORD)
        )

    def test_invalid_password_does_not_change_account(self):
        """Password validation failures must leave credentials unchanged."""

        mismatch = self.reset_password(
            confirm_password="DifferentPassword123!"
        )

        self.assertEqual(
            mismatch.status_code,
            400,
        )

        short_password = self.reset_password(
            new_password="short",
            confirm_password="short",
        )

        self.assertEqual(
            short_password.status_code,
            400,
        )

        same_password = self.reset_password(
            new_password=OLD_PASSWORD,
            confirm_password=OLD_PASSWORD,
        )

        self.assertEqual(
            same_password.status_code,
            400,
        )

        user = self.get_user()

        self.assertTrue(
            user.check_password(OLD_PASSWORD)
        )

        self.assertTrue(
            verify_recovery_code(
                OLD_RECOVERY_CODE,
                user.recovery_code_hash,
            )
        )

        self.assertIsNone(
            user.credentials_changed_at
        )

    def test_csrf_and_request_validation(self):
        """Reset requests must reject missing CSRF and malformed bodies."""

        payload = {
            "email": TEST_EMAIL,
            "name": TEST_NAME,
            "recoveryCode": OLD_RECOVERY_CODE,
            "newPassword": NEW_PASSWORD,
            "confirmPassword": NEW_PASSWORD,
        }

        without_csrf = self.client.post(
            "/api/auth/recovery/reset",
            json=payload,
        )

        self.assertEqual(
            without_csrf.status_code,
            403,
        )

        csrf_token = self.get_csrf_token(
            self.client
        )

        invalid_body = self.client.post(
            "/api/auth/recovery/reset",
            json=[],
            headers={
                "X-CSRF-Token": csrf_token,
            },
        )

        self.assertEqual(
            invalid_body.status_code,
            400,
        )

        self.assertEqual(
            invalid_body.get_json(),
            GENERIC_ERROR,
        )

        self.assertTrue(
            self.get_user().check_password(OLD_PASSWORD)
        )

    def test_database_failure_rolls_back_entire_reset(self):
        """A failed commit must not partially update account credentials."""

        # Simulate a database commit failure during the reset.
        with patch.object(
            db.session,
            "commit",
            side_effect=SQLAlchemyError("Simulated commit failure"),
        ):
            response = self.reset_password()

        self.assertEqual(
            response.status_code,
            503,
        )

        self.assertEqual(
            response.headers["Cache-Control"],
            "no-store",
        )

        user = self.get_user()

        # The original password must remain valid.
        self.assertTrue(
            user.check_password(OLD_PASSWORD)
        )

        self.assertFalse(
            user.check_password(NEW_PASSWORD)
        )

        # The original recovery code must remain valid.
        self.assertTrue(
            verify_recovery_code(
                OLD_RECOVERY_CODE,
                user.recovery_code_hash,
            )
        )

        # No credential-change timestamp should be stored.
        self.assertIsNone(
            user.credentials_changed_at
        )


if __name__ == "__main__":
    unittest.main()