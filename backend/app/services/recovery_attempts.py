"""Security controls for account recovery attempts.

This module validates recovery credentials and tracks failed attempts.

Database transactions are managed by the calling route.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.extensions import db
from app.models import User
from app.services.recovery_codes import verify_recovery_code


MAX_RECOVERY_ATTEMPTS = 5

RECOVERY_LOCKOUT_DURATION = timedelta(
    minutes=15
)


def check_recovery_attempt(
    email: str,
    name: str,
    recovery_code: str,
    *,
    now: datetime | None = None,
) -> User | None:
    """Validate recovery credentials and update attempt counters.

    Returns the matching user when verification succeeds.

    Returns None when:
        - The account does not exist.
        - The supplied details are incorrect.
        - The recovery code is invalid.
        - Recovery attempts are temporarily locked.

    The caller must commit or roll back the database transaction.
    """

    if (
        not isinstance(email, str)
        or not isinstance(name, str)
        or not isinstance(recovery_code, str)
    ):
        return None

    normalized_email = email.strip().lower()
    normalized_name = name.strip().casefold()

    if (
        not normalized_email
        or len(normalized_email) > 255
        or not normalized_name
        or len(normalized_name) > 100
    ):
        return None

    if now is None:
        now = datetime.now(timezone.utc)

    # Lock the user row while checking and updating attempt counters.
    # PostgreSQL holds this lock until the transaction finishes.
    user = db.session.execute(
        select(User)
        .where(User.email == normalized_email)
        .with_for_update()
    ).scalar_one_or_none()

    if user is None:
        return None

    locked_until = user.recovery_locked_until

    if locked_until is not None:
        # SQLite may return timezone-naive values during isolated tests.
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(
                tzinfo=timezone.utc
            )

        # Reject attempts while the recovery lockout is active.
        if now < locked_until:
            return None

        # The lockout period has expired.
        user.recovery_failed_attempts = 0
        user.recovery_locked_until = None

    # Compare the submitted full name with the registered name.
    name_matches = (
        user.name.strip().casefold()
        == normalized_name
    )

    # Verify the code against its stored hash.
    code_matches = verify_recovery_code(
        recovery_code,
        user.recovery_code_hash,
    )

    if name_matches and code_matches:
        # Successful recovery verification clears failed attempts.
        user.recovery_failed_attempts = 0
        user.recovery_locked_until = None

        return user

    # Record an unsuccessful recovery attempt.
    failed_attempts = (
        user.recovery_failed_attempts or 0
    ) + 1

    user.recovery_failed_attempts = failed_attempts

    # Temporarily block recovery after five failed attempts.
    if failed_attempts >= MAX_RECOVERY_ATTEMPTS:
        user.recovery_locked_until = (
            now + RECOVERY_LOCKOUT_DURATION
        )

    return None