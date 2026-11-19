import unittest
from unittest.mock import patch

from config import Config
from app import create_app
from app.extensions import db
from app.models import User
from app.services.recovery_codes import verify_recovery_code


class RecoveryRegistrationTests(unittest.TestCase):

    def setUp(self):
        # Configure an isolated in-memory SQLite database.
        with patch.object(
            Config,
            "SQLALCHEMY_DATABASE_URI",
            "sqlite:///:memory:"
        ), patch.object(
            Config,
            "SECRET_KEY",
            "recovery-registration-test-only"
        ):
            self.app = create_app()

        self.app.config.update(TESTING=True)

        self.app_context = self.app.app_context()
        self.app_context.push()

        # Safety guard: never create or remove tables in PostgreSQL.
        database_url = db.engine.url

        if (
            not database_url.drivername.startswith("sqlite")
            or database_url.database != ":memory:"
        ):
            self.app_context.pop()
            raise RuntimeError(
                "Recovery tests require an in-memory SQLite database."
            )

        db.create_all()
        self.client = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def test_registration_creates_hashed_recovery_code(self):

        # Obtain a valid CSRF token.
        csrf_response = self.client.get("/api/auth/csrf")

        self.assertEqual(csrf_response.status_code, 200)

        csrf_token = csrf_response.get_json()["csrf_token"]

        # Register a synthetic test account.
        response = self.client.post(
            "/api/auth/register",
            json={
                "name": "Recovery Test User",
                "email": "qa-recovery@example.test",
                "password": "TestPassword12345!"
            },
            headers={
                "X-CSRF-Token": csrf_token
            }
        )

        self.assertEqual(response.status_code, 201)

        response_data = response.get_json()
        recovery_code = response_data["recovery_code"]

        # Verify the generated code format.
        self.assertIsInstance(recovery_code, str)
        self.assertRegex(
            recovery_code,
            r"^[A-HJ-NP-Z2-9]{6}$"
        )

        # Retrieve the user from the isolated database.
        user = User.query.filter_by(
            email="qa-recovery@example.test"
        ).first()

        self.assertIsNotNone(user)

        # The database must contain only the hashed code.
        self.assertIsNotNone(user.recovery_code_hash)
        self.assertNotEqual(
            user.recovery_code_hash,
            recovery_code
        )

        # The correct recovery code must verify.
        self.assertTrue(
            verify_recovery_code(
                recovery_code,
                user.recovery_code_hash
            )
        )

        # A different valid code must not verify.
        wrong_first_character = (
            "A" if recovery_code[0] != "A" else "B"
        )

        incorrect_code = (
            wrong_first_character + recovery_code[1:]
        )

        self.assertFalse(
            verify_recovery_code(
                incorrect_code,
                user.recovery_code_hash
            )
        )

        # Public user information must not expose recovery data.
        public_user = response_data["user"]

        self.assertNotIn("recovery_code", public_user)
        self.assertNotIn("recovery_code_hash", public_user)

        # An authenticated profile response must not reveal the code.
        profile_response = self.client.get("/api/auth/me")

        self.assertEqual(profile_response.status_code, 200)
        self.assertNotIn(
            "recovery_code",
            profile_response.get_data(as_text=True)
        )
        self.assertNotIn(
            recovery_code,
            profile_response.get_data(as_text=True)
        )


if __name__ == "__main__":
    unittest.main()