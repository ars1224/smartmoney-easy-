from uuid import UUID

from sqlalchemy.exc import IntegrityError

from app.services.goal_funding import (
    GoalFundingError,
    change_goal_funding,
    get_funding_source,
)

from app.services.goal_purchases import link_goal_purchase
import re
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models import (
    BankAccount,
    BankConnection,
    CashWallet,
    GoalFundingMovement,
    SavingsGoal,
    SavingsGoalContribution,
    Transaction,
)
from app.auth_security import (
    get_authenticated_user_id,
    csrf_required,
)

from sqlalchemy import func


savings_goals_bp = Blueprint(
    "savings_goals",
    __name__,
    url_prefix="/api/savings-goals",
)


MAX_AMOUNT = Decimal("999999999999.99")
CENT = Decimal("0.01")

VALID_GOAL_GROUPS = {"NEEDS", "WANTS", "SAVINGS"}


def parse_goal_group(value):
    if not isinstance(value, str):
        raise ValueError("Goal group must be text.")

    if value not in VALID_GOAL_GROUPS:
        raise ValueError(
            "Goal group must be NEEDS, WANTS or SAVINGS."
        )

    return value


def serialize_goal(goal):
    spent_amount = (
        db.session.query(
            func.coalesce(
                func.sum(-Transaction.amount),
                Decimal("0.00"),
            )
        )
        .filter(
            Transaction.user_id == goal.user_id,
            Transaction.goal_id == goal.id,
            Transaction.amount < 0,
        )
        .scalar()
    )
    return {
        "id": goal.id,
        "name": goal.name,
        "targetAmount": str(goal.target_amount),
        "savedAmount": str(goal.saved_amount),
        "spentAmount": str(spent_amount or Decimal("0.00")),
        "legacyUnverifiedAmount": str(goal.legacy_unverified_amount),
        "targetDate": goal.target_date.isoformat(),
        "createdAt": goal.created_at.isoformat(),
        "updatedAt": goal.updated_at.isoformat(),
        "group": goal.goal_group,
        "achievedAt": (
            goal.achieved_at.isoformat()
            if goal.achieved_at
            else None
        ),
    }


def parse_amount(value, allow_zero=False):
    if value is None or isinstance(value, bool):
        raise ValueError("A valid amount is required.")

    try:
        amount = Decimal(str(value))
        rounded = amount.quantize(CENT)
    except (InvalidOperation, ValueError):
        raise ValueError("Invalid monetary amount.")

    if not amount.is_finite():
        raise ValueError("Amount must be finite.")

    if amount != rounded:
        raise ValueError(
            "Amount cannot have more than two decimal places."
        )

    if amount < 0 or (amount == 0 and not allow_zero):
        raise ValueError(
            "Amount must be non-negative."
            if allow_zero
            else "Amount must be greater than zero."
        )

    if amount > MAX_AMOUNT:
        raise ValueError("Amount exceeds the supported limit.")

    return rounded


def parse_target_date(value):
    if not isinstance(value, str):
        raise ValueError("A valid target date is required.")

    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError(
            "Target date must use YYYY-MM-DD format."
        )

    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError("Invalid target date.")

