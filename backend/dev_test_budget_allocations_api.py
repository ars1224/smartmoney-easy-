
import uuid

from sqlalchemy import delete, text
from sqlalchemy.engine import make_url

from app import create_app
from app.extensions import db
from app.models import User, BudgetAllocationPlan


app = create_app()
url = make_url(app.config["SQLALCHEMY_DATABASE_URI"])

# Never execute these tests against development data.
if (
    url.host not in ("localhost", "127.0.0.1")
    or url.database != "smartmoney_easy_test"
):
    raise SystemExit(
        "STOP: Tests require smartmoney_easy_test."
    )


suffix = uuid.uuid4().hex[:12]

email_a = f"allocation_a_{suffix}@example.test"
email_b = f"allocation_b_{suffix}@example.test"

password = "BudgetAllocationTest123!"

MONTH_A = "2026-11"
MONTH_B = "2026-12"

allocation = {
    "needsPercent": 55,
    "savingsPercent": 25,
    "wantsPercent": 20,
}


def csrf_token(client):
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200
    return response.get_json()["csrf_token"]


def register(client, name, email):
    response = client.post(
        "/api/auth/register",
        json={
            "name": name,
            "email": email,
            "password": password,
        },
        headers={
            "X-CSRF-Token": csrf_token(client),
        },
    )

    assert response.status_code == 201, (
        response.status_code,
        response.get_json(),
    )

    return response.get_json()["user"]["id"]


def save(client, values, month=MONTH_A):
    return client.put(
        "/api/budget-allocations",
        query_string={"month": month},
        json=values,
        headers={
            "X-CSRF-Token": csrf_token(client),
        },
    )


def load(client, month=MONTH_A):
    return client.get(
        "/api/budget-allocations",
        query_string={"month": month},
    )


def run_tests():
    with app.app_context():
        revision = db.session.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()

        assert revision == "feb2ecaa323e", revision

    try:
        anonymous = app.test_client()

        # Anonymous users cannot read allocations.
        response = load(anonymous)
        assert response.status_code == 401

        print("PASS: Anonymous access blocked")

        # Register first test user.
        client_a = app.test_client()

        user_a = register(
            client_a,
            "Allocation Test A",
            email_a,
        )

        # No saved allocation yet.
        response = load(client_a)

        assert response.status_code == 200
        assert response.get_json()["allocation"] is None
        assert response.get_json()["month"] == MONTH_A

        print("PASS: Empty allocation returned")

        # CSRF is mandatory.
        response = client_a.put(
            "/api/budget-allocations",
            query_string={"month": MONTH_A},
            json=allocation,
        )

        assert response.status_code == 403

        print("PASS: Missing CSRF rejected")

        # Invalid inputs must be rejected.
        invalid_cases = [
            {
                **allocation,
                "needsPercent": 60,
            },
            {
                **allocation,
                "needsPercent": -5,
            },
            {
                **allocation,
                "needsPercent": 55.5,
            },
            {
                **allocation,
                "needsPercent": True,
            },
            {
                **allocation,
                "needsPercent": "55",
            },
            {
                **allocation,
                "needsPercent": None,
            },
            {
                "needsPercent": 55,
                "savingsPercent": 45,
            },
            {
                **allocation,
                "extra": 1,
            },
        ]

        for values in invalid_cases:
            response = save(client_a, values)

            assert response.status_code == 400, (
                values,
                response.status_code,
                response.get_json(),
            )

        print("PASS: Invalid percentages rejected")

        # Invalid requests must not create an allocation.
        response = load(client_a)
        assert response.get_json()["allocation"] is None

        print("PASS: Invalid requests preserved data")

        # Save valid percentages.
        response = save(client_a, allocation)

        assert response.status_code == 200, (
            response.status_code,
            response.get_json(),
        )

        assert response.get_json()["allocation"] == allocation
        assert response.headers["Cache-Control"] == "no-store"

        print("PASS: Valid allocation saved")

        # Confirm persistence through a new GET.
        response = load(client_a)

        assert response.status_code == 200
        assert response.get_json()["allocation"] == allocation

        print("PASS: Allocation persisted")

        # Update the same user and month.
        updated = {
            "needsPercent": 50,
            "savingsPercent": 30,
            "wantsPercent": 20,
        }

        response = save(client_a, updated)

        assert response.status_code == 200

        response = load(client_a)
        assert response.get_json()["allocation"] == updated

        print("PASS: Existing allocation updated")

        # Another month must be independent.
        response = save(client_a, allocation, MONTH_B)
        assert response.status_code == 200

        assert load(client_a, MONTH_A).get_json()[
            "allocation"
        ] == updated

        assert load(client_a, MONTH_B).get_json()[
            "allocation"
        ] == allocation

        print("PASS: Monthly allocations isolated")

        # Invalid month strings are rejected.
        response = load(client_a, "2026-13")
        assert response.status_code == 400

        response = save(client_a, allocation, "invalid")
        assert response.status_code == 400

        print("PASS: Invalid month rejected")

        # Register second user.
        client_b = app.test_client()

        user_b = register(
            client_b,
            "Allocation Test B",
            email_b,
        )

        response = load(client_b)
        assert response.status_code == 200
        assert response.get_json()["allocation"] is None

        print("PASS: User B cannot read User A's allocation")

        response = save(client_b, allocation)
        assert response.status_code == 200

        # User A's allocation remains unchanged.
        assert load(client_a, MONTH_A).get_json()[
            "allocation"
        ] == updated

        with app.app_context():
            first = BudgetAllocationPlan.query.filter_by(
                user_id=user_a,
                month=MONTH_A,
            ).one()

            second = BudgetAllocationPlan.query.filter_by(
                user_id=user_b,
                month=MONTH_A,
            ).one()

            assert first.needs_percent == 50
            assert second.needs_percent == 55

        print("PASS: Allocations isolated by user")

        print(
            "\nALL BUDGET ALLOCATION API TESTS PASSED!"
        )

    finally:
        # Remove only users created by this test.
        # Foreign-key cascades remove their allocations.
        with app.app_context():
            db.session.rollback()

            db.session.execute(
                delete(User).where(
                    User.email.in_([email_a, email_b])
                )
            )

            db.session.commit()

        print("Temporary test accounts cleaned up.")


if __name__ == "__main__":
    run_tests()
