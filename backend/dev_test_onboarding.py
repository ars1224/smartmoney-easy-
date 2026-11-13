
import uuid

from sqlalchemy import text
from sqlalchemy.engine import make_url

from app import create_app
from app.extensions import db
from app.models import User, OnboardingProgress


app = create_app()
url = make_url(app.config["SQLALCHEMY_DATABASE_URI"])

# Never run registration tests against development
# or production data.
if (
    url.host not in ("localhost", "127.0.0.1")
    or url.database != "smartmoney_easy_test"
):
    raise SystemExit(
        "STOP: Tests require smartmoney_easy_test."
    )

suffix = uuid.uuid4().hex[:12]
new_email = f"onboarding_{suffix}@example.test"
legacy_email = f"legacy_{suffix}@example.test"
password = "OnboardingTestPassword123!"


def csrf_token(client):
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200
    return response.get_json()["csrf_token"]


def run_tests():
    with app.app_context():
        revision = db.session.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()

        assert revision == "feb2ecaa323e", revision

    try:
        # Test 1: Anonymous access is blocked.
        anonymous = app.test_client()

        response = anonymous.get("/api/onboarding")

        assert response.status_code == 401
        print("PASS: Anonymous access blocked")

        # Test 2: Registration creates onboarding progress.
        new_client = app.test_client()

        response = new_client.post(
            "/api/auth/register",
            json={
                "name": "Onboarding Test",
                "email": new_email,
                "password": password,
            },
            headers={
                "X-CSRF-Token": csrf_token(new_client),
            },
        )

        assert response.status_code == 201, (
            response.status_code,
            response.get_json(),
        )

        user_id = response.get_json()["user"]["id"]

        with app.app_context():
            progress = db.session.get(
                OnboardingProgress, user_id
            )

            assert progress is not None
            assert progress.status == "IN_PROGRESS"
            assert progress.current_step == "EMPLOYMENT"
            assert progress.completed_at is None

        print("PASS: Registration creates onboarding progress")

        response = new_client.get("/api/onboarding")

        assert response.status_code == 200

        payload = response.get_json()

        assert payload["status"] == "IN_PROGRESS"
        assert payload["currentStep"] == "EMPLOYMENT"
        assert payload["onboardingRequired"] is True

        print("PASS: New user's onboarding API response")

        # Completion requires CSRF protection.
        response = new_client.post(
            "/api/onboarding/complete",
        )

        assert response.status_code == 403

        print("PASS: Completion requires CSRF")

        # Users cannot finish directly from Employment.
        response = new_client.post(
            "/api/onboarding/complete",
            headers={
                "X-CSRF-Token": csrf_token(new_client),
            },
        )

        assert response.status_code == 409, (
            response.status_code,
            response.get_json(),
        )

        response = new_client.get("/api/onboarding")
        assert response.status_code == 200
        assert response.get_json()["currentStep"] == "EMPLOYMENT"
        assert response.get_json()["status"] == "IN_PROGRESS"

        print("PASS: Premature completion rejected")



        # Test 4: Invalid steps are rejected.
        response = new_client.put(
            "/api/onboarding/progress",
            json={"currentStep": "INVALID"},
            headers={
                "X-CSRF-Token": csrf_token(new_client),
            },
        )

        assert response.status_code == 400
        print("PASS: Invalid onboarding step rejected")

        # Test 5: Users cannot skip ahead.
        response = new_client.put(
            "/api/onboarding/progress",
            json={"currentStep": "REVIEW"},
            headers={
                "X-CSRF-Token": csrf_token(new_client),
            },
        )

        assert response.status_code == 409
        print("PASS: Skipping onboarding steps blocked")

        # Test 6: CSRF protection is required.
        response = new_client.put(
            "/api/onboarding/progress",
            json={"currentStep": "PAYROLL"},
        )

        assert response.status_code == 403
        print("PASS: Progress updates require CSRF")

        # Test 7: Valid progress is saved.
        response = new_client.put(
            "/api/onboarding/progress",
            json={"currentStep": "PAYROLL"},
            headers={
                "X-CSRF-Token": csrf_token(new_client),
            },
        )

        assert response.status_code == 200, (
            response.status_code,
            response.get_json(),
        )

        assert response.get_json()["currentStep"] == "PAYROLL"
        print("PASS: Onboarding progress saved")

        # Test 8: Progress persists on a new GET request.
        response = new_client.get("/api/onboarding")

        assert response.status_code == 200
        assert response.get_json()["currentStep"] == "PAYROLL"
        assert response.get_json()["onboardingRequired"] is True

        print("PASS: Saved onboarding progress persists")


        # Test: Cannot advance to Budget without payroll settings.
        response = new_client.put(
            "/api/onboarding/progress",
            json={"currentStep": "BUDGET"},
            headers={
                "X-CSRF-Token": csrf_token(new_client),
            },
        )

        assert response.status_code == 409, (
            response.status_code,
            response.get_json(),
        )

        response = new_client.get("/api/onboarding")
        assert response.get_json()["currentStep"] == "PAYROLL"

        print("PASS: Budget requires saved payroll settings")

        # Save a valid payroll configuration.
        payroll_payload = {
            "incomeType": "SALARY",
            "grossAmount": "1300.00",
            "payFrequency": "WEEKLY",
            "hoursPerWeek": None,
            "taxCode": "M",
            "kiwiSaverRate": "0.0350",
            "hasStudentLoan": False,
        }

        response = new_client.put(
            "/api/payroll/settings",
            json=payroll_payload,
            headers={
                "X-CSRF-Token": csrf_token(new_client),
            },
        )

        assert response.status_code == 200, (
            response.status_code,
            response.get_json(),
        )

        # Confirm the saved settings produce an estimate.
        response = new_client.get("/api/payroll/estimate")
        assert response.status_code == 200, response.get_json()

        print("PASS: Valid payroll estimate available")

        # Test: Valid payroll permits advancement to Budget.
        response = new_client.put(
            "/api/onboarding/progress",
            json={"currentStep": "BUDGET"},
            headers={
                "X-CSRF-Token": csrf_token(new_client),
            },
        )

        assert response.status_code == 200, (
            response.status_code,
            response.get_json(),
        )

        assert response.get_json()["currentStep"] == "BUDGET"

        response = new_client.get("/api/onboarding")
        assert response.status_code == 200
        assert response.get_json()["currentStep"] == "BUDGET"

        print("PASS: Valid payroll allows Budget progression")

        # Test: Review remains blocked until Budget setup exists.
        response = new_client.put(
            "/api/onboarding/progress",
            json={"currentStep": "REVIEW"},
            headers={
                "X-CSRF-Token": csrf_token(new_client),
            },
        )

        assert response.status_code == 409, (
            response.status_code,
            response.get_json(),
        )

        # Rejection must not modify saved progress.
        response = new_client.get("/api/onboarding")
        assert response.status_code == 200
        assert response.get_json()["currentStep"] == "BUDGET"

        print("PASS: Review blocked until Budget setup")
        print("PASS: Rejected transition preserves progress")


        # Save a valid monthly budget allocation.
        allocation_payload = {
            "needsPercent": 55,
            "savingsPercent": 25,
            "wantsPercent": 20,
        }

        response = new_client.put(
            "/api/budget-allocations",
            json=allocation_payload,
            headers={
                "X-CSRF-Token": csrf_token(new_client),
            },
        )

        assert response.status_code == 200, (
            response.status_code,
            response.get_json(),
        )

        assert (
            response.get_json()["allocation"]
            == allocation_payload
        )

        print("PASS: Budget allocation saved")

        # Confirm the current month's allocation persists.
        response = new_client.get(
            "/api/budget-allocations"
        )

        assert response.status_code == 200
        assert (
            response.get_json()["allocation"]
            == allocation_payload
        )

        print("PASS: Budget allocation persisted")

        # A valid allocation now permits Review.
        response = new_client.put(
            "/api/onboarding/progress",
            json={"currentStep": "REVIEW"},
            headers={
                "X-CSRF-Token": csrf_token(new_client),
            },
        )

        assert response.status_code == 200, (
            response.status_code,
            response.get_json(),
        )

        assert response.get_json()["currentStep"] == "REVIEW"

        print("PASS: Valid allocation allows Review")

        # Verify the saved onboarding step after progression.
        response = new_client.get("/api/onboarding")

        assert response.status_code == 200
        assert response.get_json()["currentStep"] == "REVIEW"
        assert response.get_json()["status"] == "IN_PROGRESS"

        print("PASS: Review progress persists")

        # Finish onboarding after all required setup is saved.
        response = new_client.post(
            "/api/onboarding/complete",
            headers={
                "X-CSRF-Token": csrf_token(new_client),
            },
        )

        assert response.status_code == 200, (
            response.status_code,
            response.get_json(),
        )

        completed = response.get_json()

        assert completed["status"] == "COMPLETED"
        assert completed["currentStep"] == "REVIEW"
        assert completed["onboardingRequired"] is False
        assert completed["completedAt"] is not None
        assert response.headers["Cache-Control"] == "no-store"

        print("PASS: Onboarding completed successfully")

        # Completion must persist after a new API request.
        response = new_client.get("/api/onboarding")

        assert response.status_code == 200

        saved = response.get_json()

        assert saved["status"] == "COMPLETED"
        assert saved["currentStep"] == "REVIEW"
        assert saved["onboardingRequired"] is False
        assert saved["completedAt"] == completed["completedAt"]

        print("PASS: Completed onboarding persists")

        # Prevent a second completion.
        response = new_client.post(
            "/api/onboarding/complete",
            headers={
                "X-CSRF-Token": csrf_token(new_client),
            },
        )

        assert response.status_code == 409

        print("PASS: Duplicate completion rejected")

        # Completed onboarding cannot be reopened
        # through the ordinary progress endpoint.
        response = new_client.put(
            "/api/onboarding/progress",
            json={"currentStep": "EMPLOYMENT"},
            headers={
                "X-CSRF-Token": csrf_token(new_client),
            },
        )

        assert response.status_code == 409

        print("PASS: Completed onboarding cannot be reopened")



        # Test 3: Existing users without onboarding records
        # retain their current access.
        with app.app_context():
            legacy = User(
                name="Legacy Test",
                email=legacy_email,
            )
            legacy.set_password(password)
            db.session.add(legacy)
            db.session.commit()

        legacy_client = app.test_client()

        response = legacy_client.post(
            "/api/auth/login",
            json={
                "email": legacy_email,
                "password": password,
            },
            headers={
                "X-CSRF-Token": csrf_token(legacy_client),
            },
        )

        assert response.status_code == 200, (
            response.status_code,
            response.get_json(),
        )

        response = legacy_client.get("/api/onboarding")

        assert response.status_code == 200

        payload = response.get_json()

        assert payload["status"] == "LEGACY"
        assert payload["currentStep"] is None
        assert payload["onboardingRequired"] is False

        print("PASS: Existing users retain access")

        print("\nALL ONBOARDING REGISTRATION TESTS PASSED!")

    finally:
        # Remove only temporary test accounts.
        # PostgreSQL cascades deletion to onboarding progress.
        with app.app_context():
            db.session.rollback()

            for email in (new_email, legacy_email):
                user = User.query.filter_by(
                    email=email
                ).first()

                if user is not None:
                    db.session.delete(user)

            db.session.commit()

        print("Temporary test accounts cleaned up.")

if __name__ == "__main__":
    run_tests()
