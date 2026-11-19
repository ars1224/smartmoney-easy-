import unittest
from unittest.mock import patch

from config import Config
from app import create_app
from app.extensions import db
from app.models import User


class ThinkerTests(unittest.TestCase):

    def setUp(self):
        # Create the application using an isolated SQLite database.
        with patch.object(
            Config,
            "SQLALCHEMY_DATABASE_URI",
            "sqlite:///:memory:"
        ), patch.object(
            Config,
            "SECRET_KEY",
            "thinker-test-only"
        ):
            self.app = create_app()

        self.app.config.update(
            THINKER_MODE="demo",
            OPENAI_API_KEY=""
        )

        # Activate the application context.
        self.app_context = self.app.app_context()
        self.app_context.push()

        # Prevent tests from modifying a real PostgreSQL database.
        database_url = db.engine.url

        if (
            not database_url.drivername.startswith("sqlite")
            or database_url.database != ":memory:"
        ):
            self.app_context.pop()

            raise RuntimeError(
                "Thinker tests require an in-memory SQLite database."
            )

        # Create isolated database tables.
        db.create_all()

        # Create a synthetic user for authentication tests.
        test_user = User(
            name="Thinker Test User",
            email="thinker-test@example.test"
        )

        test_user.set_password("ThinkerTestPassword123!")

        db.session.add(test_user)
        db.session.commit()

        self.test_user_id = test_user.id

        # Create the Flask test client.
        self.client = self.app.test_client()

        # Authenticate using the actual synthetic user's ID.
        with self.client.session_transaction() as session:
            session["user_id"] = self.test_user_id
            session["csrf_token"] = "test-csrf"

    def tearDown(self):
        # Clean up the isolated database after each test.
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def send(self, message):
        # Send an authenticated request to Thinker.
        return self.client.post(
            "/api/thinker/messages",
            json={
                "message": message
            },
            headers={
                "X-CSRF-Token": "test-csrf"
            }
        )

    def test_topics_are_explicit_demo_and_do_not_echo_personal_input(self):
        questions = [
            ("budget", "Build a simple budget"),
            ("saving", "Plan a savings goal"),
            ("spending", "Understand your spending")
        ]

        for question, title in questions:
            reply = self.send(question)

            self.assertEqual(reply.status_code, 200)
            self.assertEqual(reply.json["mode"], "demo")
            self.assertEqual(reply.json["title"], title)
            self.assertTrue(reply.json["takeaway"])

            self.assertIn(
                "no-store",
                reply.headers["Cache-Control"]
            )

        # Ensure sensitive user input is not repeated.
        reply = self.send("my secret account is 12345")

        self.assertNotIn(
            "12345",
            reply.get_data(as_text=True)
        )

        self.assertIn(
            "cannot answer",
            reply.json["message"]
        )

    def test_requires_session_and_csrf(self):
        # Requests without a CSRF token must be rejected.
        response = self.client.post(
            "/api/thinker/messages",
            json={
                "message": "budget"
            }
        )

        self.assertEqual(response.status_code, 403)

        # Remove authentication from the test session.
        with self.client.session_transaction() as session:
            session.pop("user_id", None)

        # An unauthenticated request must be rejected.
        response = self.send("budget")

        self.assertEqual(response.status_code, 401)

    def test_rejects_invalid_messages(self):
        invalid_messages = [
            "",
            "   ",
            None,
            {},
            123,
            "x" * 601
        ]

        for value in invalid_messages:
            response = self.send(value)

            self.assertEqual(response.status_code, 400)

        # Reject requests containing a JSON array.
        response = self.client.post(
            "/api/thinker/messages",
            json=[],
            headers={
                "X-CSRF-Token": "test-csrf"
            }
        )

        self.assertEqual(response.status_code, 400)

        # Reject excessively large messages.
        response = self.send("x" * 9000)

        self.assertEqual(response.status_code, 413)

    def test_live_mode_is_unavailable_not_paid_fallback(self):
        # Live mode must not silently fall back to a paid provider.
        self.app.config["THINKER_MODE"] = "live"

        response = self.send("budget")

        self.assertEqual(response.status_code, 503)