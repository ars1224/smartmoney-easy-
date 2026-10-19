import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    DATABASE_URL = os.getenv("DATABASE_URL")

    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL must be configured in backend/.env."
        )

    SQLALCHEMY_DATABASE_URI = DATABASE_URL

    SQLALCHEMY_TRACK_MODIFICATIONS = False


    MOCK_BANK_API_BASE_URL = os.getenv(
        "MOCK_BANK_API_BASE_URL", ""
    ).rstrip("/")

    MOCK_BANK_API_KEY = os.getenv(
        "MOCK_BANK_API_KEY", ""
    )

    SECRET_KEY = os.getenv("SECRET_KEY")

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = (
        os.getenv("SESSION_COOKIE_SECURE", "true").lower() == "true"
    )
    PERMANENT_SESSION_LIFETIME = 60 * 60 * 24 * 7
    BANK_TOKEN_ENCRYPTION_KEY = os.getenv(
    "BANK_TOKEN_ENCRYPTION_KEY"
)

    MOCK_BANK_OAUTH_CLIENT_ID = os.getenv(
    "MOCK_BANK_OAUTH_CLIENT_ID"
)

    MOCK_BANK_OAUTH_REDIRECT_URI = os.getenv(
        "MOCK_BANK_OAUTH_REDIRECT_URI"
    )

    SESSION_COOKIE_NAME = "smartmoney_session"

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = (
        os.getenv("SESSION_COOKIE_SECURE", "true").lower() == "true"
    )

    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_SAMESITE = "Lax"
    REMEMBER_COOKIE_SECURE = (
        os.getenv("SESSION_COOKIE_SECURE", "true").lower() == "true"
)