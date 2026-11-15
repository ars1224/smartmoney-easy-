import uuid
from decimal import Decimal

from sqlalchemy import func

from app.extensions import db
from app.models import (
    GoalFundingMovement,
    SavingsGoal,
    Transaction,
)
from app.services.goal_funding import (
    GoalFundingError,
    get_funding_source,
)


ZERO = Decimal("0.00")


def get_purchase_source(transaction):
    """
    Validate an existing expense and identify its source.

    This function does not create or modify transactions.
    """

    if transaction.source == "BANK":
        source_type = "BANK_ACCOUNT"
        source_id = transaction.bank_account_id

    elif transaction.source == "CASH":
        source_type = "CASH_WALLET"
        source_id = transaction.cash_wallet_id

    else:
        raise GoalFundingError(
            "Unsupported transaction source.",
            400,
        )

    if not source_id:
        raise GoalFundingError(
            "Transaction has no valid funding source.",
            400,
        )

    if transaction.currency != "NZD":
        raise GoalFundingError(
            "Only NZD purchases can be linked to goals.",
            400,
        )

    amount = Decimal(str(transaction.amount))

    if not amount.is_finite() or amount >= ZERO:
        raise GoalFundingError(
            "Only expense transactions can be linked to goals.",
            400,
        )

    transaction_type = (
        transaction.transaction_type or ""
    ).strip().upper()

    category = (
        transaction.category or ""
    ).strip().upper()

    description = (
        transaction.description or ""
    ).strip().upper()

    if (
        "TRANSFER" in transaction_type
        or transaction_type == "REFUND"
        or category in {
            "INTERNAL TRANSFER",
            "SAVINGS TRANSFER",
            "TRANSFER",
            "REFUND",
        }
        or description.startswith(("TRANSFER ", "SAVINGS TRANSFER"))
    ):
        raise GoalFundingError(
            "Transfers and refunds cannot be linked as goal purchases.",
            400,
        )

    return source_type, source_id, -amount


def link_goal_purchase(
    user_id,
    goal_id,
    transaction_id,
):
    """
    Link an existing Activity expense to a savings goal.

    If funds are reserved from the same source, settle
    up to the purchase amount.

    No new bank or cash expense is created.
    """

    # Read the transaction to identify its funding source.
    preview = Transaction.query.filter_by(
        id=transaction_id,
        user_id=user_id,
    ).first()

    if preview is None:
        raise GoalFundingError(
            "Transaction not found.",
            404,
        )

    source_type, source_id, _ = get_purchase_source(
        preview
    )

    # Lock the source first, matching the existing
    # goal funding service's locking order.
    get_funding_source(
        user_id,
        source_type,
        source_id,
        allow_inactive=True,
        lock=True,
    )

    # Lock the goal.
    goal = (
        SavingsGoal.query
        .filter_by(
            id=goal_id,
            user_id=user_id,
        )
        .with_for_update()
        .first()
    )

    if goal is None:
        raise GoalFundingError(
            "Goal not found.",
            404,
        )

    # Lock and revalidate the actual transaction.
    transaction = (
        Transaction.query
        .filter_by(
            id=transaction_id,
            user_id=user_id,
        )
        .with_for_update()
        .first()
    )

    if transaction is None:
        raise GoalFundingError(
            "Transaction not found.",
            404,
        )

    locked_source_type, locked_source_id, purchase_amount = (
        get_purchase_source(transaction)
    )

    if (
        locked_source_type != source_type
        or locked_source_id != source_id
    ):
        raise GoalFundingError(
            "Transaction source changed. Please retry.",
            409,
        )

    # Repeated requests must not settle funds twice.
    if transaction.goal_id == goal.id:
        db.session.commit()
        return goal, transaction, ZERO, False

    if transaction.goal_id is not None:
        raise GoalFundingError(
            "Transaction is already linked to another goal.",
            409,
        )

    if goal.achieved_at is not None:
        raise GoalFundingError(
            "Cannot add a purchase to an achieved goal.",
            409,
        )

    # Find the amount currently reserved for this
    # specific goal from this transaction's source.
    source_column = (
        GoalFundingMovement.bank_account_id
        if source_type == "BANK_ACCOUNT"
        else GoalFundingMovement.cash_wallet_id
    )

    reserved = (
        db.session.query(
            func.coalesce(
                func.sum(GoalFundingMovement.amount),
                ZERO,
            )
        )
        .filter(
            GoalFundingMovement.user_id == user_id,
            GoalFundingMovement.goal_id == goal.id,
            source_column == source_id,
        )
        .scalar()
    )

    reserved = Decimal(str(reserved or ZERO))

    if reserved < ZERO:
        raise GoalFundingError(
            "Goal funding history is inconsistent.",
            409,
        )

    # A purchase can settle only funds that were
    # actually reserved from the matching source.
    settled_amount = min(
        purchase_amount,
        reserved,
    )

    if settled_amount > ZERO:
        current_saved = Decimal(
            str(goal.saved_amount)
        )

        if settled_amount > current_saved:
            raise GoalFundingError(
                "Goal allocation balance is inconsistent.",
                409,
            )

        movement = GoalFundingMovement(
            user_id=user_id,
            goal_id=goal.id,
            bank_account_id=(
                source_id
                if source_type == "BANK_ACCOUNT"
                else None
            ),
            cash_wallet_id=(
                source_id
                if source_type == "CASH_WALLET"
                else None
            ),
            amount=-settled_amount,
            request_id=str(uuid.uuid4()),
            transaction_id=transaction.id,
        )

        goal.saved_amount = (
            current_saved - settled_amount
        )

        db.session.add(movement)

    # Link the existing expense.
    # Do not change its amount or account balance.
    transaction.goal_id = goal.id

    # Both the link and settlement succeed together.
    db.session.commit()

    return goal, transaction, settled_amount, True