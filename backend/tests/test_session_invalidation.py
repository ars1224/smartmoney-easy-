"""Regression tests for authentication session invalidation.

Run from the backend directory:

    python -m pytest tests/test_session_invalidation.py -v

These tests use an isolated in-memory SQLite database.
They do not modify PostgreSQL or make external API requests.
"""

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app import create_app
from app.extensions import db
from app.models import User
from config import Config


CREDENTIAL_CHANGE_TIME = datetime(
    2026,
    11,
    18,
    12,
    0,
    0,
    tzinfo=timezone.utc,
)


class SessionInvalidationTests(unittest.TestCase):

    def setUp(self):
        # Create an isolated test application.
        with patch.object(
            Config,
            "SQLALCHEMY_DATABASE_URI",
            "sqlite:///:memory:",
        ), patch.object(
            Config,
            "SECRET_KEY",
            "session-invalidation-test-only",
        ):
            self.app = create_app()

        self.app.config["TESTING"] = True

        self.app_context = self.app.app_context()
        self.app_context.push()

        # Prevent accidental writes to PostgreSQL.
        database_url = db.engine.url

        if (
            not database_url.drivername.startswith("sqlite")
            or database_url.database != ":memory:"
        ):
            self.app_context.pop()

            raise RuntimeError(
                "Session invalidation tests require "
                "an in-memory SQLite database."
            )

        db.create_all()

        # Create a real synthetic user.
        test_user = User(
            name="Session Test User",
            email="session-test@example.test",
        )

        test_user.set_password(
            "SessionTestPassword123!"
        )

        db.session.add(test_user)
        db.session.commit()

        self.test_user_id = test_user.id

        # Create a Flask test client.
        self.client = self.app.test_client()

        # Simulate an authenticated session.
        self.set_session_timestamp(
            CREDENTIAL_CHANGE_TIME.isoformat()
        )

    def tearDown(self):
        # Clean up the isolated test database.
        db.session.remove()
        db.drop_all()

        self.app_context.pop()

    def set_session_timestamp(self, timestamp):
        """Create a signed test session with a chosen timestamp."""

        with self.client.session_transaction() as session:
            session.clear()

            session["user_id"] = self.test_user_id

            if timestamp is not None:
                session["authenticated_at"] = timestamp

    def mark_credentials_changed(self):
        """Simulate a completed password reset."""

        user = db.session.get(
            User,
            self.test_user_id,
        )

        user.credentials_changed_at = CREDENTIAL_CHANGE_TIME

        db.session.commit()

    def test_session_without_previous_password_reset_remains_valid(self):
        """Existing sessions remain valid before credentials change."""

        # Simulate a legacy session without an authentication timestamp.
        self.set_session_timestamp(None)

        response = self.client.get(
            "/api/auth/me"
        )

        self.assertEqual(
            response.status_code,
            200,
        )

        self.assertEqual(
            response.get_json()["user"]["id"],
            self.test_user_id,
        )

    def test_session_created_before_password_reset_is_rejected(self):
        """Sessions older than the credential change must be rejected."""

        self.mark_credentials_changed()

        old_timestamp = (
            CREDENTIAL_CHANGE_TIME - timedelta(seconds=1)
        ).isoformat()

        self.set_session_timestamp(
            old_timestamp
        )

        response = self.client.get(
            "/api/auth/me"
        )

        self.assertEqual(
            response.status_code,
            401,
        )

        # The invalid session should be cleared.
        with self.client.session_transaction() as session:
            self.assertNotIn(
                "user_id",
                session,
            )

    def test_session_created_at_password_reset_time_is_rejected(self):
        """A session timestamp equal to the reset time is invalid."""

        self.mark_credentials_changed()

        self.set_session_timestamp(
            CREDENTIAL_CHANGE_TIME.isoformat()
        )

        response = self.client.get(
            "/api/auth/me"
        )

        self.assertEqual(
            response.status_code,
            401,
        )

    def test_session_created_after_password_reset_remains_valid(self):
        """A new session created after the reset should work."""

        self.mark_credentials_changed()

        new_timestamp = (
            CREDENTIAL_CHANGE_TIME + timedelta(seconds=1)
        ).isoformat()

        self.set_session_timestamp(
            new_timestamp
        )

        response = self.client.get(
            "/api/auth/me"
        )

        self.assertEqual(
            response.status_code,
            200,
        )

        self.assertEqual(
            response.get_json()["user"]["id"],
            self.test_user_id,
        )

    def test_invalid_authentication_timestamps_are_rejected(self):
        """Missing, malformed, and timezone-naive timestamps are invalid."""

        self.mark_credentials_changed()

        invalid_timestamps = [
            None,
            "",
            "invalid-timestamp",
            "2026-11-18T12:30:00",
            12345,
        ]

        for timestamp in invalid_timestamps:
            with self.subTest(timestamp=timestamp):

                self.set_session_timestamp(
                    timestamp
                )

                response = self.client.get(
                    "/api/auth/me"
                )

                self.assertEqual(
                    response.status_code,
                    401,
                )

                with self.client.session_transaction() as session:
                    self.assertNotIn(
                        "user_id",
                        session,
                    )

    def test_timezone_offsets_are_normalised_correctly(self):
        """Equivalent timestamps in different timezones must work."""

        self.mark_credentials_changed()

        # 1:00:01 AM NZDT is 12:00:01 PM UTC on the previous day.
        self.set_session_timestamp(
            "2026-11-19T01:00:01+13:00"
        )

        response = self.client.get(
            "/api/auth/me"
        )

        self.assertEqual(
            response.status_code,
            200,
        )

    def test_session_for_deleted_user_is_rejected(self):
        """Sessions belonging to nonexistent users must be rejected."""

        user = db.session.get(
            User,
            self.test_user_id,
        )

        db.session.delete(user)
        db.session.commit()

        response = self.client.get(
            "/api/auth/me"
        )

        self.assertEqual(
            response.status_code,
            401,
        )

        with self.client.session_transaction() as session:
            self.assertNotIn(
                "user_id",
                session,
            )


if __name__ == "__main__":
    unittest.main()