
from app import create_app
from app.models import BankConnection
from app.services.bank_sync import (
    sync_bank_connection,
    BankReauthorizationRequired,
)

app = create_app()

with app.app_context():
    connection = BankConnection.query.filter_by(
        status="CONNECTED",
        access_token_encrypted=None
    ).first()

    if connection is None:
        print("No legacy connection found; test skipped.")

    else:
        try:
            sync_bank_connection(connection.id)

        except BankReauthorizationRequired:
            print("Legacy connection correctly blocked: OK")

        else:
            raise AssertionError(
                "Legacy connection was allowed to sync."
            )

print("Bank sync guard test completed.")
