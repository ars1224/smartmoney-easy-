"""Integration tests for password changes and session invalidation.

Run from the backend directory:

    python -m pytest tests/test_password_change_sessions.py -v

Uses an isolated in-memory SQLite database.
"""

import unittest
from unittest.mock import patch

from app import create_app
from app.extensions import db
from app.models import User
from config import Config


OLD_PASSWORD = "CurrentPassword123!"
NEW_PASSWORD = "ReplacementPassword456!"


class PasswordChangeSessionTests(unittest.TestCase):

    def setUp(self):
        with patch.object(
            Config,
            "SQLALCHEMY_DATABASE_URI",
            "sqlite:///:memory:",
        ), patch.object(
            Config,
            "SECRET_KEY",
            "password-change-test-only",
        ):
            self.app = create_app()

        self.app.config["TESTING"] = True

        self.app_context = self.app.app_context()
        self.app_context.push()

        # Verify that PostgreSQL cannot be modified by these tests.
        database_url = db.engine.url

        if (
            not database_url.drivername.startswith("sqlite")
            or database_url.database != ":memory:"
        ):
            self.app_context.pop()

            raise RuntimeError(
                "Password change tests require "
                "an in-memory SQLite database."
            )

        db.create_all()

        test_user = User(
            name="Password Change Test User",
            email="password-change@example.test",
        )

        test_user.set_password(OLD_PASSWORD)

        db.session.add(test_user)
        db.session.commit()

        self.test_user_id = test_user.id

        # Two clients simulate two independent browsers or devices.
        self.device_a = self.app.test_client()
        self.device_b = self.app.test_client()

    def tearDown(self):
        db.session.remove()
        db.drop_all()

        self.app_context.pop()

    def login(self, client, password):
        """Log in using the actual authentication endpoint."""

        csrf_response = client.get(
            "/api/auth/csrf"
        )

        self.assertEqual(
            csrf_response.status_code,
            200,
        )

        csrf_token = csrf_response.get_json()["csrf_token"]

        return client.post(
            "/api/auth/login",
            json={
                "email": "password-change@example.test",
                "password": password,
            },
            headers={
                "X-CSRF-Token": csrf_token,
            },
        )

    def change_password(
        self,
        client,
        csrf_token,
        current_password,
        new_password,
    ):
        """Change the password through the protected endpoint."""

        return client.post(
            "/api/auth/change-password",
            json={
                "currentPassword": current_password,
                "newPassword": new_password,
            },
            headers={
                "X-CSRF-Token": csrf_token,
            },
        )

    def test_password_change_invalidates_other_device(self):
        # Log in from both devices.
        login_a = self.login(
            self.device_a,
            OLD_PASSWORD,
        )

        login_b = self.login(
            self.device_b,
            OLD_PASSWORD,
        )

        self.assertEqual(
            login_a.status_code,
            200,
        )

        self.assertEqual(
            login_b.status_code,
            200,
        )

        # Both sessions should initially work.
        self.assertEqual(
            self.device_a.get("/api/auth/me").status_code,
            200,
        )

        self.assertEqual(
            self.device_b.get("/api/auth/me").status_code,
            200,
        )

        # Change the password from Device A.
        result = self.change_password(
            self.device_a,
            login_a.get_json()["csrf_token"],
            OLD_PASSWORD,
            NEW_PASSWORD,
        )

        self.assertEqual(
            result.status_code,
            200,
        )

        # Device A must remain authenticated.
        self.assertEqual(
            self.device_a.get("/api/auth/me").status_code,
            200,
        )

        # Device B's older session must be rejected.
        self.assertEqual(
            self.device_b.get("/api/auth/me").status_code,
            401,
        )

        # Verify that the database contains the new password hash.
        user = db.session.get(
            User,
            self.test_user_id,
        )

        self.assertIsNotNone(
            user.credentials_changed_at
        )

        self.assertTrue(
            user.check_password(NEW_PASSWORD)
        )

        self.assertFalse(
            user.check_password(OLD_PASSWORD)
        )

        # A new device cannot log in using the old password.
        new_device = self.app.test_client()

        old_login = self.login(
            new_device,
            OLD_PASSWORD,
        )

        self.assertEqual(
            old_login.status_code,
            401,
        )

        # The new password must allow a fresh login.
        new_login = self.login(
            new_device,
            NEW_PASSWORD,
        )

        self.assertEqual(
            new_login.status_code,
            200,
        )

    def test_failed_password_change_does_not_invalidate_sessions(self):
        # Log in on both devices.
        login_a = self.login(
            self.device_a,
            OLD_PASSWORD,
        )

        login_b = self.login(
            self.device_b,
            OLD_PASSWORD,
        )

        self.assertEqual(
            login_a.status_code,
            200,
        )

        self.assertEqual(
            login_b.status_code,
            200,
        )

        # Attempt a password change with an incorrect current password.
        result = self.change_password(
            self.device_a,
            login_a.get_json()["csrf_token"],
            "IncorrectCurrentPassword123!",
            NEW_PASSWORD,
        )

        self.assertEqual(
            result.status_code,
            400,
        )

        # Both existing sessions must remain valid.
        self.assertEqual(
            self.device_a.get("/api/auth/me").status_code,
            200,
        )

        self.assertEqual(
            self.device_b.get("/api/auth/me").status_code,
            200,
        )

        # The password and credential-change timestamp must be unchanged.
        user = db.session.get(
            User,
            self.test_user_id,
        )

        self.assertTrue(
            user.check_password(OLD_PASSWORD)
        )

        self.assertIsNone(
            user.credentials_changed_at
        )


if __name__ == "__main__":
    unittest.main()