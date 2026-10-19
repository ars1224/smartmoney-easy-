
import base64
import hashlib
import secrets

from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlsplit

from flask import Blueprint, current_app, jsonify

from app.auth_security import (
    csrf_required,
    get_authenticated_user_id,
)
from app.extensions import db
from app.models import BankOAuthAttempt, User
from app.services.bank_crypto import encrypt_secret

from flask import request

from app.services.bank_oauth_callback import (
    complete_bank_authorization,
    BankOAuthCallbackError,
)
from app.services.mock_bank import MockBankError

from app.services.bank_oauth_confirm import (
    confirm_bank_connection,
    BankConfirmationError,
)

from app.services.bank_sync import sync_bank_connection

bank_oauth_bp = Blueprint(
    "bank_oauth",
    __name__,
    url_prefix="/api/bank/oauth"
)


@bank_oauth_bp.post("/start")
@csrf_required
def start_bank_oauth():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    user = db.session.get(User, user_id)

    if user is None:
        return jsonify({
            "error": "Authentication required."
        }), 401

    bank_url = current_app.config.get(
        "MOCK_BANK_API_BASE_URL", ""
    ).rstrip("/")

    client_id = current_app.config.get(
        "MOCK_BANK_OAUTH_CLIENT_ID"
    )

    redirect_uri = current_app.config.get(
        "MOCK_BANK_OAUTH_REDIRECT_URI"
    )

    if not all([bank_url, client_id, redirect_uri]):
        return jsonify({
            "error": "Bank OAuth configuration is missing."
        }), 503

    parsed_url = urlsplit(bank_url)

    if (
        not parsed_url.netloc
        or parsed_url.scheme not in ("http", "https")
        or (
            parsed_url.scheme == "http"
            and parsed_url.hostname not in ("localhost", "127.0.0.1")
        )
    ):
        return jsonify({
            "error": "Invalid Mock Bank URL configuration."
        }), 503

    # Generate an unpredictable OAuth state.
    state = secrets.token_urlsafe(32)

    state_hash = hashlib.sha256(
        state.encode("ascii")
    ).hexdigest()

    # Generate PKCE S256 verifier and challenge.
    code_verifier = secrets.token_urlsafe(64)

    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(
            code_verifier.encode("ascii")
        ).digest()
    ).rstrip(b"=").decode("ascii")

    now = datetime.now(timezone.utc)

    # Store the verifier encrypted, never in Angular.
    attempt = BankOAuthAttempt(
        user_id=user.id,
        state_hash=state_hash,
        code_verifier_encrypted=encrypt_secret(
            code_verifier
        ),
        expires_at=now + timedelta(minutes=10)
    )

    db.session.add(attempt)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

    parameters = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
    }

    authorization_url = (
        f"{bank_url}/authorize?"
        f"{urlencode(parameters)}"
    )

    response = jsonify({
        "authorization_url": authorization_url,
        "expires_in": 600
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 201


@bank_oauth_bp.post("/callback")
@csrf_required
def bank_oauth_callback():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Invalid request body."
        }), 400

    code = data.get("code")
    state = data.get("state")

    if not isinstance(code, str) or not isinstance(state, str):
        return jsonify({
            "error": "Code and state are required."
        }), 400

    try:
        result = complete_bank_authorization(
            user_id=user_id,
            state=state,
            authorization_code=code,
            client_id=current_app.config[
                "MOCK_BANK_OAUTH_CLIENT_ID"
            ],
            redirect_uri=current_app.config[
                "MOCK_BANK_OAUTH_REDIRECT_URI"
            ],
        )

        response = jsonify(result)
        response.headers["Cache-Control"] = "no-store"

        return response, 200

    except BankOAuthCallbackError as exc:
        return jsonify({
            "error": str(exc)
        }), 400

    except MockBankError:
        current_app.logger.exception(
            "Mock Bank OAuth exchange failed."
        )

        return jsonify({
            "error": "Unable to complete bank connection."
        }), 502

    except Exception:
        current_app.logger.exception(
            "Unexpected bank OAuth callback error."
        )

        return jsonify({
            "error": "Bank connection failed."
        }), 500


@bank_oauth_bp.post("/confirm")
@csrf_required
def confirm_bank_oauth():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Invalid request body."
        }), 400

    connection_id = data.get("connection_id")
    account_ids = data.get("account_ids")

    if not isinstance(connection_id, str):
        return jsonify({
            "error": "Connection ID is required."
        }), 400

    try:
        result = confirm_bank_connection(
            user_id=user_id,
            connection_id=connection_id,
            account_ids=account_ids
        )

    except BankConfirmationError as exc:
        return jsonify({
            "error": str(exc)
        }), exc.status_code

    except MockBankError:
        current_app.logger.exception(
            "Unable to verify approved bank accounts."
        )

        return jsonify({
            "error": "Unable to verify bank accounts."
        }), 502

    except Exception:
        current_app.logger.exception(
            "Bank confirmation failed."
        )

        return jsonify({
            "error": "Unable to confirm bank connection."
        }), 500

    # The connection is now committed.
    # Run the initial sync separately.
    try:
        sync_result = sync_bank_connection(
            result["connection_id"]
        )

        result["sync_status"] = "SUCCESS"
        result["sync"] = sync_result

        response = jsonify(result)
        response.headers["Cache-Control"] = "no-store"

        return response, 200

    except Exception:
        current_app.logger.exception(
            "Initial bank sync failed after confirmation."
        )

        # The connection remains saved.
        # The user can retry synchronisation.
        result["sync_status"] = "RETRY_REQUIRED"
        result["message"] = (
            "Bank connected, but the initial sync "
            "could not be completed. Please retry."
        )

        response = jsonify(result)
        response.headers["Cache-Control"] = "no-store"

        return response, 202
