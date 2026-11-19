import hmac
import secrets
from datetime import datetime, timezone
from functools import wraps

from flask import jsonify, request, session


def get_authenticated_user_id():
    # User IDs must come from Flask's signed session cookie.
    user_id = session.get("user_id")

    if not user_id:
        return None

    # Import locally to avoid circular imports during app setup.
    from app.extensions import db
    from app.models import User

    user = db.session.get(User, user_id)

    if user is None:
        session.clear()
        return None

    # Accounts without a credential-change timestamp
    # have no previous password reset to enforce.
    changed_at = user.credentials_changed_at

    if changed_at is None:
        return user_id

    authenticated_at_value = session.get("authenticated_at")

    if not isinstance(authenticated_at_value, str):
        session.clear()
        return None

    try:
        authenticated_at = datetime.fromisoformat(
            authenticated_at_value
        )
    except ValueError:
        session.clear()
        return None

    # Reject timestamps without timezone information.
    if authenticated_at.tzinfo is None:
        session.clear()
        return None

    # SQLite may return naive datetimes during isolated tests.
    # Our application stores credential-change times in UTC.
    if changed_at.tzinfo is None:
        changed_at = changed_at.replace(
            tzinfo=timezone.utc
        )

    authenticated_at = authenticated_at.astimezone(
        timezone.utc
    )

    changed_at = changed_at.astimezone(
        timezone.utc
    )

    # Sessions created before or at the credential change
    # are no longer authorised.
    if authenticated_at <= changed_at:
        session.clear()
        return None

    return user_id


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
