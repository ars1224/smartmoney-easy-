
import uuid
from datetime import datetime, timezone

from sqlalchemy import UniqueConstraint
from app.extensions import db

from werkzeug.security import generate_password_hash, check_password_hash


def utc_now():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )

    email = db.Column(
        db.String(255),
        unique=True,
        nullable=False
    )

    password_hash = db.Column(
        db.String(255),
        nullable=True
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        nullable=False
    )

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        if not self.password_hash:
            return False

        return check_password_hash(self.password_hash, password)


class BankConnection(db.Model):
    __tablename__ = "bank_connections"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )

    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id"),
        nullable=False,
        index=True
    )

    provider = db.Column(
        db.String(50),
        nullable=False,
        default="MOCK_BANK"
    )

    external_customer_id = db.Column(
        db.String(100),
        nullable=False
    )

    access_token_encrypted = db.Column(
        db.Text,
        nullable=True
    )

    access_token_expires_at = db.Column(
        db.DateTime(timezone=True),
        nullable=True
    )

    status = db.Column(
        db.String(20),
        nullable=False,
        default="CONNECTED"
    )

    last_synced_at = db.Column(
        db.DateTime(timezone=True),
        nullable=True
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "provider",
            "external_customer_id",
            name="uq_user_bank_connection"
        ),
    )


class BankAccount(db.Model):
    __tablename__ = "bank_accounts"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )

    connection_id = db.Column(
        db.String(36),
        db.ForeignKey("bank_connections.id"),
        nullable=False,
        index=True
    )

    external_account_id = db.Column(
        db.String(100),
        nullable=False
    )

    account_name = db.Column(db.String(150))
    account_number = db.Column(db.String(100))
    account_type = db.Column(db.String(50))

    currency = db.Column(
        db.String(3),
        nullable=False,
        default="NZD"
    )

    balance = db.Column(
        db.Numeric(18, 2),
        nullable=False,
        default=0
    )

    status = db.Column(
        db.String(20),
        nullable=False,
        default="ACTIVE"
    )

    is_connected = db.Column(
        db.Boolean,
        nullable=False,
        default=True
    )

    __table_args__ = (
        UniqueConstraint(
            "connection_id",
            "external_account_id",
            name="uq_connected_bank_account"
        ),
    )


class Transaction(db.Model):
    __tablename__ = "transactions"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )

    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id"),
        nullable=False,
        index=True
    )

    bank_account_id = db.Column(
        db.String(36),
        db.ForeignKey("bank_accounts.id"),
        nullable=True,
        index=True
    )

    external_transaction_id = db.Column(
        db.String(100),
        nullable=True
    )

    source = db.Column(
        db.String(20),
        nullable=False
    )

    description = db.Column(
        db.String(255),
        nullable=False
    )

    amount = db.Column(
        db.Numeric(18, 2),
        nullable=False
    )

    balance_after = db.Column(
        db.Numeric(18, 2),
        nullable=True
    )

    currency = db.Column(
        db.String(3),
        nullable=False,
        default="NZD"
    )

    transaction_type = db.Column(
        db.String(30),
        nullable=False
    )

    transaction_date = db.Column(
        db.DateTime(timezone=True),
        nullable=False
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "bank_account_id",
            "external_transaction_id",
            name="uq_bank_transaction"
        ),
    )


class BankOAuthAttempt(db.Model):
    __tablename__ = "bank_oauth_attempts"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )

    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id"),
        nullable=False,
        index=True
    )

    state_hash = db.Column(
        db.String(64),
        unique=True,
        nullable=False
    )

    code_verifier_encrypted = db.Column(
        db.Text,
        nullable=False
    )

    expires_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False
    )

    consumed_at = db.Column(
        db.DateTime(timezone=True),
        nullable=True
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=utc_now,
        nullable=False
    )
