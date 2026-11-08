from app import create_app

app = create_app()
app.config["TESTING"] = True

with app.test_client() as client:
    print("Testing unauthenticated DELETE with valid CSRF token...")

    # Obtain CSRF token
    response = client.get("/api/auth/csrf")
    assert response.status_code == 200

    csrf_token = response.get_json()["csrf_token"]

    # Send DELETE request with valid CSRF token but no login session
    response = client.delete(
        "/api/bank/transactions/imported",
        headers={"X-CSRF-Token": csrf_token}
    )

    print("Status:", response.status_code)
    print("Response:", response.get_json())

    assert response.status_code == 401, response.get_json()

    print("Authentication check passed: OK")

    print("\nTesting DELETE request without CSRF token...")

    response = client.delete("/api/bank/transactions/imported")

    print("Status:", response.status_code)

    assert response.status_code == 403, response.get_json()

    print("CSRF protection passed: OK")

    print("\nImported transaction DELETE security tests passed!")