from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, session
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.auth_security import (
    csrf_required,
    get_authenticated_user_id,
    issue_csrf_token,
)
from app.extensions import db
from app.models import OnboardingProgress, User
from app.services.recovery_attempts import (
    check_recovery_attempt,
)
from app.services.recovery_codes import (
    generate_recovery_code,
    hash_recovery_code,
)


auth_bp = Blueprint(
    "auth",
    __name__,
    url_prefix="/api/auth"
)

def public_user(user):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
    }


def recovery_response(data, status_code):
    """Return a recovery response without allowing HTTP caching."""

    response = jsonify(data)

    response.headers["Cache-Control"] = "no-store"

    return response, status_code


@auth_bp.get("/csrf")
def get_csrf():
    return jsonify({
        "csrf_token": issue_csrf_token()
    }), 200


@auth_bp.post("/recovery/verify")
@csrf_required
def verify_account_recovery():
    """Verify recovery credentials without authenticating the user."""

    generic_error = {
        "error": (
            "Unable to verify recovery details. "
            "Check your information or try again later."
        )
    }

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return recovery_response(
            generic_error,
            400,
        )

    email = data.get("email")
    name = data.get("name")
    recovery_code = data.get("recoveryCode")

    # Validate request types without exposing account information.
    if (
        not isinstance(email, str)
        or not isinstance(name, str)
        or not isinstance(recovery_code, str)
    ):
        return recovery_response(
            generic_error,
            400,
        )

    try:
        # This service locks the user row while checking credentials
        # and updating failed-attempt counters.
        user = check_recovery_attempt(
            email=email,
            name=name,
            recovery_code=recovery_code,
        )

        # Persist counter changes and release the database row lock.
        db.session.commit()

    except SQLAlchemyError:
        db.session.rollback()

        return recovery_response(
            {
                "error": (
                    "Recovery verification is temporarily unavailable. "
                    "Please try again later."
                )
            },
            503,
        )

    if user is None:
        return recovery_response(
            generic_error,
            400,
        )

    # Verification alone must not create an authenticated session.
    # The reset endpoint will verify the recovery code again.
    return recovery_response(
        {
            "verified": True,
        },
        200,
    )

@auth_bp.post("/recovery/reset")
@csrf_required
def reset_account_password():
    """Reset a password using verified account recovery credentials."""

    generic_error = {
        "error": (
            "Unable to verify recovery details. "
            "Check your information or try again later."
        )
    }

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return recovery_response(
            generic_error,
            400,
        )

    email = data.get("email")
    name = data.get("name")
    recovery_code = data.get("recoveryCode")

    new_password = data.get("newPassword")
    confirm_password = data.get("confirmPassword")

    # Validate the required request fields.
    if (
        not isinstance(email, str)
        or not isinstance(name, str)
        or not isinstance(recovery_code, str)
        or not isinstance(new_password, str)
        or not isinstance(confirm_password, str)
    ):
        return recovery_response(
            generic_error,
            400,
        )

    # Apply the same password-length rules as registration.
    if (
        len(new_password) < 12
        or len(new_password) > 128
    ):
        return recovery_response(
            {
                "error": (
                    "New password must contain "
                    "between 12 and 128 characters."
                )
            },
            400,
        )

    # The password confirmation must match.
    if new_password != confirm_password:
        return recovery_response(
            {
                "error": "Passwords do not match."
            },
            400,
        )

    try:
        # Reverify recovery credentials inside this transaction.
        # This also enforces failed-attempt limits and lockouts.
        user = check_recovery_attempt(
            email=email,
            name=name,
            recovery_code=recovery_code,
        )

        if user is None:
            # Save any updated failed-attempt counters.
            db.session.commit()

            return recovery_response(
                generic_error,
                400,
            )

        # Prevent resetting the password to the current password.
        if user.check_password(new_password):
            db.session.commit()

            return recovery_response(
                {
                    "error": (
                        "New password must be different "
                        "from the current password."
                    )
                },
                400,
            )

        # Generate a replacement recovery code.
        new_recovery_code = generate_recovery_code()

        # Ensure the previous recovery code cannot remain valid.
        while (
            new_recovery_code
            == recovery_code.strip().upper()
        ):
            new_recovery_code = generate_recovery_code()

        # Update the password hash.
        user.set_password(new_password)

        # Replace the old recovery-code hash.
        user.recovery_code_hash = hash_recovery_code(
            new_recovery_code
        )

        # Reset recovery security counters.
        user.recovery_failed_attempts = 0
        user.recovery_locked_until = None

        # Invalidate sessions authenticated before this reset.
        user.credentials_changed_at = datetime.now(
            timezone.utc
        )

        # Commit all account changes together.
        db.session.commit()

    except SQLAlchemyError:
        db.session.rollback()

        return recovery_response(
            {
                "error": (
                    "Unable to reset password. "
                    "Please try again later."
                )
            },
            503,
        )

    # A password reset must not automatically authenticate the user.
    session.clear()

    # Display the replacement recovery code only in this response.
    return recovery_response(
        {
            "message": "Password reset successfully.",
            "recovery_code": new_recovery_code,
        },
        200,
    )


