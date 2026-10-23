
from app import create_app
from app.services.bank_crypto import (
    encrypt_secret,
    decrypt_secret,
    BankEncryptionError
)


app = create_app()

with app.app_context():

    original = "smartmoney-development-test-token"

    # Test encryption
    encrypted = encrypt_secret(original)

    assert encrypted != original
    print("Encryption: OK")

    # Test decryption
    decrypted = decrypt_secret(encrypted)

    assert decrypted == original
    print("Decryption: OK")

    # Test tampering protection
    tampered = (
        ("A" if encrypted[0] != "A" else "B")
        + encrypted[1:]
    )

    try:
        decrypt_secret(tampered)

    except BankEncryptionError:
        print("Tampered credential rejected: OK")

    else:
        raise AssertionError(
            "Tampered credential was accepted."
        )

    print("\nALL BANK ENCRYPTION TESTS PASSED!")
