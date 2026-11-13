
import uuid
from decimal import Decimal

from sqlalchemy import delete, text
from sqlalchemy.engine import make_url

from app import create_app
from app.extensions import db
from app.models import User, PayrollSettings

from datetime import date



app = create_app()
url = make_url(app.config["SQLALCHEMY_DATABASE_URI"])

# Only run against the isolated local test database.
if (
    url.host not in ("localhost", "127.0.0.1")
    or url.database != "smartmoney_easy_test"
):
    raise SystemExit(
        "STOP: Payroll tests require smartmoney_easy_test."
    )

suffix = uuid.uuid4().hex[:12]
email_a = f"payroll_a_{suffix}@example.test"
email_b = f"payroll_b_{suffix}@example.test"
password = "PayrollTestPassword123!"


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


def save(client, payload):
    return client.put(
        "/api/payroll/settings",
        json=payload,
        headers={
            "X-CSRF-Token": csrf_token(client),
        },
    )

salary = {
    "incomeType": "SALARY",
    "grossAmount": "1300.00",
    "payFrequency": "WEEKLY",
    "hoursPerWeek": None,
    "taxCode": "M",
    "kiwiSaverRate": "0.0350",
    "hasStudentLoan": False,
}


hourly = {
    "incomeType": "HOURLY",
    "grossAmount": "28.20",
    "payFrequency": "WEEKLY",
    "hoursPerWeek": "40.00",
    "taxCode": "M SL",
    "kiwiSaverRate": None,
    "hasStudentLoan": True,
}


