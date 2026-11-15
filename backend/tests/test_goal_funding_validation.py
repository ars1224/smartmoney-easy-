import unittest
from decimal import Decimal
from uuid import UUID, uuid4

from app.routes.savings_goals import parse_funding_request


class GoalFundingValidationTests(unittest.TestCase):

    def setUp(self):
        self.source_id = str(uuid4())
        self.request_id = str(uuid4())

    def valid_payload(self):
        return {
            "sourceType": "BANK_ACCOUNT",
            "sourceId": self.source_id,
            "amount": "125.50",
            "requestId": self.request_id,
        }

    def test_valid_bank_account_allocation(self):
        result = parse_funding_request(
            self.valid_payload()
        )

        self.assertEqual(
            result,
            (
                "BANK_ACCOUNT",
                self.source_id,
                Decimal("125.50"),
                self.request_id,
            ),
        )

    def test_valid_cash_wallet_allocation(self):
        payload = self.valid_payload()
        payload["sourceType"] = "CASH_WALLET"

        result = parse_funding_request(payload)

        self.assertEqual(result[0], "CASH_WALLET")
        self.assertEqual(result[2], Decimal("125.50"))

    def test_uuid_values_are_normalized(self):
        payload = self.valid_payload()

        payload["sourceId"] = self.source_id.upper()
        payload["requestId"] = self.request_id.upper()

        result = parse_funding_request(payload)

        self.assertEqual(
            result[1],
            str(UUID(self.source_id)),
        )

        self.assertEqual(
            result[3],
            str(UUID(self.request_id)),
        )

    def test_missing_or_extra_fields_rejected(self):
        required_fields = (
            "sourceType",
            "sourceId",
            "amount",
            "requestId",
        )

        for field in required_fields:
            with self.subTest(missing=field):
                payload = self.valid_payload()
                del payload[field]

                with self.assertRaises(ValueError):
                    parse_funding_request(payload)

        payload = self.valid_payload()
        payload["unexpected"] = "value"

        with self.assertRaises(ValueError):
            parse_funding_request(payload)

    def test_invalid_json_rejected(self):
        invalid_values = (
            None,
            [],
            "text",
            123,
            True,
        )

        for value in invalid_values:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    parse_funding_request(value)

    def test_invalid_source_types_rejected(self):
        invalid_types = (
            "CURRENT_ACCOUNT",
            "CREDIT_CARD",
            "SAVINGS",
            "",
            None,
        )

        for source_type in invalid_types:
            with self.subTest(source_type=source_type):
                payload = self.valid_payload()
                payload["sourceType"] = source_type

                with self.assertRaises(ValueError):
                    parse_funding_request(payload)

    def test_invalid_uuids_rejected(self):
        invalid_values = (
            "not-a-uuid",
            "",
            None,
            123,
            True,
        )

        for field in ("sourceId", "requestId"):
            for value in invalid_values:
                with self.subTest(field=field, value=value):
                    payload = self.valid_payload()
                    payload[field] = value

                    with self.assertRaises(ValueError):
                        parse_funding_request(payload)

    def test_zero_and_negative_amounts_rejected(self):
        invalid_amounts = (
            "0",
            "0.00",
            "-1",
            "-100.50",
            0,
            -25,
        )

        for amount in invalid_amounts:
            with self.subTest(amount=amount):
                payload = self.valid_payload()
                payload["amount"] = amount

                with self.assertRaises(ValueError):
                    parse_funding_request(payload)

    def test_invalid_decimal_precision_rejected(self):
        invalid_amounts = (
            "1.001",
            "10.999",
            "0.001",
        )

        for amount in invalid_amounts:
            with self.subTest(amount=amount):
                payload = self.valid_payload()
                payload["amount"] = amount

                with self.assertRaises(ValueError):
                    parse_funding_request(payload)

    def test_non_finite_amounts_rejected(self):
        invalid_amounts = (
            "NaN",
            "Infinity",
            "-Infinity",
        )

        for amount in invalid_amounts:
            with self.subTest(amount=amount):
                payload = self.valid_payload()
                payload["amount"] = amount

                with self.assertRaises(ValueError):
                    parse_funding_request(payload)

    def test_boolean_amounts_rejected(self):
        for amount in (True, False):
            with self.subTest(amount=amount):
                payload = self.valid_payload()
                payload["amount"] = amount

                with self.assertRaises(ValueError):
                    parse_funding_request(payload)

    def test_amount_above_limit_rejected(self):
        payload = self.valid_payload()
        payload["amount"] = "1000000000000.00"

        with self.assertRaises(ValueError):
            parse_funding_request(payload)


if __name__ == "__main__":
    unittest.main()