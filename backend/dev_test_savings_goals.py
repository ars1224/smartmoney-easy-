
import secrets
import uuid

from sqlalchemy.engine import make_url

from app import create_app
from app.extensions import db
from app.models import User


app = create_app()


def verify(response, expected, description):
    actual = response.status_code

    if actual != expected:
        raise AssertionError(
            f"{description}: expected {expected}, "
            f"got {actual}. Response: {response.get_json()}"
        )

    print(f"PASS: {description} ({actual})")


def authenticated_client(user_id):
    client = app.test_client()
    csrf_token = secrets.token_urlsafe(32)

    with client.session_transaction() as session:
        session["user_id"] = user_id
        session["csrf_token"] = csrf_token

    return client, {
        "X-CSRF-Token": csrf_token
    }


def run_tests():
    # Never run database-writing tests against hosted databases.
    database_url = make_url(
        app.config["SQLALCHEMY_DATABASE_URI"]
    )

    if (
        database_url.host not in ("localhost", "127.0.0.1")
        or database_url.database != "smartmoney_easy"
    ):
        raise RuntimeError(
            "Tests require the local smartmoney_easy database."
        )

    with app.app_context():
        suffix = uuid.uuid4().hex

        user_one = User(
            email=f"savings-owner-{suffix}@example.test"
        )

        user_two = User(
            email=f"savings-other-{suffix}@example.test"
        )

        users = [user_one, user_two]

        db.session.add_all(users)
        db.session.commit()

        try:
            owner, owner_headers = authenticated_client(
                user_one.id
            )

            other, other_headers = authenticated_client(
                user_two.id
            )

            anonymous = app.test_client()

            verify(
                anonymous.get("/api/savings-goals"),
                401,
                "Unauthenticated access blocked",
            )

            response = owner.get("/api/savings-goals")

            verify(
                response,
                200,
                "Retrieve savings goals",
            )

            assert response.get_json()["goals"] == []

            payload = {
                "name": "Emergency Fund",
                "targetAmount": "20000.00",
                "savedAmount": "500.00",
                "targetDate": "2027-12-31",
            }

            verify(
                owner.post(
                    "/api/savings-goals",
                    json=payload,
                ),
                403,
                "Missing CSRF token blocked",
            )

            response = owner.post(
                "/api/savings-goals",
                json=payload,
                headers=owner_headers,
            )

            verify(response, 201, "Create savings goal")

            goal = response.get_json()["goal"]
            goal_id = goal["id"]

            assert goal["savedAmount"] == "500.00"

            verify(
                owner.post(
                    "/api/savings-goals",
                    json={**payload, "targetAmount": "-10"},
                    headers=owner_headers,
                ),
                400,
                "Negative target rejected",
            )

            response = owner.get("/api/savings-goals")

            verify(
                response,
                200,
                "Retrieve saved goal",
            )

            assert response.get_json()["count"] == 1

            response = owner.patch(
                f"/api/savings-goals/{goal_id}",
                json={
                    "name": "Updated Emergency Fund",
                    "targetAmount": "25000.00",
                },
                headers=owner_headers,
            )

            verify(response, 200, "Edit savings goal")

            assert (
                response.get_json()["goal"]["name"]
                == "Updated Emergency Fund"
            )

            response = owner.post(
                f"/api/savings-goals/{goal_id}/contributions",
                json={"amount": "100.00"},
                headers=owner_headers,
            )

            verify(
                response,
                201,
                "Add savings contribution",
            )

            assert (
                response.get_json()["goal"]["savedAmount"]
                == "600.00"
            )

            response = other.get("/api/savings-goals")

            verify(
                response,
                200,
                "Second user can access own goals",
            )

            assert response.get_json()["count"] == 0

            verify(
                other.patch(
                    f"/api/savings-goals/{goal_id}",
                    json={"name": "Unauthorized edit"},
                    headers=other_headers,
                ),
                404,
                "Other user cannot edit goal",
            )

            verify(
                other.post(
                    f"/api/savings-goals/{goal_id}/contributions",
                    json={"amount": "50.00"},
                    headers=other_headers,
                ),
                404,
                "Other user cannot contribute",
            )

            verify(
                other.delete(
                    f"/api/savings-goals/{goal_id}",
                    headers=other_headers,
                ),
                404,
                "Other user cannot delete goal",
            )

            verify(
                owner.delete(
                    f"/api/savings-goals/{goal_id}",
                    headers=owner_headers,
                ),
                200,
                "Delete savings goal",
            )

            response = owner.get("/api/savings-goals")

            assert response.get_json()["count"] == 0

            print("\nALL SAVINGS GOALS API TESTS PASSED")

        finally:
            # Remove only the temporary test users.
            # PostgreSQL cascades delete their goals
            # and contribution records.
            db.session.rollback()

            for user in users:
                record = db.session.get(User, user.id)

                if record is not None:
                    db.session.delete(record)

            db.session.commit()

            print("Temporary test data cleaned.")


if __name__ == "__main__":
    run_tests()
