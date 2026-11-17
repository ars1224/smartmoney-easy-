"""Authenticated educational replies; explicit demo/live modes."""
from flask import Blueprint, jsonify, request, current_app
from app.auth_security import get_authenticated_user_id, csrf_required
from sqlalchemy.exc import SQLAlchemyError
from app.extensions import db
from app.services.thinker_finances import financial_reply
from app.services.app_help import demo_app_reply, help_links
from app.services.thinker import ThinkerError, get_reply, reserve_request

thinker_bp = Blueprint("thinker", __name__, url_prefix="/api/thinker")

TOPICS = {
    "budget": (
        "Build a simple budget",
        "Start with money you have actually received. List essentials such as rent, groceries, transport and bills, including costs that do not happen every week. Then decide what you can set aside for savings and flexible spending. Review the plan when your income or costs change.",
        "Write down one bill due before your next payday."
    ),
    "saving": (
        "Plan a savings goal",
        "Choose a target and a realistic date. Divide the amount still needed by the number of weeks available. For example, saving $120 over six weeks means $20 per week. These are example figures, not a recommendation based on your finances.",
        "Pick one goal and work out a weekly amount you could review."
    ),
    "spending": (
        "Understand your spending",
        "Review your recorded transactions for the same period and group expenses by category. Check uncategorised entries and separate transfers between your own accounts from spending. A cash-flow total describes recorded movement; it is not an available bank balance.",
        "Check one recent transaction and confirm its category."
    ),
}

@thinker_bp.post("/messages")
@csrf_required
def message():
    if not get_authenticated_user_id():
        return jsonify(error="Sign in to use Thinker."), 401
    if request.content_length and request.content_length > 8192:
        return jsonify(error="Message is too long."), 413
    data = request.get_json(silent=True)
    text = data.get("message") if isinstance(data, dict) else None
    if not isinstance(text, str) or not text.strip() or len(text) > 600:
        return jsonify(error="Enter a message between 1 and 600 characters."), 400
    mode = current_app.config.get("THINKER_MODE", "demo")
    if mode in ("demo", "live"):
        try:
            saved_reply = financial_reply(get_authenticated_user_id(), text.strip())
            if saved_reply:
                response = jsonify(saved_reply)
                response.headers["Cache-Control"] = "private, no-store"
                return response
        except ValueError as error:
            return jsonify(error=str(error)), 400
        except SQLAlchemyError:
            db.session.rollback()
            response = jsonify(error="Saved financial data is unavailable. Please try again.")
            response.status_code = 503
            response.headers["Cache-Control"] = "private, no-store"
            return response
    if mode == "live":
        if not current_app.config.get("OPENAI_API_KEY") or current_app.config.get(
            "OPENAI_MODEL"
        ) != "gpt-5.4-mini":
            return jsonify(error="Thinker is not configured. Please contact the project team."), 503
        try:
            reserve_request(current_app, get_authenticated_user_id())
            response = jsonify(get_reply(current_app.config, text.strip()))
            response.headers["Cache-Control"] = "private, no-store"
            return response
        except ThinkerError as error:
            response = jsonify(error=str(error))
            response.status_code = error.status
            response.headers["Cache-Control"] = "private, no-store"
            if error.retry_after:
                response.headers["Retry-After"] = str(error.retry_after)
            return response
    if mode != "demo":
        return jsonify(error="Thinker is unavailable. Please try again later."), 503
    app_reply = demo_app_reply(text)
    if app_reply:
        response = jsonify(app_reply)
        response.headers["Cache-Control"] = "private, no-store"
        return response
    words = text.lower()
    if any(term in words for term in ("budget", "payday", "bill")):
        topic = "budget"
    elif any(term in words for term in ("sav", "goal")):
        topic = "saving"
    elif any(term in words for term in ("spend", "categor", "cash flow", "transaction")):
        topic = "spending"
    else:
        topic = None
    title, body, takeaway = TOPICS[topic] if topic else (
        "Try a demo topic",
        "This demo offers prepared explanations about budgeting, saving and understanding spending. It cannot answer other questions, view your accounts or remember earlier messages. Choose Using SmartMoney for app instructions.",
        "Choose one of the suggested topics below."
    )
    response = jsonify(
        mode="demo",
        title=title,
        message=body,
        takeaway=takeaway,
        links=help_links(text)
    )
    response.headers["Cache-Control"] = "private, no-store"
    return response


@thinker_bp.get("/status")
def status():
    if not get_authenticated_user_id():
        return jsonify(error="Sign in to use Thinker."), 401
    mode = current_app.config.get("THINKER_MODE", "demo")
    available = mode == "demo" or (
        mode == "live" and bool(current_app.config.get("OPENAI_API_KEY")) and current_app.config.get(
            "OPENAI_MODEL"
        ) == "gpt-5.4-mini"
    )
    response = jsonify(
        mode=mode if mode in ("demo", "live") else "unavailable",
        available=available
    )
    response.headers["Cache-Control"] = "private, no-store"
    return response
