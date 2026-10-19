
import getpass
import secrets
import uuid
import webbrowser

from urllib.parse import urlsplit, parse_qs

import requests

import subprocess

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from queue import Queue, Empty, Full
from threading import Thread


SMARTMONEY_URL = "http://127.0.0.1:5000"
MOCK_BANK_URL = "http://127.0.0.1:5001"

http = requests.Session()
http.trust_env = False


def api_request(method, url, expected, **kwargs):
    response = http.request(
        method,
        url,
        timeout=90,
        **kwargs,
    )

    if response.status_code not in expected:
        raise RuntimeError(
            f"{method} {urlsplit(url).path} failed: "
            f"HTTP {response.status_code} "
            f"{response.text[:300]}"
        )

    return response.json()


print("Checking local applications...")

smart_status = http.get(
    f"{SMARTMONEY_URL}/api/auth/me",
    timeout=10,
).status_code

bank_status = http.get(
    f"{MOCK_BANK_URL}/api/v1/authorized/accounts",
    timeout=10,
).status_code

assert smart_status == 401, smart_status
assert bank_status == 401, bank_status

print("Both local APIs reachable: OK")


# Create a temporary SmartMoney account.
email = f"oauth-live-{uuid.uuid4().hex}@example.test"
password = secrets.token_urlsafe(24)

csrf = api_request(
    "GET",
    f"{SMARTMONEY_URL}/api/auth/csrf",
    {200},
)["csrf_token"]

registration = api_request(
    "POST",
    f"{SMARTMONEY_URL}/api/auth/register",
    {201},
    json={
        "email": email,
        "password": password,
    },
    headers={"X-CSRF-Token": csrf},
)

csrf = registration["csrf_token"]

print("Temporary SmartMoney user registered: OK")


# Start real OAuth with SmartMoney.
start = api_request(
    "POST",
    f"{SMARTMONEY_URL}/api/bank/oauth/start",
    {201},
    headers={"X-CSRF-Token": csrf},
)

authorization_url = start["authorization_url"]
parsed_start = urlsplit(authorization_url)

assert parsed_start.hostname in (
    "localhost",
    "127.0.0.1",
)

assert parsed_start.port == 5001

expected_state = parse_qs(
    parsed_start.query
)["state"][0]

print("Real OAuth authorization started: OK")
print()
print("Opening Mock Bank in your browser...")
print("Log in using your separate Mock Bank account.")
print("Approve the bank accounts you want to share.")


# Capture the OAuth redirect automatically on localhost:8100.
# Ionic must be stopped so this test can use that port.

callback_events = Queue(maxsize=1)

expected_redirect_uri = parse_qs(
    parsed_start.query
)["redirect_uri"][0]

expected_callback = urlsplit(expected_redirect_uri)

if (
    expected_callback.scheme != "http"
    or expected_callback.hostname not in ("localhost", "127.0.0.1")
    or expected_callback.port != 8100
    or expected_callback.path != "/bank/callback"
):
    raise RuntimeError(
        "Unexpected configured OAuth redirect URI."
    )


class OAuthCallbackReceiver(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        # Never log OAuth codes or state values.
        pass

    def do_GET(self):
        target = urlsplit(self.path)

        if target.path == "/bank/callback":
            try:
                callback_events.put_nowait(self.path)
            except Full:
                pass

            # Remove the code from the browser address bar.
            self.send_response(303)
            self.send_header(
                "Location",
                "/oauth-test-complete"
            )
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            return

        if target.path == "/oauth-test-complete":
            content = (
                "<h2>Bank authorisation received</h2>"
                "<p>Return to your PowerShell terminal "
                "to see the test results.</p>"
            ).encode("utf-8")

            self.send_response(200)
            self.send_header(
                "Content-Type",
                "text/html; charset=utf-8"
            )
            self.send_header(
                "Content-Length",
                str(len(content))
            )
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(content)
            return

        self.send_response(404)
        self.end_headers()


try:
    receiver = ThreadingHTTPServer(
        ("127.0.0.1", 8100),
        OAuthCallbackReceiver
    )
except OSError as exc:
    raise RuntimeError(
        "Unable to start callback receiver on port 8100. "
        "Stop Ionic and any other application using that port."
    ) from exc

receiver_thread = Thread(
    target=receiver.serve_forever,
    daemon=True
)

receiver_thread.start()

try:
    print("OAuth callback receiver listening on port 8100.")
    print("Opening Mock Bank...")

    webbrowser.open(authorization_url)

    print(
        "Approve the bank connection in your browser. "
        "The callback will be captured automatically."
    )

    try:
        callback_path = callback_events.get(timeout=300)
    except Empty:
        raise RuntimeError(
            "OAuth callback was not received. "
            "Start a new authorisation attempt."
        )

finally:
    receiver.shutdown()
    receiver.server_close()
    receiver_thread.join(timeout=5)


parsed_callback = urlsplit(callback_path)
parameters = parse_qs(parsed_callback.query)

if parsed_callback.path != expected_callback.path:
    raise RuntimeError("Unexpected OAuth callback path.")

if "error" in parameters:
    raise RuntimeError(
        "Mock Bank authorisation was cancelled or rejected."
    )

code = parameters.get("code", [None])[0]
state = parameters.get("state", [None])[0]

if not code or state != expected_state:
    raise RuntimeError(
        "Missing authorisation code or invalid OAuth state."
    )

print("OAuth redirect state verified: OK")



# Exchange the real bank authorization code.
callback = api_request(
    "POST",
    f"{SMARTMONEY_URL}/api/bank/oauth/callback",
    {200},
    json={
        "code": code,
        "state": state,
    },
    headers={"X-CSRF-Token": csrf},
)

assert callback["status"] == "PENDING"

connection_id = callback["connection_id"]
accounts = callback["accounts"]

assert accounts, "No authorized accounts returned."

print("Real authorization code exchanged: OK")
print("Pending bank connection created: OK")
print()
print("Authorized bank accounts:")

for index, account in enumerate(accounts, start=1):
    print(
        f"{index}. {account['account_name']} "
        f"({account['currency']})"
    )


# Select accounts for SmartMoney.
selection = input(
    "\nChoose account numbers (e.g. 1 or 1,2) [1]: "
).strip() or "1"

try:
    indexes = {
        int(value.strip())
        for value in selection.split(",")
    }

    if not indexes or any(
        index < 1 or index > len(accounts)
        for index in indexes
    ):
        raise ValueError

except ValueError:
    raise RuntimeError("Invalid account selection.")

selected_ids = [
    accounts[index - 1]["id"]
    for index in sorted(indexes)
]


# Confirm and synchronise selected accounts.
confirmation = api_request(
    "POST",
    f"{SMARTMONEY_URL}/api/bank/oauth/confirm",
    {200, 202},
    json={
        "connection_id": connection_id,
        "account_ids": selected_ids,
    },
    headers={"X-CSRF-Token": csrf},
)

assert confirmation["status"] == "CONNECTED"

print()
print("Bank connection confirmed: OK")
print(
    "Accounts connected:",
    confirmation["accounts_connected"],
)
print(
    "Initial sync status:",
    confirmation["sync_status"],
)

if confirmation["sync_status"] != "SUCCESS":
    raise RuntimeError(
        "Bank connected, but initial sync requires retry."
    )

print("Real bank synchronization: OK")
print()
print("ALL REAL MOCK BANK OAUTH TESTS PASSED!")
print()
print(
    "Note: Temporary test user and connection records "
    "remain in your development database for review."
)
