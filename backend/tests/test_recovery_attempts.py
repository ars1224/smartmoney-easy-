"""Regression tests for account recovery attempt security.

Run from the backend directory:

    python -m pytest tests/test_recovery_attempts.py -v

Tests use an isolated in-memory SQLite database.
No PostgreSQL writes or external requests are performed.
"""

import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app import create_app
from app.extensions import db
from app.models import User
from app.services.recovery_attempts import check_recovery_attempt
from app.services.recovery_codes import hash_recovery_code
from config import Config


VALID_RECOVERY_CODE = "ABCD23"
INVALID_RECOVERY_CODE = "AAAAAA"

TEST_EMAIL = "recovery-attempts@example.test"
TEST_NAME = "Recovery Test User"

START_TIME = datetime(
    2026,
    11,
    18,
    12,
    0,
    0,
    tzinfo=timezone.utc,
)


class RecoveryAttemptTests(unittest.TestCase):

    def setUp(self):
        with patch.object(
            Config,
            "SQLALCHEMY_DATABASE_URI",
            "sqlite:///:memory:",
        ), patch.object(
            Config,
            "SECRET_KEY",
            "recovery-attempt-test-only",
        ):
            self.app = create_app()

        self.app.config["TESTING"] = True

        self.app_context = self.app.app_context()
        self.app_context.push()

        # Ensure the tests cannot modify PostgreSQL.
        database_url = db.engine.url

        if (
            not database_url.drivername.startswith("sqlite")
            or database_url.database != ":memory:"
        ):
            self.app_context.pop()

            raise RuntimeError(
                "Recovery attempt tests require "
                "an in-memory SQLite database."
            )

        db.create_all()

        test_user = User(
            name=TEST_NAME,
            email=TEST_EMAIL,
        )

        test_user.set_password(
            "RecoveryTestPassword123!"
        )

        test_user.recovery_code_hash = hash_recovery_code(
            VALID_RECOVERY_CODE
        )

        db.session.add(test_user)
        db.session.commit()

        self.test_user_id = test_user.id

    def tearDown(self):
        db.session.remove()
        db.drop_all()

        self.app_context.pop()

    def get_user(self):
        """Retrieve the synthetic test user."""

        return db.session.get(
            User,
            self.test_user_id,
        )

    def attempt_recovery(
        self,
        code,
        *,
        name=TEST_NAME,
        email=TEST_EMAIL,
        now=START_TIME,
    ):
        """Perform a recovery attempt and commit its counter changes."""

        user = check_recovery_attempt(
            email,
            name,
            code,
            now=now,
        )

        # The API routes will also commit these counter changes.
        db.session.commit()

        return user

    def make_failed_attempts(self, count=5):
        """Perform a specified number of incorrect recovery attempts."""

        for _ in range(count):
            result = self.attempt_recovery(
                INVALID_RECOVERY_CODE
            )

            self.assertIsNone(result)

    def test_correct_recovery_code_is_accepted(self):
        """Correct recovery credentials should identify the user."""

        result = self.attempt_recovery(
            VALID_RECOVERY_CODE
        )

        self.assertIsNotNone(result)

        self.assertEqual(
            result.id,
            self.test_user_id,
        )

        user = self.get_user()

        self.assertEqual(
            user.recovery_failed_attempts,
            0,
        )

        self.assertIsNone(
            user.recovery_locked_until
        )

    def test_fifth_failed_attempt_triggers_fifteen_minute_lockout(self):
        """Exactly five incorrect attempts must trigger a lockout."""

        self.make_failed_attempts(4)

        user = self.get_user()

        self.assertEqual(
            user.recovery_failed_attempts,
            4,
        )

        self.assertIsNone(
            user.recovery_locked_until
        )

        # The fifth failed attempt should activate the lockout.
        result = self.attempt_recovery(
            INVALID_RECOVERY_CODE
        )

        self.assertIsNone(result)

        user = self.get_user()

        self.assertEqual(
            user.recovery_failed_attempts,
            5,
        )

        self.assertIsNotNone(
            user.recovery_locked_until
        )

        # SQLite may return a timezone-naive datetime.
        locked_until = user.recovery_locked_until

        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(
                tzinfo=timezone.utc
            )

        self.assertEqual(
            locked_until,
            START_TIME + timedelta(minutes=15),
        )

    def test_correct_code_cannot_bypass_active_lockout(self):
        """A valid code must fail while recovery is locked."""

        self.make_failed_attempts(5)

        # Try the correct code one minute after lockout begins.
        result = self.attempt_recovery(
            VALID_RECOVERY_CODE,
            now=START_TIME + timedelta(minutes=1),
        )

        self.assertIsNone(result)

        user = self.get_user()

        self.assertEqual(
            user.recovery_failed_attempts,
            5,
        )

        self.assertIsNotNone(
            user.recovery_locked_until
        )

    def test_correct_code_works_after_lockout_expires(self):
        """Recovery must become available after 15 minutes."""

        self.make_failed_attempts(5)

        # Simulate the exact moment the lockout expires.
        result = self.attempt_recovery(
            VALID_RECOVERY_CODE,
            now=START_TIME + timedelta(minutes=15),
        )

        self.assertIsNotNone(result)

        self.assertEqual(
            result.id,
            self.test_user_id,
        )

        user = self.get_user()

        self.assertEqual(
            user.recovery_failed_attempts,
            0,
        )

        self.assertIsNone(
            user.recovery_locked_until
        )

    def test_failed_attempt_after_lockout_starts_new_counter(self):
        """An expired lockout must reset the failed-attempt counter."""

        self.make_failed_attempts(5)

        result = self.attempt_recovery(
            INVALID_RECOVERY_CODE,
            now=START_TIME + timedelta(minutes=16),
        )

        self.assertIsNone(result)

        user = self.get_user()

        self.assertEqual(
            user.recovery_failed_attempts,
            1,
        )

        self.assertIsNone(
            user.recovery_locked_until
        )

    def test_wrong_name_is_rejected_and_counted(self):
        """A correct code with the wrong name must fail."""

        result = self.attempt_recovery(
            VALID_RECOVERY_CODE,
            name="Incorrect Test Name",
        )

        self.assertIsNone(result)

        user = self.get_user()

        self.assertEqual(
            user.recovery_failed_attempts,
            1,
        )

        # An unknown email must not affect another user's counter.
        unknown_result = self.attempt_recovery(
            INVALID_RECOVERY_CODE,
            email="unknown@example.test",
        )

        self.assertIsNone(unknown_result)

        self.assertEqual(
            self.get_user().recovery_failed_attempts,
            1,
        )

    def test_success_clears_previous_failed_attempts(self):
        """Successful verification must reset earlier failures."""

        self.make_failed_attempts(3)

        self.assertEqual(
            self.get_user().recovery_failed_attempts,
            3,
        )

        result = self.attempt_recovery(
            VALID_RECOVERY_CODE
        )

        self.assertIsNotNone(result)

        self.assertEqual(
            self.get_user().recovery_failed_attempts,
            0,
        )

        # Another incorrect attempt should start from one.
        self.attempt_recovery(
            INVALID_RECOVERY_CODE
        )

        self.assertEqual(
            self.get_user().recovery_failed_attempts,
            1,
        )

    def test_recovery_details_accept_normalised_input(self):
        """Email, name, and recovery code should be normalised."""

        result = self.attempt_recovery(
            VALID_RECOVERY_CODE.lower(),
            name="  RECOVERY TEST USER  ",
            email="  RECOVERY-ATTEMPTS@EXAMPLE.TEST  ",
        )

        self.assertIsNotNone(result)

        self.assertEqual(
            result.id,
            self.test_user_id,
        )


if __name__ == "__main__":
    unittest.main()