def run_tests():
    with app.app_context():
        revision = db.session.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()

        assert revision == "feb2ecaa323e", revision

    try:
        anonymous = app.test_client()

        response = anonymous.get("/api/payroll/settings")
        assert response.status_code == 401

        print("PASS: Anonymous access blocked")


        response = anonymous.get("/api/payroll/estimate")

        assert response.status_code == 401

        print("PASS: Anonymous payroll estimate blocked")


        client_a = app.test_client()
        user_a = register(
            client_a,
            "Payroll Test A",
            email_a,
        )

        response = client_a.get("/api/payroll/settings")
        assert response.status_code == 200
        assert response.get_json()["settings"] is None

        print("PASS: Empty payroll settings returned")


        response = client_a.get("/api/payroll/estimate")

        assert response.status_code == 404

        print("PASS: Missing payroll settings handled")


        response = client_a.put(
            "/api/payroll/settings",
            json=salary,
        )
        assert response.status_code == 403

        print("PASS: Missing CSRF token rejected")

        response = save(client_a, salary)
        assert response.status_code == 200, (
            response.status_code,
            response.get_json(),
        )

        print("PASS: Salary payroll settings saved")

        response = client_a.get("/api/payroll/settings")
        assert response.status_code == 200

        settings = response.get_json()["settings"]

        assert settings["incomeType"] == "SALARY"
        assert Decimal(settings["grossAmount"]) == Decimal("1300")
        assert settings["payFrequency"] == "WEEKLY"
        assert settings["hoursPerWeek"] is None
        assert settings["taxCode"] == "M"
        assert Decimal(settings["kiwiSaverRate"]) == Decimal("0.035")
        assert settings["hasStudentLoan"] is False

        print("PASS: Salary settings persisted correctly")


        # Confirm the saved salary produces an estimate.
        response = client_a.get("/api/payroll/estimate")

        assert response.status_code == 200, (
            response.status_code,
            response.get_json(),
        )

        estimate = response.get_json()["estimate"]

        assert Decimal(estimate["grossPerPay"]) == Decimal("1300")
        assert Decimal(estimate["payeIncludingAcc"]) == Decimal("263.14")
        assert Decimal(estimate["kiwiSaver"]) == Decimal("45.50")
        assert Decimal(estimate["studentLoan"]) == Decimal("0")
        assert Decimal(estimate["netPerPay"]) == Decimal("991.36")
        assert Decimal(estimate["estimatedMonthlyNet"]) == Decimal("4295.89")

        print("PASS: Salary take-home estimate calculated")


        # Check tax-year metadata and prevent cached estimates.
        pay_date = date.fromisoformat(
            response.get_json()["payDate"]
        )

        assert date(2026, 4, 1) <= pay_date <= date(2027, 3, 31)
        assert estimate["taxYear"] == "2026-27"
        assert estimate["effectiveTaxCode"] == "M"
        assert response.headers["Cache-Control"] == "no-store"

        print("PASS: Payroll estimate date and cache headers")



        # Invalid requests must not overwrite saved settings.

        invalid_cases = [
            {**salary, "grossAmount": "-1"},
            {**salary, "grossAmount": "12.345"},
            {**salary, "grossAmount": "NaN"},
            {**salary, "grossAmount": True},
            {**salary, "payFrequency": "DAILY"},
            {**salary, "hoursPerWeek": "40"},
            {**salary, "taxCode": "?"},
            {**salary, "kiwiSaverRate": "0.1100"},
            {**salary, "hasStudentLoan": "yes"},
            {**hourly, "hoursPerWeek": "169"},

            # Unsupported NZ payroll configurations
            {**salary, "taxCode": "ME"},
            {**salary, "taxCode": "M SL"},
            {**salary, "hasStudentLoan": True},
            {**salary, "kiwiSaverRate": "0.0300"},
            {**salary, "payFrequency": "YEARLY"},
        ]


        for invalid in invalid_cases:
            response = save(client_a, invalid)

            assert response.status_code == 400, (
                invalid,
                response.status_code,
                response.get_json(),
            )

        print("PASS: Invalid payroll settings rejected")

        response = client_a.get("/api/payroll/settings")
        settings = response.get_json()["settings"]

        assert settings["incomeType"] == "SALARY"
        assert Decimal(settings["grossAmount"]) == Decimal("1300")

        print("PASS: Valid settings preserved after errors")

        # Update from salary to hourly income.
        response = save(client_a, hourly)
        assert response.status_code == 200, response.get_json()

        response = client_a.get("/api/payroll/settings")
        settings = response.get_json()["settings"]

        assert settings["incomeType"] == "HOURLY"
        assert Decimal(settings["grossAmount"]) == Decimal("28.20")
        assert Decimal(settings["hoursPerWeek"]) == Decimal("40")
        assert settings["kiwiSaverRate"] is None
        assert settings["hasStudentLoan"] is True

        print("PASS: Hourly payroll settings updated")


        # Confirm hourly pay and student loan deductions.
        response = client_a.get("/api/payroll/estimate")

        assert response.status_code == 200, (
            response.status_code,
            response.get_json(),
        )

        estimate = response.get_json()["estimate"]

        assert Decimal(estimate["grossPerPay"]) == Decimal("1128")
        assert Decimal(estimate["studentLoan"]) == Decimal("79.68")
        assert Decimal(estimate["kiwiSaver"]) == Decimal("0")
        assert Decimal(estimate["netPerPay"]) == Decimal("839.79")
        assert Decimal(estimate["estimatedMonthlyNet"]) == Decimal("3639.09")

        print("PASS: Hourly take-home estimate calculated")


        # A second user must not see the first user's settings.
        client_b = app.test_client()
        user_b = register(
            client_b,
            "Payroll Test B",
            email_b,
        )

        response = client_b.get("/api/payroll/settings")
        assert response.status_code == 200
        assert response.get_json()["settings"] is None

        print("PASS: Second user cannot read first user's settings")

        response = save(client_b, salary)
        assert response.status_code == 200

        with app.app_context():
            first = db.session.get(PayrollSettings, user_a)
            second = db.session.get(PayrollSettings, user_b)

            assert first is not None
            assert second is not None
            assert first.income_type == "HOURLY"
            assert second.income_type == "SALARY"

        print("PASS: Payroll settings isolated by user")

        print("\nALL PAYROLL API TESTS PASSED!")

    finally:
        # Delete only accounts created by this test run.
        # Database foreign-key cascades remove their settings.
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
