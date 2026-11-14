
import secrets
import uuid
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.engine import make_url

from app import create_app
from app.extensions import db

from app.models import (
    Budget,
    BudgetMonthlyLimit,
    MonthlyIncomePlan,
    RegularIncomeProfile,
    User,
)




app = create_app()


def check(response, expected_status, description):
    assert response.status_code == expected_status, (
        f"{description}: expected {expected_status}, "
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

    return client, {"X-CSRF-Token": csrf_token}


def run_tests():
    url = make_url(
        app.config["SQLALCHEMY_DATABASE_URI"]
    )

    if (
        url.host not in ("localhost", "127.0.0.1")
        or url.database != "smartmoney_easy_test"
    ):
        raise RuntimeError(
            "Tests require smartmoney_easy_test."
        )

    with app.app_context():
        revisions = db.session.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalars().all()
        assert revisions == ["bc62f914d8ae"], revisions

        suffix = uuid.uuid4().hex

        users = [
            User(email=f"income-owner-{suffix}@example.test"),
            User(email=f"income-other-{suffix}@example.test"),
        ]


        user_ids = []

        try:
            db.session.add_all(users)
            db.session.commit()

            user_ids = [user.id for user in users]


            owner, headers = authenticated_client(
                user_ids[0]
            )

            other, other_headers = authenticated_client(
                user_ids[1]
            )

            check(
                app.test_client().get("/api/monthly-income"),
                401,
                "Anonymous access blocked",
            )

            october = {"month": "2026-10"}
            november = {"month": "2026-11"}

            response = owner.get(
                "/api/monthly-income",
                query_string=october,
            )
            check(response, 200, "Read empty income plan")

            assert response.get_json()["expectedIncome"] is None

            check(
                owner.put(
                    "/api/monthly-income",
                    query_string=october,
                    json={"expectedIncome": "3200.00"},
                ),
                403,
                "Missing CSRF token rejected",
            )

            response = owner.put(
                "/api/monthly-income",
                query_string=october,
                json={"expectedIncome": "3200.00"},
                headers=headers,
            )
            check(response, 200, "Save October income")

            assert response.get_json()["expectedIncome"] == "3200.00"

            response = owner.put(
                "/api/monthly-income",
                query_string=november,
                json={"expectedIncome": "0.00"},
                headers=headers,
            )
            check(response, 200, "Save zero November income")

            for month, expected in (
                (october, "3200.00"),
                (november, "0.00"),
            ):
                response = owner.get(
                    "/api/monthly-income",
                    query_string=month,
                )
                check(response, 200, "Read monthly income")

                assert (
                    response.get_json()["expectedIncome"]
                    == expected
                )

            response = owner.put(
                "/api/monthly-income",
                query_string=october,
                json={"expectedIncome": "3500.50"},
                headers=headers,
            )
            check(response, 200, "Update October income")

            assert owner.get(
                "/api/monthly-income",
                query_string=october,
            ).get_json()["expectedIncome"] == "3500.50"

            assert owner.get(
                "/api/monthly-income",
                query_string=november,
            ).get_json()["expectedIncome"] == "0.00"

            print("PASS: Monthly incomes are independent")


            # Test monthly budget allocations.
            groceries = Budget(
                user_id=user_ids[0],
                category="Groceries",
                monthly_limit=Decimal("200.00"),
            )

            transport = Budget(
                user_id=user_ids[0],
                category="Transport",
                monthly_limit=Decimal("100.00"),
            )

            db.session.add_all([groceries, transport])
            db.session.flush()

            db.session.add_all([
                BudgetMonthlyLimit(
                    budget_id=groceries.id,
                    month="2026-10",
                    monthly_limit=Decimal("500.00"),
                ),
                BudgetMonthlyLimit(
                    budget_id=groceries.id,
                    month="2026-11",
                    monthly_limit=Decimal("250.00"),
                ),
            ])

            db.session.commit()

            # October: 3500.50 - (500 + 100) = 2900.50
            # November: 0 - (250 + 100) = -350.00
            for month, allocated, unallocated in (
                (october, "600.00", "2900.50"),
                (november, "350.00", "-350.00"),
            ):
                response = owner.get(
                    "/api/monthly-income",
                    query_string=month,
                )

                check(
                    response,
                    200,
                    "Calculate monthly allocation",
                )

                data = response.get_json()

                assert data["allocatedBudget"] == allocated, data
                assert data["unallocatedBudget"] == unallocated, data

            print("PASS: Monthly allocations are independent")
            print("PASS: Over-allocation is reported")

            # A month without overrides uses default limits.
            response = owner.get(
                "/api/monthly-income",
                query_string={"month": "2026-09"},
            )

            check(response, 200, "Read month without income plan")

            data = response.get_json()

            assert data["expectedIncome"] is None
            assert data["allocatedBudget"] == "300.00"
            assert data["unallocatedBudget"] is None

            print("PASS: Default budget limits preserved")
            print("PASS: Missing income is not treated as zero")


            response = other.get(
                "/api/monthly-income",
                query_string=october,
            )
            check(response, 200, "Other user can read own plan")
            assert response.get_json()["expectedIncome"] is None

            response = other.put(
                "/api/monthly-income",
                query_string=october,
                json={"expectedIncome": "850.00"},
                headers=other_headers,
            )
            check(response, 200, "Other user saves own plan")

            assert owner.get(
                "/api/monthly-income",
                query_string=october,
            ).get_json()["expectedIncome"] == "3500.50"

            print("PASS: User income plans remain private")

            for invalid in (
                "-1",
                "12.345",
                "NaN",
                "Infinity",
                True,
                None,
            ):
                response = owner.put(
                    "/api/monthly-income",
                    query_string=october,
                    json={"expectedIncome": invalid},
                    headers=headers,
                )
                check(
                    response,
                    400,
                    f"Invalid income {invalid!r} rejected",
                )

            for invalid_month in (
                "2026-13",
                "2026/11",
                "0000-01",
                "9999-12",
            ):
                response = owner.get(
                    "/api/monthly-income",
                    query_string={"month": invalid_month},
                )
                check(
                    response,
                    400,
                    f"Invalid month {invalid_month!r} rejected",
                )

            plans = MonthlyIncomePlan.query.filter_by(
                user_id=user_ids[0]
            ).all()

            assert len(plans) == 2
            assert any(
                plan.month == "2026-10"
                and plan.expected_income == Decimal("3500.50")
                for plan in plans
            )

            print("PASS: Expected income persisted correctly")


            # Regular income fallback tests.
            profile = RegularIncomeProfile(
                user_id=user_ids[0],
                income_type="SALARY",
                amount=Decimal("800.00"),
                pay_frequency="WEEKLY",
            )

            db.session.add(profile)
            db.session.commit()

            fallback_month = {"month": "2026-06"}

            response = owner.get(
                "/api/monthly-income",
                query_string=fallback_month,
            )
            check(response, 200, "Weekly salary fallback")

            data = response.get_json()

            assert data["expectedIncome"] == "3466.67"
            assert data["incomeSource"] == "REGULAR"

            print("PASS: Weekly pay converted to monthly")

            # Existing month-specific income overrides win.
            october_plan = MonthlyIncomePlan.query.filter_by(
                user_id=user_ids[0],
                month="2026-10",
            ).first()

            assert october_plan is not None

            response = owner.get(
                "/api/monthly-income",
                query_string={"month": "2026-10"},
            )
            check(response, 200, "Monthly override priority")

            data = response.get_json()

            assert Decimal(data["expectedIncome"]) == (
                october_plan.expected_income
            )
            assert data["incomeSource"] == "MONTHLY_OVERRIDE"

            print("PASS: Monthly override takes priority")

            # Change the regular profile to hourly pay.
            profile.income_type = "HOURLY"
            profile.amount = Decimal("25.00")
            profile.pay_frequency = None
            profile.hours_per_week = Decimal("40.00")

            db.session.commit()

            response = owner.get(
                "/api/monthly-income",
                query_string=fallback_month,
            )
            check(response, 200, "Hourly income fallback")

            data = response.get_json()

            assert data["expectedIncome"] == "4333.33"
            assert data["incomeSource"] == "REGULAR"

            print("PASS: Hourly income converted to monthly")

            # Another user's income remains independent.
            response = other.get(
                "/api/monthly-income",
                query_string=fallback_month,
            )
            check(response, 200, "Regular income user isolation")

            data = response.get_json()

            assert data["expectedIncome"] is None
            assert data["incomeSource"] == "NOT_SET"

            print("PASS: Regular income remains private")


        finally:
            db.session.rollback()

            db.session.query(RegularIncomeProfile).filter(
                RegularIncomeProfile.user_id.in_(user_ids)
            ).delete(synchronize_session=False)


            db.session.query(MonthlyIncomePlan).filter(
                MonthlyIncomePlan.user_id.in_(user_ids)
            ).delete(synchronize_session=False)

            db.session.query(User).filter(
                User.id.in_(user_ids)
            ).delete(synchronize_session=False)

            db.session.commit()
            print("Temporary test data cleaned up.")

            # Monthly limit records are removed by ON DELETE CASCADE.
            db.session.query(Budget).filter(
                Budget.user_id.in_(user_ids)
            ).delete(synchronize_session=False)

    print("\nALL MONTHLY INCOME API TESTS PASSED!")

if __name__ == "__main__":
    run_tests()
