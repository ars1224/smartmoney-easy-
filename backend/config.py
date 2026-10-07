import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:password@localhost:5432/smartmoney_easy"
    )

    SQLALCHEMY_TRACK_MODIFICATIONS = False