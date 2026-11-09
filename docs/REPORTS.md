# Reports & Insights acceptance checklist

Baseline: original submitted SD205 proposal (Final Docs - Project Proposal), monthly financial reports with charts and insights; user instruction dated 9 November 2026. Aries's 1 November proposal remains a team-review draft; no team approval was supplied.

| Requirement | Implementation | Acceptance evidence |
|---|---|---|
| Monthly reports/charts/insights | Reports page, summary cards, cash-flow chart, category bars/table, factual takeaways | API calculation and UI tests; desktop/mobile previews |
| Authenticated real data | GET /api/reports, signed session ownership filter | Anonymous/ownership tests |
| Month/source filters | NZ month, All/Cash/Bank filter; validated API | Boundaries, source and stale response tests |
| Clear financial meaning | Recorded income, expenses, refunds, net cash flow; no estimated pay or balance | Arithmetic and refund tests; visible explanation |
| Safe exclusions | NZD only, transfer and ambiguous-record counts, visible Uncategorised | Exclusion/category tests |
| Reliable states | Loading, empty, incomplete coverage and retryable error | Component tests |
| Shared accessible layout | Existing shell/cards/buttons/tokens; chart text/table equivalents | Keyboard, responsive and contrast inspection |

## Calculation contract

- Reports describe saved transaction history, not available funds, expected salary, tax advice or savings/goal allocation.
- Month boundaries use Pacific/Auckland. Cash records retain the calendar date entered by the user; bank timestamps use their NZ local date (legacy naive bank timestamps interpreted as UTC).
- Source All combines CASH and linked BANK history owned by the signed-in user, including disconnected bank history. It does not initiate sync. Reload after syncing or modifying transactions.
- Amounts use Decimal; values travel as decimal strings. NZD only, no FX conversion. Foreign-currency record counts are disclosed.
- Identified transfers (transaction type containing TRANSFER) are excluded. A description containing the whole word transfer, or an untyped apparent refund, is held for review instead of being guessed as income/spending. Merchant text alone does not prove a transfer or refund.
- Positive explicitly typed refunds are returned separately. Expenses are gross negative outflows; net cash flow = income + refunds - expenses. Negative typed refunds/reversals and conflicting cash/type signs are held for review.
- Other positive BANK amounts are recorded inflows (not verified earnings); other negative BANK amounts are recorded spending. Cash requires income/expense type with matching stored sign. Zero amounts are ignored.
- Category bars/table show gross expenses, so their sum equals expenses. Missing categories are Uncategorised. Percentages describe recorded included expenses only.
- Incomplete coverage means excluded foreign-currency or review-needed records. Database/API failure shows no fabricated totals. Identified transfer exclusions do not on their own mean a failed report.

## Integration decisions

Checked 9 November: #23, #25 and #26 open, not merged. No dependency on them. #23 session handling will wrap this normal authenticated endpoint when integrated. #25 deletion will change reports after refresh; reimport behaviour remains a separate product decision. #26 estimated income is intentionally not mixed with actual transaction reports. No Needs/Wants/Savings or unified goals until team approval and integrated schema. No schema migration required.

Mobile navigation keeps the established five-tab shell; Reports is linked from a new dashboard-header Reports action and the existing desktop sidebar. An Activity shortcut is supplied in Reports. CSV/export and predictive guidance are not in this agreed implementation scope.

## Verification result — 9 November 2026

- PASS: 53 frontend tests (7 Reports acceptance/API tests plus 46 existing tests).
- PASS: 17 backend unit tests (10 Reports tests plus 7 Learn regression tests), isolated SQLite/mocked external calls.
- PASS: production build; existing unrelated component-style size warnings remain.
- PASS: ESLint for src/app/pages/reports, no findings.
- PASS: actual browser login and API display against a disposable in-memory preview with labelled examples. Month navigation produced an empty October; source Cash produced the expected NZ$300 income. November populated report: income NZ$3,800, expenses NZ$2,216.60, refunds NZ$32.90, net NZ$1,616.30.
- PASS: desktop 1440x1000 and mobile 390x844 screenshots inspected; no document/control overflow at 390 or 320px. Native chart disclosure opened using Enter and exposed its data table in the accessibility tree. Preview viewport override reset afterwards.
- PASS by implementation/tests: authentication/ownership, month/source filters, decimal arithmetic, NZ timestamp/cash date boundaries, leap year/DST, refunds, identified-transfer/foreign/uncertain exclusions, uncategorised display, empty/error/partial/loading states, stale-response prevention and retry.
- UNVERIFIED: full screen-reader audit, deployed AWS integration, PostgreSQL-specific concurrency/performance and exhaustive bank transaction semantics. Current provider fields cannot prove every refund/transfer; no such completeness claim is made. The review flags do not yet have a dedicated transaction-type correction workflow in the merged app.
- DEFERRED: pending PR #26 expected-income comparison, pending #23 session-security changes and pending #25 deletion UI; Needs/Wants/Savings and unified goals await team approval and schema integration.

