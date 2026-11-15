# Dashboard integration

Branch: `feature/dashboard-integration`. No schema migration or seeded production data.

## Scope and acceptance

| Requirement | Implementation | Validation |
| --- | --- | --- |
| Signed-in-user overview | Read-only authenticated `/api/dashboard`; server-side transaction ownership | Isolated ownership, authentication and read-only backend tests |
| Accurate monthly figures | Shared Reports query and calculation service; recorded income, expenses, refunds and net cash flow | Decimal totals and exact Reports parity tests |
| Honest financial meaning | Cash flow replaces the unimplemented sample safe-to-spend amount; no available-balance, expected-pay or month-comparison claim | Rendered wording tests; browser review |
| Real budgets and goals | Existing authenticated APIs; current-month budget limits/spending and saved goal progress | Service/interaction tests; disposable browser fixtures |
| Useful shortcuts | Income/expense form selection, Goals, Learn, Reports and Thinker | Form regression tests and browser navigation |
| Failure recovery | Loading, genuinely empty, partial optional sections, full error and stale-refresh states | Timeout/auth/error/retry tests and simulated browser failures |
| Responsive accessibility | Shared tokens/components; chart figures table; solid/dashed chart lines; mobile Thinker in header | Browser checks at 320, 390, 768 and 1440px; keyboard disclosure, Thinker Escape/focus return |

## Calculation and data rules

- The current month uses Pacific/Auckland. Bank timestamps use New Zealand month boundaries. Cash transactions retain their stored calendar date, matching Reports.
- Figures are NZD only. Foreign-currency and review-needed records are disclosed rather than converted or silently treated as zero spending.
- Net cash flow = recorded income + refunds - expenses. Recognised internal/savings transfers are excluded by the existing Reports classification. Ambiguous records follow its review-needed rules; the model cannot identify every possible transfer/refund.
- The chart groups daily recorded income and expenses into seven-day blocks. Expenses are before refunds; refunds appear separately in the overview. Exact plotted amounts are available in the table.
- Recent activity shows the five newest saved NZD entries for the month, including transfers, with recorded dates and source labels. It is not a second expenses total.
- Budgets retain the existing Budgets API calculation contract. The four highest used/limit ratios are shown with explicit within/at/over-limit wording. No arbitrary financial-health threshold is introduced. Goal progress is saved goal data, not a verified bank balance; the earliest incomplete target is shown, falling back to a completed goal.
- Optional budget/goal service failures display unavailable states. Authentication errors propagate; a failed overview cannot become an empty zero-data dashboard.
- This is a saved-data snapshot, not live bank polling. Refresh after bank synchronisation or a data change. The existing shell's startup bank sync is preserved.

## Validation

- 146 frontend tests passed, including six Dashboard service tests, eight Dashboard interaction tests and three additional transaction-shortcut tests.
- 43 isolated backend tests passed, including eight Dashboard tests and Reports regression coverage. Nine focused category/savings-transfer regression tests also passed.
- Touched TypeScript/template ESLint and production build passed. CSS size warnings remain, including Dashboard at 8.20 kB against the 6 kB warning threshold; the configured error threshold was not changed.
- Browser-preview data is isolated in an in-memory database and clearly labelled in preview only. A separate synthetic demo client was later created in the local developer database for manual testing; its account, credentials and records are not part of this change. External services are mocked; no paid OpenAI calls were made for regression testing.
- Full assistive-technology, cross-browser and deployed-environment verification remains outstanding. No proposal compliance beyond the requirements above is claimed. A safe-to-spend calculation remains deferred pending an agreed formula and supporting data.
