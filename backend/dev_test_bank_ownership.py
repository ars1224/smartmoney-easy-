
from uuid import uuid4

from app import create_app
from app.extensions import db
from app.models import User, BankConnection


app = create_app()
app.config["TESTING"] = True

test_email = f"ownership-test-{uuid4().hex}@example.test"
test_password = "SmartMoneyOwnershipTest!2026"

with app.app_context():
    owner = User.query.filter_by(
        email="smartmoney-dev@example.test"
    ).first()

    if owner is None:
        raise RuntimeError("Existing development user not found.")

    connection = BankConnection.query.filter_by(
        user_id=owner.id,
        status="CONNECTED"
    ).first()

    if connection is None:
        raise RuntimeError("Existing bank connection not found.")

    owner_id = owner.id
    connection_id = connection.id


try:
    # Test 1: Existing owner can view their accounts.
    # Development-only signed session simulation.
    with app.test_client() as owner_client:
        with owner_client.session_transaction() as session:
            session["user_id"] = owner_id

        response = owner_client.get("/api/bank/accounts")

        print("Owner account access:", response.status_code)
        assert response.status_code == 200
        assert response.get_json()["count"] == 2

    # Test 2: Register a completely different user.
    with app.test_client() as other_client:
        response = other_client.get("/api/auth/csrf")
        csrf_token = response.get_json()["csrf_token"]

        response = other_client.post(
            "/api/auth/register",
            json={
                "email": test_email,
                "password": test_password
            },
            headers={"X-CSRF-Token": csrf_token}
        )

        print("Second user registration:", response.status_code)
        assert response.status_code == 201, response.get_json()

        csrf_token = response.get_json()["csrf_token"]

        # Test 3: Other user must not see owner's accounts.
        response = other_client.get("/api/bank/accounts")

        print("Other user's accounts:", response.status_code)
        assert response.status_code == 200
        assert response.get_json()["count"] == 0

        # Test 4: Other user cannot sync owner's connection.
        response = other_client.post(
            f"/api/bank/connections/{connection_id}/sync",
            headers={"X-CSRF-Token": csrf_token}
        )

        print("Cross-user sync attempt:", response.status_code)
        assert response.status_code == 404

    print("\nALL BANK OWNERSHIP TESTS PASSED!")

finally:
    with app.app_context():
        test_user = User.query.filter_by(
            email=test_email
        ).first()

        if test_user is not None:
            db.session.delete(test_user)
            db.session.commit()
            print("Temporary test user removed.")