@auth_bp.post("/register")
@csrf_required
def register():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Invalid request body."
        }), 400

    name = data.get("name")
    email = data.get("email")
    password = data.get("password")

    # Validate name
    if not isinstance(name, str):
        return jsonify({
            "error": "Valid name is required."
        }), 400

    name = name.strip()

    if len(name) < 2 or len(name) > 100:
        return jsonify({
            "error": "Name must be between 2 and 100 characters."
        }), 400

    # Validate email
    if not isinstance(email, str):
        return jsonify({
            "error": "Valid email is required."
        }), 400

    email = email.strip().lower()

    if (
        not email
        or len(email) > 255
        or "@" not in email
    ):
        return jsonify({
            "error": "Valid email is required."
        }), 400

    # Validate password
    if (
        not isinstance(password, str)
        or len(password) < 12
        or len(password) > 128
    ):
        return jsonify({
            "error": "Password must be 12–128 characters."
        }), 400

    # Check duplicate email
    if User.query.filter_by(email=email).first():
        return jsonify({
            "error": "Email is already registered."
        }), 409

    # Create user
    user = User(
        name=name,
        email=email
    )

    user.set_password(password)

    # Generate a secure account recovery code.
    recovery_code = generate_recovery_code()

    # Store only the hashed recovery code.
    user.recovery_code_hash = hash_recovery_code(
        recovery_code
    )

    try:
        db.session.add(user)
        db.session.flush()

        # Every newly registered user must complete onboarding.
        db.session.add(
            OnboardingProgress(
                user_id=user.id,
                status="IN_PROGRESS",
                current_step="EMPLOYMENT",
            )
        )

        db.session.commit()

    except IntegrityError:
        db.session.rollback()
        return jsonify({
            "error": "Email is already registered."
        }), 409

    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({
            "error": "Unable to create account. Please try again."
        }), 500

    # Create session
    session.clear()
    session.permanent = True
    session["user_id"] = user.id
    session["authenticated_at"] = datetime.now(
        timezone.utc
    ).isoformat()

    return recovery_response(
        {
            "message": "Account created successfully.",
            "user": public_user(user),
            "csrf_token": issue_csrf_token(),
            "recovery_code": recovery_code,
        },
        201,
    )



@auth_bp.post("/login")
@csrf_required
def login():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Invalid request body."
        }), 400

    email = data.get("email")
    password = data.get("password")

    if not isinstance(email, str) or not isinstance(password, str):
        return jsonify({
            "error": "Invalid email or password."
        }), 401

    email = email.strip().lower()

    user = User.query.filter_by(email=email).first()

    if user is None or not user.check_password(password):
        return jsonify({
            "error": "Invalid email or password."
        }), 401

    session.clear()
    session.permanent = True
    session["user_id"] = user.id
    session["authenticated_at"] = datetime.now(
        timezone.utc
    ).isoformat()

    return jsonify({
        "message": "Login successful.",
        "user": public_user(user),
        "csrf_token": issue_csrf_token(),
    }), 200


@auth_bp.get("/me")
def current_user():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    user = db.session.get(User, user_id)

    if user is None:
        session.clear()
        return jsonify({
            "error": "Authentication required."
        }), 401

    return jsonify({
        "user": public_user(user)
    }), 200


@auth_bp.put("/profile")
@csrf_required
def update_profile():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    user = db.session.get(User, user_id)

    if user is None:
        session.clear()
        return jsonify({
            "error": "Authentication required."
        }), 401

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Invalid request body."
        }), 400

    name = data.get("name")
    email = data.get("email")

    if not isinstance(name, str):
        return jsonify({
            "error": "Valid name is required."
        }), 400

    name = name.strip()

    if len(name) < 2 or len(name) > 100:
        return jsonify({
            "error": "Name must be between 2 and 100 characters."
        }), 400

    if not isinstance(email, str):
        return jsonify({
            "error": "Valid email is required."
        }), 400

    email = email.strip().lower()

    if (
        not email
        or len(email) > 255
        or "@" not in email
    ):
        return jsonify({
            "error": "Valid email is required."
        }), 400

    existing_user = User.query.filter(
        User.email == email,
        User.id != user.id
    ).first()

    if existing_user:
        return jsonify({
            "error": "Email is already registered."
        }), 409

    user.name = name
    user.email = email

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({
            "error": "Email is already registered."
        }), 409

    return jsonify({
        "message": "Profile updated successfully.",
        "user": public_user(user)
    }), 200


@auth_bp.post("/change-password")
@csrf_required
def change_password():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    user = db.session.get(User, user_id)

    if user is None:
        session.clear()
        return jsonify({
            "error": "Authentication required."
        }), 401

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "Invalid request body."
        }), 400

    current_password = data.get("currentPassword")
    new_password = data.get("newPassword")

    if not isinstance(current_password, str) or not isinstance(new_password, str):
        return jsonify({
            "error": "Current and new passwords are required."
        }), 400

    if not user.check_password(current_password):
        return jsonify({
            "error": "Current password is incorrect."
        }), 400

    if (
        len(new_password) < 12
        or len(new_password) > 128
    ):
        return jsonify({
            "error": "New password must be 12–128 characters."
        }), 400

    if current_password == new_password:
        return jsonify({
            "error": "New password must be different from the current password."
        }), 400

    # Update the password hash.
    user.set_password(new_password)

    # Invalidate sessions authenticated before this password change.
    user.credentials_changed_at = datetime.now(
        timezone.utc
    )

    try:
        db.session.commit()

    except SQLAlchemyError:
        db.session.rollback()

        return jsonify({
            "error": "Unable to update password. Please try again."
        }), 500

    # Keep the current device authenticated after changing its password.
    # Previously authenticated sessions will fail the timestamp check.
    session["authenticated_at"] = datetime.now(
        timezone.utc
    ).isoformat()

    return jsonify({
        "message": "Password updated successfully."
    }), 200


@auth_bp.post("/logout")
@csrf_required
def logout():
    session.clear()

    return jsonify({
        "message": "Logged out successfully."
    }), 200
