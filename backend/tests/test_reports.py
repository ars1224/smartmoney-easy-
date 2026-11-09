"""Isolated report calculations; never opens the developer PostgreSQL database."""
import unittest
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch
from sqlalchemy.exc import OperationalError
from config import Config
from app import create_app
from app.extensions import db
from app.models import User, BankConnection, BankAccount, Transaction
from app.services.reports import report_month

class ReportsTests(unittest.TestCase):
    def setUp(self):
        with patch.object(Config, "SQLALCHEMY_DATABASE_URI", "sqlite:///:memory:"), patch.object(Config, "SECRET_KEY", "report-tests-only"):
            self.app = create_app()
        self.context = self.app.app_context(); self.context.push()
        db.create_all()
        self.user = User(email="report-owner@example.test")
        self.other = User(email="report-other@example.test")
        db.session.add_all([self.user, self.other]); db.session.flush()
        connection = BankConnection(user_id=self.user.id, external_customer_id="fixture", status="DISCONNECTED")
        db.session.add(connection); db.session.flush()
        self.account = BankAccount(connection_id=connection.id, external_account_id="fixture-account", is_connected=False)
        db.session.add(self.account); db.session.commit()
        self.client = self.app.test_client()
        with self.client.session_transaction() as session: session["user_id"] = self.user.id
    def tearDown(self):
        db.session.remove(); db.drop_all(); self.context.pop()
    def row(self, amount, source="BANK", category="Groceries", kind="DEBIT", date="2026-10-10T00:00:00+00:00", currency="NZD", description="Example purchase", user=None):
        row = Transaction(user_id=user or self.user.id, bank_account_id=self.account.id if source == "BANK" else None,
                          source=source, description=description, amount=Decimal(amount), category=category,
                          currency=currency, transaction_type=kind, transaction_date=datetime.fromisoformat(date))
        db.session.add(row); db.session.commit(); return row
    def report(self, query="month=2026-10&source=all"):
        response = self.client.get("/api/reports?" + query)
        self.assertEqual(response.status_code, 200); return response.json
    def test_authentication_and_validation(self):
        self.assertEqual(self.app.test_client().get("/api/reports").status_code, 401)
        for query in ["month=", "month=0001-01", "month=9999-01", "month=2026-13", "month=2026-1", "source=invalid"]:
            self.assertEqual(self.client.get("/api/reports?" + query).status_code, 400, query)
    def test_decimal_totals_refunds_and_visible_uncategorised(self):
        self.row("1000.10", kind="CREDIT"); self.row("-100.20")
        self.row("-0.10", category=None); self.row("20.05", kind="REFUND")
        result = self.report()
        self.assertEqual((result["income"], result["expenses"], result["refunds"], result["netCashFlow"]), ("1000.10", "100.30", "20.05", "919.85"))
        self.assertEqual(result["uncategorisedCount"], 1)
        self.assertEqual(sum(Decimal(c["amount"]) for c in result["categories"]), Decimal(result["expenses"]))
        self.assertEqual(sum(Decimal(d["refunds"]) for d in result["daily"]), Decimal("20.05"))
    def test_owner_source_filters_and_disconnected_history(self):
        self.row("-10"); self.row("-5", source="CASH", kind="expense")
        self.row("-900", user=self.other.id)
        self.assertEqual(self.report()["expenses"], "15.00")
        self.assertEqual(self.report("month=2026-10&source=cash")["expenses"], "5.00")
        self.assertEqual(self.report("month=2026-10&source=bank")["expenses"], "10.00")
    def test_transfers_foreign_and_ambiguous_records_are_disclosed(self):
        self.row("-100", kind="TRANSFER")
        self.row("100", kind="TRANSFER_IN")
        self.row("-10", currency="USD")
        self.row("-30", description="Online transfer")
        self.row("15", kind="CREDIT", description="Merchant refund")
        result = self.report()
        self.assertEqual(result["transactionCount"], 0)
        self.assertEqual(result["excluded"], {"transfers": 2, "foreignCurrency": 1, "reviewNeeded": 2})
        self.assertEqual(result["coverage"], "partial")
    def test_nz_timestamp_and_cash_calendar_month_boundaries(self):
        self.row("-10", date="2026-09-30T11:00:00+00:00") # Oct 1 midnight NZDT
        self.row("-900", date="2026-09-30T10:59:59+00:00")
        self.row("-20", source="CASH", kind="expense", date="2026-10-31T00:00:00+00:00")
        self.row("-900", date="2026-10-31T11:00:00+00:00") # Nov 1 midnight
        self.row("-900", source="CASH", kind="expense", date="2026-11-01T00:00:00+00:00")
        self.assertEqual(self.report()["expenses"], "30.00")
    def test_dst_leap_year_and_year_rollover(self):
        self.assertEqual(report_month("2026-09")[1].isoformat(), "2026-08-31T12:00:00+00:00")
        self.assertEqual(report_month("2026-09")[2].isoformat(), "2026-09-30T11:00:00+00:00")
        self.assertEqual(len(self.report("month=2024-02")["daily"]), 29)
        self.assertEqual(report_month("2026-12")[2].year, 2026) # Jan NZ midnight is still Dec UTC
    def test_category_normalisation(self):
        self.row("-10", category=" Groceries "); self.row("-20", category="groceries")
        self.assertEqual(len(self.report()["categories"]), 1)
        self.assertEqual(self.report()["categories"][0]["amount"], "30.00")
    def test_empty_zero_and_inconsistent_cash(self):
        self.assertEqual(self.report()["netCashFlow"], "0.00")
        self.row("0"); self.row("10", source="CASH", kind="expense")
        result = self.report(); self.assertEqual(result["transactionCount"], 0)
        self.assertEqual(result["excluded"]["reviewNeeded"], 1)
    def test_database_failure_does_not_return_partial_totals(self):
        with patch("sqlalchemy.orm.Query.all", side_effect=OperationalError("test", {}, Exception("offline"))), patch.object(self.app.logger, "exception"):
            response = self.client.get("/api/reports?month=2026-10")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("income", response.json)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
    def test_category_details_reconcile_and_exclude_other_users(self):
        own = self.row("-12.34", category="Groceries")
        self.row("-7.66", source="CASH", kind="expense", category=" groceries ")
        self.row("-500", user=self.other.id)
        self.row("-100", kind="TRANSFER")
        self.row("20", kind="REFUND")
        self.row("-99", currency="USD")
        response = self.client.get("/api/reports/category?month=2026-10&source=all&category=GROCERIES")
        self.assertEqual(response.status_code, 200)
        detail = response.json
        self.assertEqual(detail["total"], "20.00")
        self.assertEqual(sum(-Decimal(row["amount"]) for row in detail["transactions"]), Decimal(detail["total"]))
        self.assertEqual(detail["total"], self.report()["categories"][0]["amount"])
        self.assertEqual(len(detail["transactions"]), 2)
        self.assertTrue(all(row["currency"] == "NZD" and row["date"] and row["reportDate"] for row in detail["transactions"]))
        cash = self.client.get("/api/reports/category?month=2026-10&source=cash&category=groceries").json
        self.assertEqual(cash["total"], "7.66")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
    def test_category_validation_empty_auth_and_date_filter(self):
        self.assertEqual(self.app.test_client().get("/api/reports/category?category=Groceries").status_code, 401)
        self.assertEqual(self.client.get("/api/reports/category?month=2026-10").status_code, 400)
        self.row("-10", category=None)
        self.row("-99", category=None, date="2026-11-10T00:00:00+00:00")
        detail = self.client.get("/api/reports/category?month=2026-10&category=Uncategorised").json
        self.assertEqual(detail["total"], "10.00")
        empty = self.client.get("/api/reports/category?month=2026-10&category=Missing").json
        self.assertEqual(empty["total"], "0.00")
        self.assertEqual(empty["transactions"], [])

    def test_success_has_no_store(self):
        self.assertEqual(self.client.get("/api/reports?month=2026-10").headers["Cache-Control"], "no-store")

if __name__ == "__main__": unittest.main()
