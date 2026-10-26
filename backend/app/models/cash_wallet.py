
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from app.extensions import db


def utc_now():
    return datetime.now(timezone.utc)


class CashWallet(db.Model):
    __tablename__ = "cash_wallets"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name = db.Column(
        db.String(80),
        nullable=False,
    )

    currency = db.Column(
        db.String(3),
        nullable=False,
        default="NZD",
        server_default="NZD",
    )

    opening_balance = db.Column(
        db.Numeric(18, 2),
        nullable=False,
        default=lambda: Decimal("0.00"),
        server_default="0.00",
    )

    is_archived = db.Column(
        db.Boolean,
        nullable=False,
        default=False,
        server_default=db.false(),
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )

    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    __table_args__ = (
        db.UniqueConstraint(
            "user_id",
            "name",
            "currency",
            name="uq_cash_wallet_user_name_currency",
        ),
        db.CheckConstraint(
            "opening_balance >= 0",
            name="ck_cash_wallet_opening_nonnegative",
        ),
    )
