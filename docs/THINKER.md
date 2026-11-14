# Thinker: OpenAI integration

Work is on feature/thinker-ai, separate from Reports PR #27. No commit, push or PR has been created.

## Configuration

The committed template defaults to THINKER_MODE=demo. For live use, set THINKER_MODE=live, OPENAI_API_KEY to a project key with Responses write access, and OPENAI_MODEL=gpt-5.4-mini in backend/.env. The actual file is ignored by Git. Only this model is currently allowed, so switching to a more expensive model requires a reviewed code change. No SDK dependency was added; the existing requests library calls the Responses API over HTTPS.

GET /api/thinker/status reports authenticated mode/availability without exposing credentials. POST /api/thinker/messages requires the signed-in session and CSRF token. Missing credentials or unsupported configuration fail closed. Live failures do not silently become demo answers.

## Data and educational scope

Only the current typed question (1–600 characters) and a fixed educational instruction are sent to OpenAI. No account records, user identity, conversation history, tools or action permissions are included. The UI discloses this before sending and asks users to avoid personal/account details. Backend does not save questions/replies; visible chat clears when the overlay closes. OpenAI requests set store=false; this is not a promise of zero provider retention. Provider policies still apply.

The instruction confines replies to general budgeting, saving, spending and scam awareness, requires example figures to be labelled NZD, and excludes personalised investment/tax/legal/lending advice. These are model instructions, not a guaranteed content filter. Responses are rendered as text, never executable HTML. No bank or financial actions are available.

## Cost controls

- Output capped at 400 tokens; reasoning effort none; no built-in tools.
- Connection/read timeouts 3/18 seconds; browser request timeout 25 seconds; no automatic paid retries. Manual retry may incur another charge, including after a timeout.
- Each user: 5 attempts per rolling minute and 20 attempts per UTC day. All users sharing this instance: 50 attempts per UTC day.
- Reservations are atomic and persistent in backend/instance/thinker-limits.sqlite, ignored by Git. Only user ID and attempt timestamp are stored; attempts count even on failures. Local counters survive restarts and are shared across workers that use the same file.
- For deployment across hosts/containers, replace local counters with a shared persistent store before enabling live AI. Ephemeral or separate instance files do not enforce a deployment-wide limit. Keep independent OpenAI project/organisation spending controls and auto-reload off; request caps are not a dollar-accurate billing cap.
- Demo mode makes no provider requests. Errors, limits, invalid input and missing configuration do not trigger paid fallback.

## Verification — 15 November 2026

56 frontend tests and 19 backend tests pass. Live-mode labelling, status reconnect, CSRF payload, timeout/cancellation, message safety, retry, secret-safe errors, ownership of sessions, daily/minute/global controls and concurrent reservations are covered. Thinker/shell lint and production build pass; existing unrelated component size warnings remain.

One real bounded backend request succeeded with the privately configured key and gpt-5.4-mini, using only a generic household-budget question. Browser verification used a separate key-free mocked provider: live-mode notice, reply display, clear/reset, 320/390px layouts, 480px desktop panel, Escape and opener focus restoration. Mocked preview content is explicitly labelled as such. Real end-to-end browser testing with the developer's own account remains for the user. Full screen-reader audit, device soft-keyboard resizing and cross-browser/deployed validation remain unverified.

Developer app: frontend http://localhost:8100 and backend http://127.0.0.1:5000. Restart Flask after changing .env. Do not use the isolated 8200 UI preview as evidence of a live provider call.
