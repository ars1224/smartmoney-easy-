from datetime import datetime, timezone

from app.extensions import db


def utc_now():
    return datetime.now(timezone.utc)


class OnboardingProgress(db.Model):
    __tablename__ = "user_onboarding_progress"

    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    status = db.Column(
        db.String(20),
        nullable=False,
        default="IN_PROGRESS",
    )

    current_step = db.Column(
        db.String(30),
        nullable=False,
        default="EMPLOYMENT",
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    updated_at = db.Column(
        db.DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    completed_at = db.Column(
        db.DateTime(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        db.CheckConstraint(
            "status IN ('IN_PROGRESS', 'COMPLETED')",
            name="ck_onboarding_status",
        ),
        db.CheckConstraint(
            """
            current_step IN (
                'EMPLOYMENT',
                'PAYROLL',
                'BUDGET',
                'REVIEW'
            )
            """,
            name="ck_onboarding_step",
        ),
    )
