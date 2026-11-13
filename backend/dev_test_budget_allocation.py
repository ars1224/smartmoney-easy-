
import uuid

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import create_app
from app.models import User, BudgetAllocationPlan


app = create_app()

url = make_url(
    app.config["SQLALCHEMY_DATABASE_URI"]
)

# Protect the real development database.
if (
    url.host not in ("localhost", "127.0.0.1")
    or url.database != "smartmoney_easy"
):
    raise SystemExit(
        "STOP: Unexpected source database."
    )

test_url = url.set(
    database="smartmoney_easy_test"
)

engine = create_engine(test_url)


def must_reject(session, label, **values):
    try:
        with session.begin_nested():
            plan = BudgetAllocationPlan(**values)
            session.add(plan)
            session.flush()

    except IntegrityError:
        print(f"PASS: {label} rejected")
        return

    raise AssertionError(
        f"FAIL: {label} was accepted"
    )


def run_tests():
    with engine.connect() as connection:
        transaction = connection.begin()

        try:
            revision = connection.execute(
                text(
                    "SELECT version_num "
                    "FROM alembic_version"
                )
            ).scalar_one()

            assert revision == "feb2ecaa323e", revision

            print(
                "Testing database:",
                test_url.database,
            )

            with Session(bind=connection) as session:
                user = User(
                    name="Budget Allocation Test",
                    email=(
                        f"allocation_{uuid.uuid4().hex}"
                        "@example.test"
                    ),
                )

                user.set_password(
                    "BudgetAllocationTest123!"
                )

                session.add(user)
                session.flush()

                # Valid allocation: 100%
                valid = BudgetAllocationPlan(
                    user_id=user.id,
                    month="2026-11",
                    needs_percent=55,
                    savings_percent=25,
                    wants_percent=20,
                )

                session.add(valid)
                session.flush()

                print("PASS: Valid allocation accepted")

                # Invalid: 110%
                must_reject(
                    session,
                    "110% allocation",
                    user_id=user.id,
                    month="2026-12",
                    needs_percent=60,
                    savings_percent=30,
                    wants_percent=20,
                )

                # Invalid: negative Needs
                must_reject(
                    session,
                    "Negative percentage",
                    user_id=user.id,
                    month="2027-01",
                    needs_percent=-5,
                    savings_percent=75,
                    wants_percent=30,
                )

                # Invalid: duplicate month
                must_reject(
                    session,
                    "Duplicate user/month",
                    user_id=user.id,
                    month="2026-11",
                    needs_percent=50,
                    savings_percent=30,
                    wants_percent=20,
                )

                print(
                    "\nALL BUDGET ALLOCATION "
                    "CONSTRAINT TESTS PASSED!"
                )

        finally:
            # Never persist the temporary test data.
            transaction.rollback()
            print(
                "Temporary test changes rolled back."
            )


try:
    run_tests()
finally:
    engine.dispose()
