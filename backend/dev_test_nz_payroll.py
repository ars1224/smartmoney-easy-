
import unittest
from datetime import date
from decimal import Decimal

from app.services.nz_payroll import (
    annual_income_tax,
    estimate_nz_payroll,
)


PAY_DATE = date(2026, 11, 8)


def calculate(**changes):
    options = {
        "income_type": "SALARY",
        "gross_amount": "1300.00",
        "pay_frequency": "WEEKLY",
        "hours_per_week": None,
        "tax_code": "M",
        "kiwisaver_rate": None,
        "has_student_loan": False,
        "pay_date": PAY_DATE,
    }

    options.update(changes)
    return estimate_nz_payroll(**options)


class NZPayrollTests(unittest.TestCase):

    def test_progressive_income_tax(self):
        cases = [
            ("15600", "1638.00"),
            ("53500", "8270.50"),
            ("78100", "15650.50"),
            ("180000", "49277.50"),
        ]

        for income, expected in cases:
            with self.subTest(income=income):
                self.assertEqual(
                    annual_income_tax(Decimal(income)),
                    Decimal(expected),
                )

    def test_weekly_salary_m(self):
        result = calculate()

        self.assertEqual(
            result["payeIncludingAcc"],
            Decimal("263.14"),
        )
        self.assertEqual(
            result["netPerPay"],
            Decimal("1036.86"),
        )
        self.assertEqual(
            result["estimatedMonthlyNet"],
            Decimal("4493.06"),
        )

    def test_student_loan_and_kiwisaver(self):
        result = calculate(
            tax_code="M SL",
            has_student_loan=True,
            kiwisaver_rate="0.035",
        )

        self.assertEqual(
            result["payeIncludingAcc"],
            Decimal("263.14"),
        )
        self.assertEqual(
            result["studentLoan"],
            Decimal("100.32"),
        )
        self.assertEqual(
            result["kiwiSaver"],
            Decimal("45.50"),
        )
        self.assertEqual(
            result["netPerPay"],
            Decimal("891.04"),
        )
        self.assertEqual(
            result["estimatedMonthlyNet"],
            Decimal("3861.17"),
        )

    def test_hourly_income(self):
        result = calculate(
            income_type="HOURLY",
            gross_amount="28.20",
            hours_per_week="40",
        )

        self.assertEqual(
            result["grossPerPay"],
            Decimal("1128.00"),
        )
        self.assertEqual(
            result["payeIncludingAcc"],
            Decimal("208.53"),
        )
        self.assertEqual(
            result["estimatedMonthlyNet"],
            Decimal("3984.37"),
        )

    def test_fortnightly_salary(self):
        result = calculate(
            gross_amount="2600",
            pay_frequency="FORTNIGHTLY",
        )

        self.assertEqual(
            result["payeIncludingAcc"],
            Decimal("526.28"),
        )
        self.assertEqual(
            result["netPerPay"],
            Decimal("2073.72"),
        )

    def test_acc_annual_cap(self):
        result = calculate(
            gross_amount="3076.93",
        )

        self.assertEqual(
            result["payeIncludingAcc"],
            Decimal("873.43"),
        )

    def test_zero_income(self):
        result = calculate(gross_amount="0")

        self.assertEqual(
            result["payeIncludingAcc"],
            Decimal("0.00"),
        )
        self.assertEqual(
            result["netPerPay"],
            Decimal("0.00"),
        )

    def test_unsupported_or_invalid_inputs(self):
        invalid_cases = [
            {"gross_amount": "-1"},
            {"gross_amount": "NaN"},
            {"kiwisaver_rate": "0.03"},
            {"tax_code": "ME"},
            {"pay_frequency": "YEARLY"},
            {"pay_date": date(2027, 4, 1)},
            {
                "income_type": "HOURLY",
                "hours_per_week": None,
            },
            {
                "tax_code": "M SL",
                "has_student_loan": False,
            },
        ]

        for changes in invalid_cases:
            with self.subTest(changes=changes):
                with self.assertRaises(ValueError):
                    calculate(**changes)


    def test_student_loan_tax_code_consistency(self):
        with self.assertRaises(ValueError):
            calculate(
                tax_code="M",
                has_student_loan=True,
            )

        with self.assertRaises(ValueError):
            calculate(
                tax_code="M SL",
                has_student_loan=False,
            )



if __name__ == "__main__":
    unittest.main(verbosity=2)