
import hmac
import secrets
from functools import wraps

from flask import jsonify, request, session


def get_authenticated_user_id():
    # Flask verifies the signed session cookie.
    # Do not read user IDs from client-supplied headers.
    return session.get("user_id")


def issue_csrf_token():
    token = session.get("csrf_token")

    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token

    return token


def csrf_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        expected = session.get("csrf_token")
        provided = request.headers.get("X-CSRF-Token", "")

        if (
            not isinstance(expected, str)
            or not expected
            or not hmac.compare_digest(expected, provided)
        ):
            return jsonify({
                "error": "Invalid or missing CSRF token."
            }), 403

        return view(*args, **kwargs)

    return wrapped