@savings_goals_bp.get("")
def get_savings_goals():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    goals = (
        SavingsGoal.query
        .filter_by(user_id=user_id)
        .order_by(SavingsGoal.created_at.desc())
        .all()
    )

    response = jsonify({
        "goals": [
            serialize_goal(goal)
            for goal in goals
        ],
        "count": len(goals),
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200

@savings_goals_bp.get("/funding-summary")
def get_savings_funding_summary():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    accounts = (
        db.session.query(
            BankAccount.id,
            BankConnection.last_synced_at,
        )
        .join(
            BankConnection,
            BankAccount.connection_id == BankConnection.id,
        )
        .filter(
            BankConnection.user_id == user_id,
            BankConnection.status == "CONNECTED",
            BankAccount.is_connected.is_(True),
            BankAccount.status == "ACTIVE",
            BankAccount.currency == "NZD",
            func.upper(
                func.trim(BankAccount.account_type)
            ) == "SAVINGS",
        )
        .all()
    )

    zero = Decimal("0.00")

    linked_balance = zero
    allocated_from_savings = zero
    available_for_goals = zero
    savings_shortfall = zero

    for account in accounts:
        source = get_funding_source(
            user_id,
            "BANK_ACCOUNT",
            account.id,
        )

        linked_balance += source["currentBalance"]
        allocated_from_savings += source["allocated"]
        available_for_goals += source["available"]
        savings_shortfall += source["shortfall"]

    sync_dates = [
        account.last_synced_at
        for account in accounts
        if account.last_synced_at is not None
    ]

    last_synced_at = (
        min(sync_dates).isoformat()
        if sync_dates else None
    )

    has_accounts = bool(accounts)

    response = jsonify({
        "linkedSavingsBalance": (
            str(linked_balance) if has_accounts else None
        ),
        "allocatedFromSavings": (
            str(allocated_from_savings) if has_accounts else None
        ),
        "availableForGoals": (
            str(available_for_goals) if has_accounts else None
        ),
        "savingsShortfall": (
            str(savings_shortfall) if has_accounts else None
        ),
        "savingsAccountCount": len(accounts),
        "currency": "NZD",
        "lastSyncedAt": last_synced_at,
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200


@savings_goals_bp.post("")
@csrf_required
def create_savings_goal():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "A JSON object is required."
        }), 400

    name = data.get("name")

    if not isinstance(name, str):
        return jsonify({
            "error": "Goal name is required."
        }), 400

    name = name.strip()

    if not name or len(name) > 80:
        return jsonify({
            "error": "Goal name must be 1–80 characters."
        }), 400

    try:
        target_amount = parse_amount(
            data.get("targetAmount")
        )

        goal_group = parse_goal_group(
            data.get("group", "SAVINGS")
        )

        saved_amount = parse_amount(
            data.get("savedAmount", 0),
            allow_zero=True,
        )

        if saved_amount != Decimal("0.00"):
            raise ValueError(
                "Initial savings must be allocated from "
                "a connected Savings Account or Cash Wallet."
            )

        target_date = parse_target_date(
            data.get("targetDate")
        )

    except ValueError as error:
        return jsonify({
            "error": str(error)
        }), 400

    goal = SavingsGoal(
        user_id=user_id,
        name=name,
        goal_group=goal_group,
        target_amount=target_amount,
        saved_amount=saved_amount,
        target_date=target_date,
    )

    db.session.add(goal)
    db.session.commit()

    response = jsonify({
        "message": "Savings goal created successfully.",
        "goal": serialize_goal(goal),
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 201


@savings_goals_bp.patch("/<goal_id>")
@csrf_required
def update_savings_goal(goal_id):
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    data = request.get_json(silent=True)

    if not isinstance(data, dict) or not data:
        return jsonify({
            "error": "A non-empty JSON object is required."
        }), 400

    allowed = {
        "name",
        "group",
        "targetAmount",
        "targetDate",
    }

    if not set(data).issubset(allowed):
        return jsonify({
            "error": "Unsupported goal field."
        }), 400

    goal = (
        SavingsGoal.query
        .filter_by(id=goal_id, user_id=user_id)
        .with_for_update()
        .first()
    )

    if goal is None:
        return jsonify({
            "error": "Savings goal not found."
        }), 404

    if goal.achieved_at is not None:
        db.session.rollback()

        return jsonify({
            "error": (
                "An achieved goal cannot be edited."
            )
        }), 409

    changes = {}

    try:
        if "name" in data:
            name = data["name"]

            if not isinstance(name, str):
                raise ValueError("Goal name must be text.")

            name = name.strip()

            if not name or len(name) > 80:
                raise ValueError(
                    "Goal name must be 1-80 characters."
                )

            changes["name"] = name

        # Group classification can be updated independently.
        if "group" in data:
            changes["goal_group"] = parse_goal_group(
                data["group"]
            )

        if "targetAmount" in data:
            changes["target_amount"] = parse_amount(
                data["targetAmount"]
            )

        if "targetDate" in data:
            changes["target_date"] = parse_target_date(
                data["targetDate"]
            )

    except ValueError as error:
        db.session.rollback()
        return jsonify({"error": str(error)}), 400

    if "target_amount" in changes:
        spent_amount = (
            db.session.query(func.sum(-Transaction.amount))
            .filter(
                Transaction.user_id == user_id,
                Transaction.goal_id == goal.id,
                Transaction.amount < 0,
            )
            .scalar()
        )

        spent_amount = Decimal(str(spent_amount or 0))

        minimum_target = goal.saved_amount + spent_amount

    if changes["target_amount"] < minimum_target:
        db.session.rollback()

        return jsonify({
            "error": (
                "The target cannot be lower than "
                "the total allocated and spent amount."
                )
        }), 409

    for field, value in changes.items():
        setattr(goal, field, value)

    db.session.commit()

    response = jsonify({
        "message": "Savings goal updated successfully.",
        "goal": serialize_goal(goal),
    })
    response.headers["Cache-Control"] = "no-store"

    return response, 200


@savings_goals_bp.delete("/<goal_id>")
@csrf_required
def delete_savings_goal(goal_id):
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    goal = (
        SavingsGoal.query
        .filter_by(id=goal_id, user_id=user_id)
        .with_for_update()
        .first()
    )

    if goal.achieved_at is not None:
        db.session.rollback()

        return jsonify({
            "error": (
                "An achieved goal cannot be deleted."
            )
        }), 409

    has_linked_purchase = (
        db.session.query(Transaction.id)
        .filter(
            Transaction.user_id == user_id,
            Transaction.goal_id == goal.id,
        )
        .first()
        is not None
    )

    if has_linked_purchase:
        db.session.rollback()

        return jsonify({
            "error": (
                "This goal cannot be deleted because "
                "it has linked purchases. Its financial "
                "history must be preserved."
            )
        }), 409

    # Preserve the funding ledger.
    # Even fully released allocations remain part of
    # the goal's financial history.
    has_funding_history = (
        db.session.query(GoalFundingMovement.id)
        .filter(
            GoalFundingMovement.goal_id == goal.id
        )
        .first()
        is not None
    )

    if has_funding_history:
        db.session.rollback()

        return jsonify({
            "error": (
                "This goal cannot be deleted because it has "
                "funding history. Its allocation records "
                "must be preserved."
            )
        }), 409

    db.session.delete(goal)
    db.session.commit()

    response = jsonify({
        "message": "Savings goal deleted successfully."
    })
    response.headers["Cache-Control"] = "no-store"

    return response, 200

@savings_goals_bp.post("/<goal_id>/contributions")
@csrf_required
def add_savings_contribution(goal_id):
    # Compatibility route.
    # Contributions now require a verified funding source.
    return handle_goal_funding_change(
        goal_id,
        release=False,
    )

def parse_funding_request(data):
    if not isinstance(data, dict):
        raise ValueError("A JSON object is required.")

    required = {
        "sourceType",
        "sourceId",
        "amount",
        "requestId",
    }

    if set(data) != required:
        raise ValueError(
            "sourceType, sourceId, amount and requestId are required."
        )

    source_type = data["sourceType"]

    if source_type not in ("BANK_ACCOUNT", "CASH_WALLET"):
        raise ValueError("Invalid funding source type.")

    try:
        if not isinstance(data["sourceId"], str):
            raise ValueError()

        source_id = str(UUID(data["sourceId"]))

        if not isinstance(data["requestId"], str):
            raise ValueError()

        request_id = str(UUID(data["requestId"]))

    except (TypeError, ValueError, AttributeError):
        raise ValueError(
            "Valid sourceId and requestId UUIDs are required."
        )

    amount = parse_amount(data["amount"])

    return source_type, source_id, amount, request_id

def handle_goal_funding_change(goal_id, *, release=False):
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    data = request.get_json(silent=True)

    try:
        (
            source_type,
            source_id,
            amount,
            request_id,
        ) = parse_funding_request(data)

    except ValueError as error:
        return jsonify({
            "error": str(error)
        }), 400

    try:
        goal, movement, created = change_goal_funding(
            user_id=user_id,
            goal_id=goal_id,
            source_type=source_type,
            source_id=source_id,
            amount=amount,
            request_id=request_id,
            release=release,
        )

    except GoalFundingError as error:
        db.session.rollback()

        return jsonify({
            "error": str(error)
        }), error.status_code

    except IntegrityError:
        db.session.rollback()

        return jsonify({
            "error": "Funding request conflict. Please retry."
        }), 409

    response = jsonify({
        "message": (
            "Funds released successfully."
            if release
            else "Funds allocated successfully."
        ),
        "goal": serialize_goal(goal),
        "movement": {
            "id": movement.id,
            "goalId": movement.goal_id,
            "sourceType": source_type,
            "sourceId": source_id,
            "amount": str(movement.amount),
            "createdAt": movement.created_at.isoformat(),
        },
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 201 if created else 200

@savings_goals_bp.post("/<goal_id>/allocations")
@csrf_required
def allocate_goal_funds(goal_id):
    return handle_goal_funding_change(
        goal_id,
        release=False,
    )


@savings_goals_bp.post("/<goal_id>/releases")
@csrf_required
def release_goal_funds(goal_id):
    return handle_goal_funding_change(
        goal_id,
        release=True,
    )

def serialize_funding_source(source):
    last_synced_at = source["lastSyncedAt"]

    return {
        "sourceType": source["sourceType"],
        "sourceId": source["sourceId"],
        "name": source["name"],
        "currency": source["currency"],
        "currentBalance": str(source["currentBalance"]),
        "allocated": str(source["allocated"]),
        "available": str(source["available"]),
        "shortfall": str(source["shortfall"]),
        "isAvailable": source["isAvailable"],
        "lastSyncedAt": (
            last_synced_at.isoformat()
            if last_synced_at is not None
            else None
        ),
    }

@savings_goals_bp.get("/funding-sources")
def get_goal_funding_sources():
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    bank_accounts = (
        db.session.query(BankAccount.id)
        .join(
            BankConnection,
            BankAccount.connection_id == BankConnection.id,
        )
        .filter(
            BankConnection.user_id == user_id,
            func.upper(
                func.trim(BankAccount.account_type)
            ) == "SAVINGS",
        )
        .all()
    )

    cash_wallets = (
        db.session.query(CashWallet.id)
        .filter(
            CashWallet.user_id == user_id,
        )
        .all()
    )

    sources = []

    try:
        for (account_id,) in bank_accounts:
            source = get_funding_source(
                user_id,
                "BANK_ACCOUNT",
                account_id,
                allow_inactive=True,
            )

            if source["isAvailable"] or source["allocated"] > 0:
                sources.append(serialize_funding_source(source))

        for (wallet_id,) in cash_wallets:
            source = get_funding_source(
                user_id,
                "CASH_WALLET",
                wallet_id,
                allow_inactive=True,
            )

            if source["isAvailable"] or source["allocated"] > 0:
                sources.append(serialize_funding_source(source))

    except GoalFundingError as error:
        db.session.rollback()

        return jsonify({
            "error": str(error)
        }), error.status_code

    response = jsonify({
        "sources": sources,
        "count": len(sources),
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200

@savings_goals_bp.get("/<goal_id>/funding")
def get_goal_funding_history(goal_id):
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    goal = SavingsGoal.query.filter_by(
        id=goal_id,
        user_id=user_id,
    ).first()

    if goal is None:
        return jsonify({
            "error": "Goal not found."
        }), 404

    movements = (
        GoalFundingMovement.query
        .filter_by(
            user_id=user_id,
            goal_id=goal.id,
        )
        .order_by(
            GoalFundingMovement.created_at.desc(),
            GoalFundingMovement.id.desc(),
        )
        .all()
    )

    totals = {}
    history = []

    for movement in movements:
        if movement.bank_account_id is not None:
            source_type = "BANK_ACCOUNT"
            source_id = movement.bank_account_id
        else:
            source_type = "CASH_WALLET"
            source_id = movement.cash_wallet_id

        key = (source_type, source_id)

        totals[key] = (
            totals.get(key, Decimal("0.00"))
            + movement.amount
        )

        history.append({
            "id": movement.id,
            "sourceType": source_type,
            "sourceId": source_id,
            "amount": str(movement.amount),
            "movementType": (
                "SPENT"
                if movement.transaction_id is not None
                else (
                    "RELEASED"
                    if movement.amount < 0
                    else "ALLOCATED"
                )
            ),
            "transactionId": movement.transaction_id,
            "createdAt": movement.created_at.isoformat(),
        })

    sources = []

    try:
        for (source_type, source_id), allocated in totals.items():
            if allocated < 0:
                raise GoalFundingError(
                    "Goal funding history is inconsistent.",
                    409,
                )

            if allocated == 0:
                continue

            source = get_funding_source(
                user_id,
                source_type,
                source_id,
                allow_inactive=True,
            )

            sources.append({
                "sourceType": source_type,
                "sourceId": source_id,
                "name": source["name"],
                "allocated": str(allocated),
                "isAvailable": source["isAvailable"],
                "shortfall": str(source["shortfall"]),
            })

    except GoalFundingError as error:
        db.session.rollback()

        return jsonify({
            "error": str(error)
        }), error.status_code

    response = jsonify({
        "goalId": goal.id,
        "verifiedSavedAmount": str(goal.saved_amount),
        "legacyUnverifiedAmount": str(
            goal.legacy_unverified_amount
        ),
        "sources": sources,
        "history": history,
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200

@savings_goals_bp.patch(
    "/<goal_id>/purchases/<transaction_id>"
)
@csrf_required
def link_purchase_to_goal(goal_id, transaction_id):
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    try:
        goal, transaction, settled_amount, created = (
            link_goal_purchase(
                user_id,
                goal_id,
                transaction_id,
            )
        )

    except GoalFundingError as error:
        db.session.rollback()

        return jsonify({
            "error": str(error)
        }), error.status_code

    except IntegrityError:
        db.session.rollback()

        return jsonify({
            "error": (
                "The purchase could not be linked because "
                "its funding records changed. Please retry."
            )
        }), 409

    response = jsonify({
        "message": (
            "Purchase linked to goal successfully."
            if created
            else "Purchase was already linked to this goal."
        ),
        "goal": serialize_goal(goal),
        "transactionId": transaction.id,
        "settledAmount": str(settled_amount),
        "newlyLinked": created,
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200

@savings_goals_bp.post("/<goal_id>/achieve")
@csrf_required
def achieve_goal(goal_id):
    user_id = get_authenticated_user_id()

    if not user_id:
        return jsonify({
            "error": "Authentication required."
        }), 401

    goal = (
        SavingsGoal.query
        .filter(
            SavingsGoal.id == goal_id,
            SavingsGoal.user_id == user_id,
        )
        .with_for_update()
        .first()
    )

    if goal is None:
        db.session.rollback()
        return jsonify({
            "error": "Goal not found."
        }), 404

    if goal.achieved_at is not None:
        response = jsonify({
            "message": "Goal is already achieved.",
            "goal": serialize_goal(goal),
        })
        response.headers["Cache-Control"] = "no-store"
        db.session.rollback()
        return response, 200

    # The goal must have at least one linked purchase.
    has_purchase = (
        db.session.query(Transaction.id)
        .filter(
            Transaction.user_id == user_id,
            Transaction.goal_id == goal.id,
            Transaction.amount < 0,
        )
        .first()
        is not None
    )

    if not has_purchase:
        db.session.rollback()
        return jsonify({
            "error": (
                "Link a completed purchase before "
                "marking this goal as achieved."
            )
        }), 409

    # Remaining allocations must be released first.
    if goal.saved_amount > 0:
        db.session.rollback()
        return jsonify({
            "error": (
                "Release any remaining allocated funds "
                "before marking this goal as achieved."
            )
        }), 409

    goal.achieved_at = datetime.now(timezone.utc)

    db.session.commit()

    response = jsonify({
        "message": "Goal marked as achieved.",
        "goal": serialize_goal(goal),
    })

    response.headers["Cache-Control"] = "no-store"

    return response, 200