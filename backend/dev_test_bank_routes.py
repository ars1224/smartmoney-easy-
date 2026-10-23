
from flask import g

from app import create_app
from app.models import User, BankConnection

app = create_app()
app.config["TESTING"] = True

with app.app_context():
    user = User.query.filter_by(
        email="smartmoney-dev@example.test"
    ).first()

    if user is None:
        raise RuntimeError("Development user not found.")

    user_id = user.id

    connection = BankConnection.query.filter_by(
        user_id=user_id,
        status="CONNECTED"
    ).first()

    if connection is None:
        raise RuntimeError("Bank connection not found.")

    connection_id = connection.id


# Development test only: simulate verified authentication.
# Do not add this hook to the production Flask application.
@app.before_request
def simulate_authentication():
    g.current_user_id = user_id


with app.test_client() as client:
    print("Testing connected accounts...")

    response = client.get("/api/bank/accounts")

    print("Status:", response.status_code)
    print("Response:", response.get_json())

    assert response.status_code == 200
    assert response.get_json()["count"] == 2

    print("\nTesting bank synchronisation...")

    response = client.post(
        f"/api/bank/connections/{connection_id}/sync"
    )

    print("Status:", response.status_code)
    print("Response:", response.get_json())

    assert response.status_code == 200
    assert response.get_json()["accounts_synced"] == 2

    print("\nBank API tests passed!")
