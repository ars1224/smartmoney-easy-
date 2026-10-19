
from uuid import uuid4

from app import create_app
from app.extensions import db
from app.models import User


app = create_app()
app.config["TESTING"] = True

email = f"smartmoney-auth-test-{uuid4().hex}@example.test"
password = "SmartMoneyTestPassword!2026"

try:
    with app.test_client() as client:

        # 1. Obtain CSRF token
        response = client.get("/api/auth/csrf")
        assert response.status_code == 200

        csrf_token = response.get_json()["csrf_token"]
        print("CSRF Token: OK")

        # 2. Register a new user
        response = client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": password
            },
            headers={"X-CSRF-Token": csrf_token}
        )

        print("Register:", response.status_code)
        assert response.status_code == 201, response.get_json()

        csrf_token = response.get_json()["csrf_token"]

        # 3. Verify authenticated session
        response = client.get("/api/auth/me")

        print("Authenticated /me:", response.status_code)
        assert response.status_code == 200
        assert response.get_json()["user"]["email"] == email

        # 4. Logout
        response = client.post(
            "/api/auth/logout",
            headers={"X-CSRF-Token": csrf_token}
        )

        print("Logout:", response.status_code)
        assert response.status_code == 200

        # 5. Verify session was removed
        response = client.get("/api/auth/me")

        print("After logout:", response.status_code)
        assert response.status_code == 401

        # 6. Obtain a fresh CSRF token
        response = client.get("/api/auth/csrf")
        csrf_token = response.get_json()["csrf_token"]

        # 7. Log in again
        response = client.post(
            "/api/auth/login",
            json={
                "email": email,
                "password": password
            },
            headers={"X-CSRF-Token": csrf_token}
        )

        print("Login:", response.status_code)
        assert response.status_code == 200, response.get_json()

        # 8. Verify session persists
        response = client.get("/api/auth/me")

        print("Session restored:", response.status_code)
        assert response.status_code == 200

        print("\nALL AUTHENTICATION TESTS PASSED!")

finally:
    # Delete only the temporary test user.
    with app.app_context():
        user = User.query.filter_by(email=email).first()

        if user:
            db.session.delete(user)
            db.session.commit()
            print("Temporary test user cleaned up.")
