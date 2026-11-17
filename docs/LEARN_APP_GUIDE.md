# Learn app guide

Local branch: `fix/learn-current-flows` (based on main `6381d5f`).

## User experience

- Optional, collapsed-by-default Getting started guide at the top of Learn. Six ordered steps link to Profile & Assets, Activity, Budgets, Goals, Home and Reports.
- Eight independently expandable common questions after the financial guides cover empty data, bank import, cash-only use, cash flow, goal contributions and Thinker.
- Both sections remain available when learning filters change or the external article feed fails. Existing guides, challenges and feed behavior are retained.
- Native details/summary disclosures provide keyboard and screen-reader state. The guide adds no animation, forced tour, completion tracking, API request or persistent user setting. Thinker remains a separate explicit interaction.
- Learn uses the existing mobile header Thinker action to avoid covering help controls. Other routes retain their existing behavior.

## Copy checked against the implementation

| Help topic | Source checked |
| --- | --- |
| Cash wallet and bank setup | Profile & Assets template; automatic confirmation, Finish connecting fallback and Retry Synchronisation |
| Manual transaction entry | Activity and Add Transaction forms; manual entries use cash wallets |
| Budget month/category/group/limit | Current Budgets form and income overview |
| Goal setup and contribution meaning | Create Goal, Manage Funds reservation/release, Activity Link to Goal and achievement eligibility |
| Overview, filtering and category detail | Dashboard and Reports implementation; recorded income/refund/transfer/NZD rules |
| Bank refresh semantics | Profile loadAssets reloads saved records; BankAutoSyncService attempts sync on app open |
| Thinker capabilities and privacy | Existing Thinker dialog; general education, current question only, no financial-record access |

The guide does not start bank authorization, create financial records or submit an AI question. Destination links open existing pages for the user to act. Recheck these instructions when the corresponding app flow changes.

## Validation

- 159 frontend and 78 isolated backend tests passed, including shared-instruction, safe-navigation and existing Thinker regression coverage.
- Learn/Thinker/shared-help ESLint, production build and whitespace checks passed. Existing stylesheet size warnings remain; new help component styles are below the warning threshold.
- Previous guide browser checks at 320, 390, 768 and 1440px: no horizontal overflow; Enter opens/closes disclosures; multiple FAQ answers remain open; Budgets navigation resolves; Thinker Escape restores focus to the FAQ action; search does not hide help.
- Previous desktop/mobile guide and FAQ previews captured. Current flow copy is covered by automated tests; a fresh browser pass remains outstanding. Thinker navigation and app-help questions were checked in explicit demo mode; no live provider question was submitted. Backend help wiring is included, with no schema or user-record changes.
- Full assistive-technology and cross-browser verification remain outstanding.

## Shared Thinker instructions

- `backend/app/content/app-help.json` is the single public content source. Learn imports it at build time through `src/app/shared/app-help.ts`; the backend loads the same file relative to its own application package. Keep that JSON file in backend deployments and the repository available during frontend builds.
- Thinker's bounded, stateless OpenAI instructions now include this public guide. No account records or conversation history are added. Questions remain authenticated, CSRF-protected and subject to the existing rate limits and output cap. Static guide context adds input tokens to live requests.
- Using SmartMoney is a suggested topic. Demo app answers use the same content, labelled as prepared demo replies. Live answers use OpenAI with instructions to stay within verified features and acknowledge unknown features.
- Reply navigation uses server-selected page IDs resolved by the frontend to fixed local routes and labels. Model/client URLs, unknown IDs and duplicate IDs cannot become navigation links. Following a link closes Thinker and opens the existing page; it does not create or change records.
- No paid AI calls were made during implementation testing. Provider payloads/errors are mocked in backend tests; browser checks use an isolated explicit demo-mode server. Live answer quality remains unverified.

## November integration refresh

- New-account onboarding is mandatory; employment/payroll can be skipped. Monthly allocation (including zero), percentages totalling 100%, review and Finish Setup remain required. Legacy accounts continue normally. The setup destination is `/onboarding`.
- Bank instructions cover automatic confirmation/initial sync, Finish connecting and Retry Synchronisation. Refresh balances reloads saved records.
- Goals reserve/release eligible funds without moving balances. Activity links existing purchases without another charge; achievement requires linked spending and no remaining reservation. Old contribution questions now explain Manage Funds.
- Cash-flow help includes refunds and separately identified uncategorised bank inflows. Payroll estimates are not recorded income.
- Six guide steps, eight FAQs and eight fixed destinations use the shared canonical JSON. Financial calculations and provider configuration are unchanged.
- Local database backup: `backend/.venv/backups/smartmoney-before-current-flow-instructions-20261117-155717.dump`. Three existing merged migrations advanced `545d669fced4` to `cac378317166`; no new migration or database reset.
- No live OpenAI or Mock Bank calls were used for this regression pass. Live answer quality and deployed integration remain unverified.
