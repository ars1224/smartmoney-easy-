
import os
import subprocess
import sys

from sqlalchemy.engine import make_url
from app import create_app


app = create_app()

url = make_url(
    app.config["SQLALCHEMY_DATABASE_URI"]
)

# Never run these tests against production or
# an unexpected development database.
if (
    url.host not in ("localhost", "127.0.0.1")
    or url.database != "smartmoney_easy"
):
    raise SystemExit(
        "STOP: Unexpected source database."
    )

test_url = url.set(
    database="smartmoney_easy_test"
)

env = os.environ.copy()
env["DATABASE_URL"] = test_url.render_as_string(
    hide_password=False
)

print(
    "Testing database:",
    test_url.database,
    flush=True,
)

result = subprocess.run(
    [
        sys.executable,
        "dev_test_monthly_income.py",
    ],
    env=env,
)

if result.returncode != 0:
    raise SystemExit(
        "FAIL: Monthly income regression tests."
    )

print(
    "\nPASS: Monthly income regression suite completed!"
)
