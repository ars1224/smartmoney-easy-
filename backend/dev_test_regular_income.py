
import secrets
import uuid

from sqlalchemy import text
from sqlalchemy.engine import make_url

from app import create_app
from app.extensions import db
from app.models import (
    MonthlyIncomePlan,
    RegularIncomeProfile,
    User,
)


app = create_app()


def check(response, expected, description):
    assert response.status_code == expected, (
        f"{description}: expected {expected}, "
        f"got {response.status_code}. "
        f"Response: {response.get_json()}"
    )
    print(f"PASS: {description}")


def authenticated_client(user_id):
    client = app.test_client()
    csrf_token = secrets.token_urlsafe(32)

    with client.session_transaction() as session:
        session["user_id"] = user_id
        session["csrf_token"] = csrf_token

    return client, {
        "X-CSRF-Token": csrf_token,
    }


def run_tests():
    url = make_url(
        app.config["SQLALCHEMY_DATABASE_URI"]
    )

    if (
        url.host not in ("localhost", "127.0.0.1")
        or url.database != "smartmoney_easy_test"
    ):
        raise RuntimeError(
            "Tests require the local smartmoney_easy_test database."
        )

    with app.app_context():
        revisions = db.session.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalars().all()

        assert revisions == ["bc62f914d8ae"], revisions

        suffix = uuid.uuid4().hex

        users = [
            User(email=f"regular-owner-{suffix}@example.test"),
            User(email=f"regular-other-{suffix}@example.test"),
        ]

        user_ids = []

        try:
            db.session.add_all(users)
            db.session.commit()

            user_ids = [user.id for user in users]

            owner, headers = authenticated_client(user_ids[0])
            other, _ = authenticated_client(user_ids[1])

            endpoint = "/api/regular-income"
            month = {"month": "2026-06"}

            # Authentication
            response = app.test_client().get(endpoint)
            check(response, 401, "Anonymous access blocked")

            # Empty profile
            response = owner.get(endpoint)
            check(response, 200, "Read empty regular income")
            assert response.get_json()["profile"] is None

            salary = {
                "incomeType": "SALARY",
                "amount": "800.00",
                "payFrequency": "WEEKLY",
                "hoursPerWeek": None,
            }

            # CSRF protection
            response = owner.put(endpoint, json=salary)
            check(response, 403, "Missing CSRF token rejected")

            # Create salary profile
            response = owner.put(
                endpoint,
                json=salary,
                headers=headers,
            )
            check(response, 200, "Save weekly salary")

            profile = response.get_json()["profile"]

            assert profile["incomeType"] == "SALARY"
            assert profile["monthlyEstimate"] == "3466.67"

            # Read saved profile
            response = owner.get(endpoint)
            check(response, 200, "Retrieve saved salary")

            assert (
                response.get_json()["profile"]["amount"]
                == "800.00"
            )

            # Verify budget API fallback
            response = owner.get(
                "/api/monthly-income",
                query_string=month,
            )
            check(response, 200, "Salary budget integration")

            summary = response.get_json()

            assert summary["expectedIncome"] == "3466.67"
            assert summary["incomeSource"] == "REGULAR"

            # Hourly pay replaces salary settings
            hourly = {
                "incomeType": "HOURLY",
                "amount": "25.00",
                "payFrequency": None,
                "hoursPerWeek": "40.00",
            }

            response = owner.put(
                endpoint,
                json=hourly,
                headers=headers,
            )
            check(response, 200, "Switch to hourly income")

            profile = response.get_json()["profile"]

            assert profile["incomeType"] == "HOURLY"
            assert profile["monthlyEstimate"] == "4333.33"

            response = owner.get(
                "/api/monthly-income",
                query_string=month,
            )
            check(response, 200, "Hourly budget integration")

            assert response.get_json()["expectedIncome"] == "4333.33"

            # Explicit monthly override
            response = owner.put(
                "/api/monthly-income",
                query_string=month,
                json={"expectedIncome": "2800.00"},
                headers=headers,
            )
            check(response, 200, "Save monthly override")

            response = owner.get(
                "/api/monthly-income",
                query_string=month,
            )
            check(response, 200, "Monthly override priority")

            summary = response.get_json()

            assert summary["expectedIncome"] == "2800.00"
            assert summary["incomeSource"] == "MONTHLY_OVERRIDE"

            # User isolation
            response = other.get(endpoint)
            check(response, 200, "Other user reads own profile")
            assert response.get_json()["profile"] is None

            response = other.get(
                "/api/monthly-income",
                query_string=month,
            )
            check(response, 200, "Other user income isolation")

            assert response.get_json()["expectedIncome"] is None

            # Invalid inputs
            invalid_payloads = [
                {**salary, "amount": "-1"},
                {**salary, "amount": "NaN"},
                {**salary, "amount": "12.345"},
                {**salary, "payFrequency": "DAILY"},
                {**salary, "hoursPerWeek": "40"},
                {**hourly, "hoursPerWeek": "169"},
                {**hourly, "hoursPerWeek": "-1"},
                {**hourly, "payFrequency": "WEEKLY"},
                {**hourly, "incomeType": "UNKNOWN"},
            ]

            for payload in invalid_payloads:
                response = owner.put(
                    endpoint,
                    json=payload,
                    headers=headers,
                )
                check(
                    response,
                    400,
                    "Invalid regular income rejected",
                )

            # Invalid saves must not alter the stored profile.
            response = owner.get(endpoint)
            check(response, 200, "Profile unchanged after errors")

            profile = response.get_json()["profile"]

            assert profile["incomeType"] == "HOURLY"
            assert profile["amount"] == "25.00"
            assert profile["hoursPerWeek"] == "40.00"

        finally:
            db.session.rollback()

            if user_ids:
                db.session.query(MonthlyIncomePlan).filter(
                    MonthlyIncomePlan.user_id.in_(user_ids)
                ).delete(synchronize_session=False)

                db.session.query(RegularIncomeProfile).filter(
                    RegularIncomeProfile.user_id.in_(user_ids)
                ).delete(synchronize_session=False)

                db.session.query(User).filter(
                    User.id.in_(user_ids)
                ).delete(synchronize_session=False)

                db.session.commit()

                print("Temporary test data cleaned up.")

    print("ALL REGULAR INCOME API TESTS PASSED!")


if __name__ == "__main__":
    run_tests()
