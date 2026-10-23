
from uuid import uuid4

from app import create_app
from app.extensions import db
from app.models import User


app = create_app()
app.config["TESTING"] = True

test_emails = []


try:
    test_cases = [
        (11, 400),
        (12, 201),
        (128, 201),
        (129, 400),
    ]

    for length, expected_status in test_cases:
        email = f"auth-limit-{uuid4().hex}@example.test"
        password = "A" * length

        test_emails.append(email)

        client = app.test_client()

        csrf_response = client.get("/api/auth/csrf")
        assert csrf_response.status_code == 200

        csrf_token = csrf_response.get_json()["csrf_token"]

        response = client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": password,
            },
            headers={
                "X-CSRF-Token": csrf_token,
            },
        )

        assert response.status_code == expected_status, (
            f"Password length {length}: "
            f"expected {expected_status}, "
            f"received {response.status_code}. "
            f"{response.get_json()}"
        )

        if expected_status == 201:
            session_response = client.get("/api/auth/me")
            assert session_response.status_code == 200
            assert session_response.get_json()["user"]["email"] == email
        else:
            assert "12" in response.get_json()["error"]
            assert "128" in response.get_json()["error"]

            with app.app_context():
                assert User.query.filter_by(email=email).first() is None

        print(f"Password length {length}: OK ({response.status_code})")

    print("\nALL PASSWORD VALIDATION TESTS PASSED!")

finally:
    with app.app_context():
        db.session.rollback()

        User.query.filter(
            User.email.in_(test_emails)
        ).delete(synchronize_session=False)

        db.session.commit()

        print("Temporary test accounts cleaned up.")
