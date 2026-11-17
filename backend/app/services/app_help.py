"""Public product instructions shared with Learn; never reads account records."""

import json
import re
from pathlib import Path

APP_HELP = json.loads(
    (Path(__file__).resolve().parents[1] / "content" / "app-help.json").read_text(
        encoding="utf-8"
    )
)
PAGES = APP_HELP["pages"]

# Fail clearly if a content edit introduces a non-product destination.
for page in PAGES.values():
    if page["route"] != "/onboarding" and not re.fullmatch(
        r"/app/(profile|activity|budgets|goals|dashboard|reports|learn)", page["route"]
    ):
        raise ValueError("App help destinations must be known local pages")

PUBLIC_GUIDE = json.dumps(APP_HELP, ensure_ascii=False)
if len(PUBLIC_GUIDE) > 20000:
    raise ValueError("App help exceeds the bounded instruction context")


ONBOARDING_TERMS = (
    "onboarding",
    "first-time",
    "first time",
    "new account",
    "registration",
    "employment",
    "payroll",
    "take-home",
    "finish setup",
    "skip setup",
)
FUNDING_TERMS = (
    "contribution",
    "manage funds",
    "funding",
    "allocate funds",
    "release funds",
)


def help_links(message):
    """Server-selected IDs only. Neither user nor model can supply a URL/label."""
    words = message.lower()
    if any(
        term in words
        for term in (
            "using smartmoney",
            "use smartmoney",
            "use this app",
            "use the app",
            "get started",
            "getting started",
        )
    ):
        ids = ["setup", "profile", "activity", "budgets", "goals", "home", "reports", "learn"]
    else:
        ids = []
        groups = [
            ("setup", ONBOARDING_TERMS),
            (
                "profile",
                (
                    "wallet",
                    "mock bank",
                    "bank connect",
                    "connect a bank",
                    "bank account",
                    "profile",
                    "sync",
                    "finish connecting",
                    "bank transactions",
                ),
            ),
            (
                "activity",
                ("transaction", "categor", "activity", "manual entr", "purchase", "link to goal"),
            ),
            ("budgets", ("budget", "allocation", "expected income")),
            (
                "goals",
                (
                    "goal",
                    "achiev",
                    "manage funds",
                    "funding",
                    "allocate funds",
                    "release funds",
                    "contribution",
                ),
            ),
            ("home", ("dashboard", "home")),
            ("reports", ("report", "cash flow", "cash-flow", "refund", "month", "balance")),
        ]
        for page, terms in groups:
            if any(term in words for term in terms):
                ids.append(page)
        ids.append("learn")

    return [{"id": page} for page in dict.fromkeys(ids)]


def demo_app_reply(message):
    """Prepared app help stays explicitly labelled demo, using the same source."""
    words = message.lower()
    app_question = any(
        term in words
        for term in (
            "smartmoney",
            "this app",
            "the app",
            "dashboard",
            "profile",
            "mock bank",
            "cash wallet",
            "contribution",
            "reports",
            "activity",
            "thinker",
            "bank transactions",
            "connect a bank",
            "need a bank",
            "cash flow",
            "cash-flow",
        )
    )
    app_question = app_question or any(
        term in words
        for term in ONBOARDING_TERMS + FUNDING_TERMS + (
            "finish connecting",
            "bank sync",
            "bank connection",
            "synchronisation",
            "synchronization",
        )
    )
    app_question = app_question or (
        any(term in words for term in ("how", "where", "create", "add", "open", "edit", "set up"))
        and any(term in words for term in ("budget", "goal"))
    )
    if not app_question:
        return None

    questions = {question["id"]: question for question in APP_HELP["questions"]}
    selected = None
    if any(term in words for term in ONBOARDING_TERMS):
        selected = questions["onboarding"]
    elif (
        "goal" in words and any(term in words for term in ("purchase", "link", "achiev"))
    ) or "mark as achieved" in words:
        selected = questions["goal-purchases"]
    elif any(term in words for term in FUNDING_TERMS) or (
        "goal" in words and "allocat" in words
    ):
        selected = questions["goal-contributions"]
    elif "dashboard" in words and any(
        term in words for term in ("empty", "zero", "0", "missing", "unavailable")
    ):
        selected = questions["empty-dashboard"]
    elif (
        "bank" in words and any(term in words for term in ("appear", "missing", "sync", "not show"))
    ) or any(
        term in words for term in ("finish connecting", "synchronisation", "synchronization")
    ):
        selected = questions["bank-sync"]
    elif "bank" in words and any(term in words for term in ("need", "without")):
        selected = questions["cash-only"]
    elif "cash flow" in words or "cash-flow" in words:
        selected = questions["cash-flow"]
    elif "thinker" in words:
        selected = questions["thinker"]

    if selected:
        body = "\n\n".join(selected["paragraphs"])
        title = selected["title"]
    else:
        ids = {item["id"] for item in help_links(message)}
        steps = [
            step
            for step in APP_HELP["steps"]
            if any(link["page"] in ids - {"learn"} for link in step["links"])
        ]
        if len(steps) == 1:
            title, body = steps[0]["title"], steps[0]["body"]
        elif len(steps) > 1:
            title = APP_HELP["title"]
            body = "\n".join(
                f"{index}. {step['body'].split('. ')[0]}."
                for index, step in enumerate(steps, 1)
            )
        else:
            title = "App help in Learn"
            body = "That feature is not covered by the verified app guide. Open Learn to review the available instructions; do not assume an unsupported control exists."

    return {
        "mode": "demo",
        "title": title,
        "message": body,
        "takeaway": APP_HELP["returnNote"],
        "links": help_links(message),
    }
