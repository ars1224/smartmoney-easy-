
import uuid

import requests
from flask import current_app

from app.services.mock_bank import MockBankError


class MockBankAuthorizedClient:
    """Client for customer-authorized Mock Bank API requests."""

    def __init__(self):
        self.base_url = current_app.config.get(
            "MOCK_BANK_API_BASE_URL", ""
        ).rstrip("/")

        self.api_key = current_app.config.get(
            "MOCK_BANK_API_KEY", ""
        )

        if not self.base_url:
            raise MockBankError(
                "Mock Bank API URL is not configured."
            )

    @staticmethod
    def _validate_account_id(account_id):
        try:
            return str(uuid.UUID(str(account_id)))
        except (ValueError, TypeError, AttributeError) as exc:
            raise ValueError(
                "Invalid bank account ID."
            ) from exc

    def _request(
        self,
        method,
        endpoint,
        bearer_token,
        json_body=None
    ):
        if (
            not isinstance(bearer_token, str)
            or not bearer_token.strip()
        ):
            raise MockBankError(
                "Bank API credential is missing."
            )

        url = f"{self.base_url}/{endpoint.lstrip('/')}"

        headers = {
            "Authorization": f"Bearer {bearer_token}",
            "Accept": "application/json"
        }

        try:
            response = requests.request(
                method=method,
                url=url,
                headers=headers,
                json=json_body,
                timeout=(5, 75),
                allow_redirects=False
            )

        except requests.exceptions.Timeout as exc:
            raise MockBankError(
                "Mock Bank request timed out."
            ) from exc

        except requests.exceptions.RequestException as exc:
            raise MockBankError(
                "Could not connect to Mock Bank."
            ) from exc

        if response.status_code in (401, 403):
            raise MockBankError(
                "Bank API credential was rejected.",
                response.status_code
            )

        if response.status_code == 404:
            raise MockBankError(
                "Bank resource not found or not authorized.",
                404
            )

        if not response.ok:
            raise MockBankError(
                "Mock Bank API request failed.",
                response.status_code
            )

        try:
            data = response.json()
        except ValueError as exc:
            raise MockBankError(
                "Mock Bank returned invalid JSON."
            ) from exc

        if not isinstance(data, dict):
            raise MockBankError(
                "Unexpected Mock Bank response format."
            )

        return data

    def exchange_authorization_code(
        self,
        code,
        code_verifier,
        client_id,
        redirect_uri
    ):
        if not self.api_key:
            raise MockBankError(
                "Mock Bank exchange credential is missing."
            )

        return self._request(
            method="POST",
            endpoint="oauth/exchange",
            bearer_token=self.api_key,
            json_body={
                "grant_type": "authorization_code",
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "code": code,
                "code_verifier": code_verifier
            }
        )

    def get_authorized_accounts(self, access_token):
        return self._request(
            method="GET",
            endpoint="authorized/accounts",
            bearer_token=access_token
        )

    def get_account_balance(self, access_token, account_id):
        account_id = self._validate_account_id(account_id)

        return self._request(
            method="GET",
            endpoint=f"authorized/accounts/{account_id}/balance",
            bearer_token=access_token
        )

    def get_account_transactions(
        self,
        access_token,
        account_id
    ):
        account_id = self._validate_account_id(account_id)

        return self._request(
            method="GET",
            endpoint=f"authorized/accounts/{account_id}/transactions",
            bearer_token=access_token
        )

    def revoke_access(self, access_token):
        return self._request(
            method="POST",
            endpoint="authorized/revoke",
            bearer_token=access_token
        )
