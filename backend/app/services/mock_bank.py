import requests

from flask import current_app


class MockBankError(Exception):
    """Raised when communication with the Mock Bank API fails."""

    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


class MockBankClient:
    """Server-side client for the Mock Bank API."""

    def __init__(self):
        self.base_url = current_app.config.get(
            "MOCK_BANK_API_BASE_URL", ""
        ).rstrip("/")

        self.api_key = current_app.config.get(
            "MOCK_BANK_API_KEY", ""
        )

        if not self.base_url or not self.api_key:
            raise MockBankError(
                "Mock Bank API configuration is missing."
            )

    def _get(self, endpoint, params=None):
        url = f"{self.base_url}/{endpoint.lstrip('/')}"


        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
        }


        try:
            response = requests.get(
                url,
                headers=headers,
                params=params,
                timeout=(5, 75),
                allow_redirects=False,
            )

        except requests.exceptions.Timeout as exc:
            raise MockBankError(
                "The Mock Bank API request timed out."
            ) from exc

        except requests.exceptions.RequestException as exc:
            raise MockBankError(
                "Could not connect to the Mock Bank API."
            ) from exc

        if response.status_code in (401, 403):
            raise MockBankError(
                "Mock Bank API authentication failed.",
                response.status_code,
            )

        if response.status_code == 404:
            raise MockBankError(
                "The requested Mock Bank resource was not found.",
                404,
            )

        if not response.ok:
            raise MockBankError(
                "The Mock Bank API returned an error.",
                response.status_code,
            )

        try:
            return response.json()

        except ValueError as exc:
            raise MockBankError(
                "The Mock Bank API returned invalid JSON."
            ) from exc

    @staticmethod
    def _validate_id(identifier):
        import re

        value = str(identifier)

        if not re.fullmatch(r"[A-Za-z0-9_-]+", value):
            raise ValueError("Invalid Mock Bank identifier.")

        return value

    def lookup_customer(self, email):
        if not isinstance(email, str) or not email.strip():
            raise ValueError("Customer email is required.")

        return self._get(
            "customers/lookup",
            params={"email": email.strip()},
        )

    def get_customer_accounts(self, customer_id):
        customer_id = self._validate_id(customer_id)

        return self._get(
            f"customers/{customer_id}/accounts"
        )

    def get_account_balance(self, account_id):
        account_id = self._validate_id(account_id)

        return self._get(
            f"accounts/{account_id}/balance"
        )

    def get_account_transactions(self, account_id):
        account_id = self._validate_id(account_id)

        return self._get(
            f"accounts/{account_id}/transactions"
        )
