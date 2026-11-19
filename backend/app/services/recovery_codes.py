import secrets

from werkzeug.security import (
    check_password_hash,
    generate_password_hash,
)


RECOVERY_CODE_LENGTH = 6

# Exclude characters that are easy to confuse.
RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_recovery_code() -> str:
    """
    Generate a cryptographically random,
    six-character account recovery code.
    """

    return "".join(
        secrets.choice(RECOVERY_ALPHABET)
        for _ in range(RECOVERY_CODE_LENGTH)
    )


def hash_recovery_code(code: str) -> str:
    """
    Hash a valid recovery code before
    storing it in the database.
    """

    normalized_code = code.strip().upper()

    if (
        len(normalized_code) != RECOVERY_CODE_LENGTH
        or any(
            character not in RECOVERY_ALPHABET
            for character in normalized_code
        )
    ):
        raise ValueError("Invalid recovery code.")

    return generate_password_hash(normalized_code)


def verify_recovery_code(
    code: str,
    stored_hash: str | None,
) -> bool:
    """
    Verify a submitted recovery code
    against its stored password hash.
    """

    if (
        not isinstance(code, str)
        or not isinstance(stored_hash, str)
        or not stored_hash
    ):
        return False

    normalized_code = code.strip().upper()

    if (
        len(normalized_code) != RECOVERY_CODE_LENGTH
        or any(
            character not in RECOVERY_ALPHABET
            for character in normalized_code
        )
    ):
        return False

    return check_password_hash(
        stored_hash,
        normalized_code,
    )