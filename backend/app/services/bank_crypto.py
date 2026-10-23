
import binascii

from cryptography.fernet import Fernet, InvalidToken
from flask import current_app


class BankEncryptionError(Exception):
    """Raised when encryption or decryption fails."""


def get_cipher():
    key = current_app.config.get(
        "BANK_TOKEN_ENCRYPTION_KEY"
    )

    if not isinstance(key, str) or not key:
        raise BankEncryptionError(
            "Bank encryption key is not configured."
        )

    try:
        return Fernet(key.encode("ascii"))

    except (
        ValueError,
        TypeError,
        UnicodeEncodeError,
        binascii.Error
    ) as exc:
        raise BankEncryptionError(
            "Bank encryption key is invalid."
        ) from exc


def encrypt_secret(value):
    """
    Encrypt an access token or PKCE verifier
    before storing it in PostgreSQL.
    """

    if not isinstance(value, str) or not value:
        raise ValueError(
            "A non-empty secret is required."
        )

    cipher = get_cipher()

    encrypted = cipher.encrypt(
        value.encode("utf-8")
    )

    return encrypted.decode("ascii")


def decrypt_secret(encrypted_value):
    """
    Decrypt a previously encrypted credential.
    Reject modified or invalid ciphertext.
    """

    if (
        not isinstance(encrypted_value, str)
        or not encrypted_value
    ):
        raise BankEncryptionError(
            "Encrypted credential is missing."
        )

    cipher = get_cipher()

    try:
        decrypted = cipher.decrypt(
            encrypted_value.encode("ascii")
        )

        return decrypted.decode("utf-8")

    except (
        InvalidToken,
        UnicodeEncodeError,
        UnicodeDecodeError
    ) as exc:
        raise BankEncryptionError(
            "Stored bank credential cannot be decrypted."
        ) from exc
