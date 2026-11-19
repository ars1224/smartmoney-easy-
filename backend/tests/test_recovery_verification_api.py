"""Integration tests for the account recovery verification API.

Run from the backend directory:

    python -m pytest tests/test_recovery_verification_api.py -v

Uses an isolated in-memory SQLite database.
No PostgreSQL writes or external API requests are performed.
"""

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app import create_app
from app.extensions import db
from app.models import User
from app.services.recovery_codes import hash_recovery_code
from config import Config


TEST_EMAIL = "recovery-api@example.test"
TEST_NAME = "Recovery API User"

VALID_CODE = "ABCD23"
INVALID_CODE = "AAAAAA"

GENERIC_ERROR = {
    "error": (
        "Unable to verify recovery details. "
        "Check your information or try again later."
    )
}


class RecoveryVerificationApiTests(unittest.TestCase):

    def setUp(self):
        with patch.object(
            Config,
            "SQLALCHEMY_DATABASE_URI",
            "sqlite:///:memory:",
        ), patch.object(
            Config,
            "SECRET_KEY",
            "recovery-verification-api-test-only",
        ):
            self.app = create_app()

        self.app.config["TESTING"] = True

        self.app_context = self.app.app_context()
        self.app_context.push()

        # Prevent these tests from modifying PostgreSQL.
        database_url = db.engine.url

        if (
            not database_url.drivername.startswith("sqlite")
            or database_url.database != ":memory:"
        ):
            self.app_context.pop()

            raise RuntimeError(
                "Recovery verification API tests require "
                "an in-memory SQLite database."
            )

        db.create_all()

        test_user = User(
            name=TEST_NAME,
            email=TEST_EMAIL,
        )

        test_user.set_password(
            "RecoveryApiPassword123!"
        )

        test_user.recovery_code_hash = hash_recovery_code(
            VALID_CODE
        )

        db.session.add(test_user)
        db.session.commit()

        self.test_user_id = test_user.id

        self.client = self.app.test_client()

        # Obtain a valid CSRF token from the actual endpoint.
        csrf_response = self.client.get(
            "/api/auth/csrf"
        )

        self.assertEqual(
            csrf_response.status_code,
            200,
        )

        self.csrf_token = csrf_response.get_json()["csrf_token"]

    def tearDown(self):
        db.session.remove()
        db.drop_all()

        self.app_context.pop()

    def get_user(self):
        return db.session.get(
            User,
            self.test_user_id,
        )

    def verify(
        self,
        code=VALID_CODE,
        *,
        email=TEST_EMAIL,
        name=TEST_NAME,
    ):
        """Submit recovery details through the actual Flask endpoint."""

        return self.client.post(
            "/api/auth/recovery/verify",
            json={
                "email": email,
                "name": name,
                "recoveryCode": code,
            },
            headers={
                "X-CSRF-Token": self.csrf_token,
            },
        )

    def test_successful_verification_does_not_authenticate_user(self):
        """Successful verification must not create a login session."""

        response = self.verify()

        self.assertEqual(
            response.status_code,
            200,
        )

        self.assertEqual(
            response.get_json(),
            {"verified": True},
        )

        self.assertEqual(
            response.headers["Cache-Control"],
            "no-store",
        )

        # The recovery code must not appear in the response.
        self.assertNotIn(
            VALID_CODE,
            response.get_data(as_text=True),
        )

        # Verification must not automatically log in the user.
        self.assertEqual(
            self.client.get("/api/auth/me").status_code,
            401,
        )

        with self.client.session_transaction() as session:
            self.assertNotIn(
                "user_id",
                session,
            )

    def test_invalid_account_details_return_same_generic_error(self):
        """Wrong codes, names, and emails must share a public error."""

        wrong_code = self.verify(
            INVALID_CODE
        )

        wrong_name = self.verify(
            VALID_CODE,
            name="Incorrect Name",
        )

        unknown_email = self.verify(
            VALID_CODE,
            email="unknown@example.test",
        )

        for response in [
            wrong_code,
            wrong_name,
            unknown_email,
        ]:
            self.assertEqual(
                response.status_code,
                400,
            )

            self.assertEqual(
                response.get_json(),
                GENERIC_ERROR,
            )

            self.assertEqual(
                response.headers["Cache-Control"],
                "no-store",
            )

        # Only attempts against the existing account are counted.
        self.assertEqual(
            self.get_user().recovery_failed_attempts,
            2,
        )

    def test_missing_or_incorrect_csrf_is_rejected(self):
        """Recovery verification must require a valid CSRF token."""

        payload = {
            "email": TEST_EMAIL,
            "name": TEST_NAME,
            "recoveryCode": VALID_CODE,
        }

        missing_csrf = self.client.post(
            "/api/auth/recovery/verify",
            json=payload,
        )

        self.assertEqual(
            missing_csrf.status_code,
            403,
        )

        incorrect_csrf = self.client.post(
            "/api/auth/recovery/verify",
            json=payload,
            headers={
                "X-CSRF-Token": "incorrect-token",
            },
        )

        self.assertEqual(
            incorrect_csrf.status_code,
            403,
        )

        # Rejected CSRF requests must not modify recovery counters.
        self.assertEqual(
            self.get_user().recovery_failed_attempts,
            0,
        )

    def test_invalid_request_bodies_are_rejected(self):
        """Malformed recovery requests must fail safely."""

        invalid_payloads = [
            None,
            [],
            "invalid",
            {},
            {
                "email": TEST_EMAIL,
                "name": TEST_NAME,
            },
            {
                "email": TEST_EMAIL,
                "name": TEST_NAME,
                "recoveryCode": 12345,
            },
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=payload):

                response = self.client.post(
                    "/api/auth/recovery/verify",
                    json=payload,
                    headers={
                        "X-CSRF-Token": self.csrf_token,
                    },
                )

                self.assertEqual(
                    response.status_code,
                    400,
                )

                self.assertEqual(
                    response.get_json(),
                    GENERIC_ERROR,
                )

                self.assertEqual(
                    response.headers["Cache-Control"],
                    "no-store",
                )

        self.assertEqual(
            self.get_user().recovery_failed_attempts,
            0,
        )

    def test_five_failures_lock_recovery_verification(self):
        """Five incorrect attempts must block even the correct code."""

        for attempt_number in range(1, 6):
            response = self.verify(
                INVALID_CODE
            )

            self.assertEqual(
                response.status_code,
                400,
            )

            self.assertEqual(
                self.get_user().recovery_failed_attempts,
                attempt_number,
            )

        user = self.get_user()

        self.assertIsNotNone(
            user.recovery_locked_until
        )

        # The correct code must not bypass the active lockout.
        correct_code_during_lockout = self.verify(
            VALID_CODE
        )

        self.assertEqual(
            correct_code_during_lockout.status_code,
            400,
        )

        self.assertEqual(
            correct_code_during_lockout.get_json(),
            GENERIC_ERROR,
        )

        self.assertEqual(
            self.get_user().recovery_failed_attempts,
            5,
        )

    def test_expired_lockout_allows_verification(self):
        """An expired recovery lockout must permit valid verification."""

        user = self.get_user()

        user.recovery_failed_attempts = 5

        user.recovery_locked_until = (
            datetime.now(timezone.utc)
            - timedelta(seconds=1)
        )

        db.session.commit()

        response = self.verify(
            VALID_CODE
        )

        self.assertEqual(
            response.status_code,
            200,
        )

        self.assertEqual(
            response.get_json(),
            {"verified": True},
        )

        user = self.get_user()

        self.assertEqual(
            user.recovery_failed_attempts,
            0,
        )

        self.assertIsNone(
            user.recovery_locked_until
        )

    def test_successful_verification_resets_failed_attempts(self):
        """Successful verification must clear previous failures."""

        self.verify(INVALID_CODE)
        self.verify(INVALID_CODE)
        self.verify(INVALID_CODE)

        self.assertEqual(
            self.get_user().recovery_failed_attempts,
            3,
        )

        response = self.verify(
            VALID_CODE
        )

        self.assertEqual(
            response.status_code,
            200,
        )

        user = self.get_user()

        self.assertEqual(
            user.recovery_failed_attempts,
            0,
        )

        self.assertIsNone(
            user.recovery_locked_until
        )


if __name__ == "__main__":
    unittest.main()