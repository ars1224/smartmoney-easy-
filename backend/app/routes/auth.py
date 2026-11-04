from flask import Blueprint, jsonify, request, session
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.extensions import db
from app.models import User
from app.auth_security import (
    csrf_required,
    get_authenticated_user_id,
    issue_csrf_token,
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


@auth_bp.get("/csrf")
def get_csrf():
    return jsonify({
        "csrf_token": issue_csrf_token()
    }), 200



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

    db.session.add(user)

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({
            "error": "Email is already registered."
        }), 409

    # Create session
    session.clear()
    session.permanent = True
    session["user_id"] = user.id

    return jsonify({
        "message": "Account created successfully.",
        "user": public_user(user),
        "csrf_token": issue_csrf_token(),
    }), 201



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

    user.set_password(new_password)

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({
            "error": "Unable to update password. Please try again."
        }), 500

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