No commits, pushes or PR creation. No schema migration. Existing .vscode/settings.json change preserved.

Preview artifacts: outputs/reports-desktop.jpg, reports-mobile.jpg, reports-mobile-chart.jpg and reports-empty-mobile.jpg in the shared assessment workspace. They use disposable sample data, not the normal app database.

Text contrast checks: muted text on white 5.99:1; teal-dark links on white 5.83:1; navy on white 15.74:1; muted on-dark text on navy 11.35:1; yellow negative amount on navy 9.88:1. These checks cover the Reports text palette, not a full screen-reader audit.

## Responsive positioning refinement

Mobile uses a single-row heading/action, a two-row filter panel, expandable exclusion details, two compact income/expense cards and a full-width horizontal net cash-flow card. All filter touch targets are at least 44px. Chart labels and supporting text remain readable; the five-tab shell is preserved. Verified 390px and 320px widths without horizontal overflow. No financial calculations changed.

## Drill-down and mobile Thinker refinement — 9 November

GET /api/reports/category accepts the same month/source filters plus a category name. It enforces signed-session ownership, uses the exact summary inclusion pipeline, normalises categories consistently and returns only included expense records. Totals are positive gross expenses; individual outflows retain negative amounts, original stored date/timestamp, NZ reporting date and original currency. Only NZD included rows can appear under this report's existing currency contract.

Category selection opens a native modal dialog with source/month context, total, entries, loading/error/retry/empty states, Escape/close/back controls and focus restoration. Late responses are ignored after close. The accessible chart table is retained. If transactions change elsewhere between summary and drill-down requests, close and refresh to obtain a new summary; responses are fresh snapshots, not an immutable accounting statement. Large-volume pagination remains unimplemented.

Net cash flow now has distinct positive/negative/zero factual explanations and an explicit balance/expected-pay disclaimer. No calculation rules changed.

On Reports below the desktop breakpoint, Thinker is in reserved header space. Its floating version is hidden only there; other routes retain the existing floating action and desktop is unchanged. The CSS uses :has(), supported by current browsers. Existing app-start bank sync is preserved.

Latest validation: all 56 frontend tests and all 19 backend tests pass. Reports ESLint and production build pass; component-size warnings remain, within the existing error limit. Isolated regression tests cover owner-only category details, reconciliation, source/month retention, uncategorised/empty/validation cases, failure/retry, focus restoration, stale detail responses and positive/negative/zero wording.

Browser verification: desktop 1440x1000 and mobile 390x844 category dialogs; source dates/currency visible; Escape and focus restoration confirmed. Reports header/floating visibility checked at 320px and 768px, with document width equal to viewport. Thinker opens from Reports header; Activity retains its floating control. No animation added to Reports details; native dialog has no custom motion. Full screen-reader audit, cross-browser matrix and deployed verification remain unverified.

Previews: outputs/reports-drilldown-desktop.jpg, reports-drilldown-mobile.jpg, reports-header-thinker-mobile.jpg in the assessment workspace. Fixtures are isolated sample transactions. Previous-month comparison and pending Budget/Goals integrations are deferred. No commits, pushes or PR creation.

Presentation refinement (9 November): compact report toolbar, unified four-column summary, cash-flow chart with labelled value axis, and expense table with reconciled total. Existing category drill-down and calculation rules retained. Verified 56 frontend tests, Reports ESLint and production build; stylesheet remains below the 10 kB error budget (warning remains). Browser checked at 320, 390, 768 and 1440 px with isolated labelled sample data; no horizontal overflow. Category details reconcile and Escape restores focus. No commit or push.
