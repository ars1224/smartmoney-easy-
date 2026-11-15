from decimal import Decimal

from sqlalchemy import func

from app.extensions import db
from app.models import (
    BankAccount,
    BankConnection,
    CashWallet,
    GoalFundingMovement,
    SavingsGoal,
    Transaction,
)
from app.services.wallet_balance import calculate_wallet_balance


ZERO = Decimal("0.00")


class GoalFundingError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.status_code = status_code


def get_funding_source(
    user_id,
    source_type,
    source_id,
    *,
    allow_inactive=False,
    lock=False,
):
    if source_type == "BANK_ACCOUNT":
        query = (
            db.session.query(BankAccount, BankConnection)
            .join(
                BankConnection,
                BankAccount.connection_id == BankConnection.id,
            )
            .filter(
                BankConnection.user_id == user_id,
                BankAccount.id == source_id,
            )
        )

        if lock:
            query = query.with_for_update(
                of=[BankAccount, BankConnection]
            )

        result = query.first()

        if result is None:
            raise GoalFundingError(
                "Funding source not found.",
                404,
            )

        account, connection = result

        is_available = (
            connection.status == "CONNECTED"
            and account.is_connected is True
            and account.status == "ACTIVE"
            and account.currency == "NZD"
            and (account.account_type or "").strip().upper()
            == "SAVINGS"
        )

        if not is_available and not allow_inactive:
            raise GoalFundingError(
                "Savings account is unavailable for allocations.",
                409,
            )

        balance = account.balance or ZERO
        name = account.account_name or "Savings Account"
        last_synced_at = connection.last_synced_at

    elif source_type == "CASH_WALLET":
        query = CashWallet.query.filter_by(
            id=source_id,
            user_id=user_id,
        )

        if lock:
            query = query.with_for_update()

        wallet = query.first()

        if wallet is None:
            raise GoalFundingError(
                "Funding source not found.",
                404,
            )

        is_available = (
            wallet.is_archived is False
            and wallet.currency == "NZD"
        )

        if not is_available and not allow_inactive:
            raise GoalFundingError(
                "Cash Wallet is unavailable for allocations.",
                409,
            )

        balance = calculate_wallet_balance(wallet)
        name = wallet.name
        last_synced_at = None

    else:
        raise GoalFundingError(
            "Invalid funding source type.",
            400,
        )

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
            source_column == source_id,
        )
        .scalar()
    )

    reserved = Decimal(str(reserved or ZERO))
    balance = Decimal(str(balance))

    if reserved < ZERO:
        raise GoalFundingError(
            "Funding allocation records are inconsistent.",
            409,
        )

    available = max(ZERO, balance - reserved)
    shortfall = max(ZERO, reserved - balance)

    return {
        "sourceType": source_type,
        "sourceId": source_id,
        "name": name,
        "currency": "NZD",
        "currentBalance": balance,
        "allocated": reserved,
        "available": available,
        "shortfall": shortfall,
        "isAvailable": is_available,
        "lastSyncedAt": last_synced_at,
    }

def change_goal_funding(
    user_id,
    goal_id,
    source_type,
    source_id,
    amount,
    request_id,
    *,
    release=False,
):
    if not isinstance(amount, Decimal) or amount <= ZERO:
        raise GoalFundingError(
            "Allocation amount must be greater than zero.",
            400,
        )

    signed_amount = -amount if release else amount

    def find_existing_request():
        existing = GoalFundingMovement.query.filter_by(
            user_id=user_id,
            request_id=request_id,
        ).first()

        if existing is None:
            return None

        existing_source_id = (
            existing.bank_account_id
            if source_type == "BANK_ACCOUNT"
            else existing.cash_wallet_id
        )

        if (
            existing.goal_id != goal_id
            or existing_source_id != source_id
            or existing.amount != signed_amount
        ):
            raise GoalFundingError(
                "Request ID has already been used.",
                409,
            )

        goal = SavingsGoal.query.filter_by(
            id=goal_id,
            user_id=user_id,
        ).first()

        if goal is None:
            raise GoalFundingError(
                "Goal not found.",
                404,
            )

        return goal, existing, False

    # An identical retry must not reserve funds again.
    previous = find_existing_request()

    if previous is not None:
        return previous

    # Lock the funding source before reading its
    # available balance. Concurrent allocations
    # from the same source are serialised.
    source = get_funding_source(
        user_id,
        source_type,
        source_id,
        allow_inactive=release,
        lock=True,
    )

    # Lock the goal before changing saved_amount.
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

    # Recheck idempotency after obtaining locks.
    previous = find_existing_request()

    if previous is not None:
        return previous

    if release:
        source_column = (
            GoalFundingMovement.bank_account_id
            if source_type == "BANK_ACCOUNT"
            else GoalFundingMovement.cash_wallet_id
        )

        goal_reserved = (
            db.session.query(
                func.coalesce(
                    func.sum(GoalFundingMovement.amount),
                    ZERO,
                )
            )
            .filter(
                GoalFundingMovement.user_id == user_id,
                GoalFundingMovement.goal_id == goal_id,
                source_column == source_id,
            )
            .scalar()
        )

        goal_reserved = Decimal(str(goal_reserved or ZERO))

        if (
            amount > goal_reserved
            or amount > goal.saved_amount
        ):
            raise GoalFundingError(
                "Cannot release more than this goal has "
                "allocated from the selected source.",
                409,
            )

    else:
        if amount > source["available"]:
            raise GoalFundingError(
                "Insufficient unallocated funds.",
                409,
            )

        if goal.achieved_at is not None:
            raise GoalFundingError(
                "Cannot allocate funds to an achieved goal.",
                409,
            )

    spent_amount = (
        db.session.query(func.sum(-Transaction.amount))
        .filter(
            Transaction.user_id == user_id,
            Transaction.goal_id == goal_id,
            Transaction.amount < 0,
        )
        .scalar()
    )

    spent_amount = Decimal(str(spent_amount or ZERO))
    if (
        goal.saved_amount + spent_amount + amount
        > goal.target_amount
    ):
        raise GoalFundingError(
            "Allocation exceeds the remaining goal target.",
            409,
        )
        raise GoalFundingError(
            "Allocation exceeds the remaining goal target.",
            409,
        )

    movement = GoalFundingMovement(
        user_id=user_id,
        goal_id=goal_id,
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
        amount=signed_amount,
        request_id=request_id,
    )

    goal.saved_amount += signed_amount

    db.session.add(movement)
    db.session.commit()

    return goal, movement, True