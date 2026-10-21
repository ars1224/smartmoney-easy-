
from unittest.mock import patch

from app import create_app


app = create_app()
app.config["TESTING"] = True

client = app.test_client()

csrf_response = client.get("/api/auth/csrf")
assert csrf_response.status_code == 200

csrf_token = csrf_response.get_json()["csrf_token"]

confirm_result = {
    "connection_id": "test-connection-id",
    "status": "CONNECTED",
    "accounts_connected": 2,
}

with (
    patch(
        "app.routes.bank_oauth.get_authenticated_user_id",
        return_value="test-user-id",
    ),
    patch(
        "app.routes.bank_oauth.confirm_bank_connection",
        return_value=confirm_result.copy(),
    ),
    patch(
        "app.routes.bank_oauth.sync_bank_connection",
    ) as mock_sync,
):
    for sync_status, expected_status in (
        ("success", "SUCCESS"),
        ("partial_success", "PARTIAL_SUCCESS"),
    ):
        mock_sync.return_value = {
            "status": sync_status,
            "accounts_synced": (
                2 if sync_status == "success" else 1
            ),
            "accounts_failed": (
                0 if sync_status == "success" else 1
            ),
            "transactions_imported": 1,
        }

        response = client.post(
            "/api/bank/oauth/confirm",
            json={
                "connection_id": "test-connection-id",
                "account_ids": ["account-1", "account-2"],
            },
            headers={"X-CSRF-Token": csrf_token},
        )

        assert response.status_code == 200, (
            response.get_json()
        )

        result = response.get_json()

        assert result["status"] == "CONNECTED"
        assert result["sync_status"] == expected_status
        assert result["sync"]["status"] == sync_status

        if sync_status == "partial_success":
            assert result["sync"]["accounts_failed"] == 1
            assert "retry" in result["message"].lower()

        print(f"{expected_status} response: OK")

print("\nALL BANK OAUTH PARTIAL SYNC TESTS PASSED!")
