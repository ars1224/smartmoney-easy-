# SmartMoney! Easy

**Personal finance tracking, budgeting, savings goals, and financial learning — in one app.**

SmartMoney! Easy is a student-developed, NZD-focused financial wellness web application created for the **SD204B & SD205** software development project. It helps users record transactions, review their finances, set monthly budgets, work toward savings goals, and practise everyday money skills.

**Demo:** https://smartmoney-easy.duckdns.org/  
**Repository:** https://github.com/ars1224/smartmoney-easy-  
**Project approach:** Agile / Scrum  
**Documentation snapshot:** 22 November 2026 (NZDT)

> **Academic prototype:** SmartMoney! Easy uses a **simulated Mock Bank**, not a real bank connection. Do not enter real online banking credentials, production secrets, or sensitive financial information into a demonstration account. Financial education and AI output are not professional financial advice.

## Contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Local development](#local-development)
- [Testing and QA](#testing-and-qa)
- [Project structure](#project-structure)
- [Deployment notes](#deployment-notes)
- [Security and limitations](#security-and-limitations)
- [Team and documentation](#team-and-documentation)

## Features

The repository contains these application modules. Some workflows require a configured database, Mock Bank service, or optional external provider.

| Area | What the application supports |
| --- | --- |
| Account access | Registration, login/logout, authenticated sessions, password changes, password recovery with a recovery code, and account settings |
| First-time setup | Guided onboarding |
| Dashboard | Overview of recorded income, spending, refunds, cash flow, budgets, savings goals, and recent activity |
| Transactions | View activity, add/edit cash transactions, review imported bank transactions, and categorise transactions |
| Cash wallets and assets | Manage cash wallets, archive/restore wallets, and view profile/asset information |
| Mock banking | Simulated OAuth 2.0 / PKCE connection, account selection, account details, synchronisation, and disconnect/reconnect flows |
| Budgets | Configure and review monthly budgets with month navigation and spending categories |
| Savings goals | Create and manage goals, classify them by goal group, and track allocations, releases, and progress |
| Income planning | Monthly/regular income and NZ payroll-related planning modules |
| Reports | Monthly income, expenses, refunds, net cash flow, category analysis, and source filters |
| Learn | Short financial-literacy content, quizzes/challenges, and linked learning resources |
| Thinker | Financial-learning assistant with a no-provider-call demo mode; optional live OpenAI integration when privately configured |

**Important accounting distinction:** Reports and dashboard totals describe **recorded data**, not verified available bank funds, future income, or a guaranteed safe-to-spend amount. Reports focus on NZD and disclose data excluded from their calculations; they do not promise complete foreign-exchange conversion.

## Technology stack

| Layer | Technologies |
| --- | --- |
| Frontend | Ionic 9, Angular 22, TypeScript, HTML, SCSS, RxJS |
| Mobile-oriented tooling | Capacitor configuration (the current repository is primarily run as a web app) |
| Backend | Python, Flask, Flask-SQLAlchemy, Flask-CORS |
| Database | PostgreSQL, SQLAlchemy, Flask-Migrate / Alembic |
| Mock bank | Separate simulated banking API, OAuth 2.0 with PKCE |
| Optional AI | OpenAI Responses API through the Flask backend; demo mode by default |
| Collaboration | GitHub, Trello, Microsoft Teams; Agile Scrum |

Exact frontend dependencies are recorded in `package.json`, and Python packages in `backend/requirements.txt`.

## Architecture

~~~text
Browser / Ionic + Angular
          |
          | HTTP(S), JSON, /api
          v
       Flask API
          |
          +---- SQLAlchemy ---- PostgreSQL
          |
          +---- Mock Bank API (simulated accounts and transactions)
          |
          +---- Optional OpenAI API (Thinker live mode only)
~~~

Development runs the frontend and backend on separate local ports. The production Angular environment uses the same-origin `/api` path; the hosting or reverse-proxy configuration must forward these requests to Flask. The deployed demo address is listed above, but cloud infrastructure details should be confirmed from deployment configuration rather than assumed from older AWS plans.

## Local development

These instructions are written for Windows PowerShell. Commands can be adapted for macOS or Linux.

### 1. Prerequisites

Install:

- Git
- Node.js and npm (the project has been developed with Node.js 24)
- Python and pip (the project has been developed with Python 3.14)
- PostgreSQL (local development has used PostgreSQL 18)
- Ionic CLI, if you prefer `ionic serve`: `npm install -g @ionic/cli`

The versions above describe the project's development environment; check `package.json` for the committed Angular dependencies and test other runtime versions before relying on them.

### 2. Clone and install the frontend

~~~powershell
git clone https://github.com/ars1224/smartmoney-easy-.git
cd smartmoney-easy-
npm ci
~~~

### 3. Create the PostgreSQL database

Start your local PostgreSQL server. For the default PostgreSQL superuser:

~~~powershell
psql -U postgres -c 'CREATE DATABASE smartmoney_easy;'
~~~

If `psql` is not on your PATH, use the full path to `psql.exe`. If the database already exists, skip creating it again.

### 4. Set up the Flask backend

From the repository root:

~~~powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
~~~

Edit `backend/.env` locally. At minimum configure the database URL and a private Flask secret; bank-connection features require additional Mock Bank settings.

~~~dotenv
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/smartmoney_easy
SECRET_KEY=REPLACE_WITH_A_LONG_RANDOM_SECRET
SESSION_COOKIE_SECURE=false

# Simulated bank integration (requires valid service credentials)
MOCK_BANK_API_BASE_URL=https://smartmoney-mock-bank.onrender.com/api/v1
MOCK_BANK_API_KEY=YOUR_MOCK_BANK_API_KEY
MOCK_BANK_OAUTH_CLIENT_ID=smartmoney-easy
MOCK_BANK_OAUTH_REDIRECT_URI=http://localhost:8100/bank/callback
BANK_TOKEN_ENCRYPTION_KEY=YOUR_FERNET_KEY

# Optional AI: safe default, no provider request
THINKER_MODE=demo
OPENAI_API_KEY=
~~~

The committed `.env.example` is the authoritative list of configurable options. For the installed `psycopg` driver, use the explicit `postgresql+psycopg://` SQLAlchemy URL shown above. Never publish an actual secret, database password, or API key.

Generate development-only key material locally:

~~~powershell
python -c "import secrets; print(secrets.token_urlsafe(32))"
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
~~~

Use the first value for `SECRET_KEY` and the second for `BANK_TOKEN_ENCRYPTION_KEY`. Keep both private and stable for your local environment. The Mock Bank key is **not** generated by these commands; obtain it from the Mock Bank service configuration. Without a running/accessible Mock Bank and valid credentials, banking operations may not work, while unrelated app features can still be developed.

Apply the existing database migrations from the `backend` directory:

~~~powershell
python -m flask --app run db upgrade
~~~

Do not run `flask db init` or delete migration files: this project already tracks its Alembic migrations.

### 5. Start both development servers

**Terminal 1 — backend**, from the `backend` directory with its virtual environment active:

~~~powershell
python run.py
~~~

Backend: http://127.0.0.1:5000

**Terminal 2 — frontend**, from the repository root:

~~~powershell
npm install -g @ionic/cli
ionic serve
~~~

Frontend: http://localhost:8100

Alternatively, use `npm start` (Angular's dev server, commonly on port 4200). If switching ports, ensure the Mock Bank OAuth redirect URI matches the actual browser callback URL and the URI registered with the Mock Bank service.

The development frontend uses `http://localhost:5000/api` via `src/environments/environment.ts`. The production build replaces it with `/api` using `src/environments/environment.prod.ts`.

### 6. Verify the backend

With Flask running:

- API health: http://127.0.0.1:5000/api/health
- Database health: http://127.0.0.1:5000/api/health/database

A successful health response is a basic connectivity check, **not** proof that every application workflow is healthy.

## Testing and QA

From the **repository root**, run the frontend checks:

~~~powershell
npm run lint
npm test -- --watch=false
npm run build
~~~

From the **backend** directory, inside the virtual environment, run the isolated Python test suite:

~~~powershell
python -m unittest discover -s tests -p "test_*.py"
~~~

There are also targeted development/regression files named `backend/dev_test_*.py`. Some have special environment or database assumptions: inspect their guards and setup before running them. Avoid pointing destructive test commands at shared or production databases.

### Manual QA snapshot — 21 November 2026

The team's deployed-app manual QA report records **46 passed checks**, with **39 supported by screenshots and 7 confirmed in chat**. It also records **six minor UI observations** and states that wider testing remains pending. This is a **partial manual-testing snapshot**, not a claim of full end-to-end certification. See the assessment QA evidence for individual test IDs, failures, and follow-up decisions.

### Current release/documentation status

- The frontend, Flask API, database integrations, and feature modules are present in the repository.
- The demo deployment URL has been supplied by the project team; this README does not certify current uptime or production infrastructure.
- Browser, accessibility, security, performance, and cross-environment coverage should be assessed against the final deployed commit before any broader release claim.

## Project structure

~~~text
smartmoney-easy-/
├── src/
│   ├── app/
│   │   ├── pages/             # App screens
│   │   ├── core/              # Shared services, authentication, guards
│   │   └── shell/             # App navigation
│   └── environments/          # Local and production API URLs
├── backend/
│   ├── app/
│   │   ├── models/            # Database models
│   │   ├── routes/            # Flask API blueprints
│   │   └── services/          # Application business logic
│   ├── migrations/            # Existing Alembic migrations
│   ├── tests/                 # Isolated Python tests
│   ├── .env.example           # Environment template
│   ├── config.py
│   ├── requirements.txt
│   └── run.py
├── docs/                      # Feature-specific implementation notes
├── angular.json
├── capacitor.config.ts
├── package.json
└── README.md
~~~

## Deployment notes

- **Demo URL:** https://smartmoney-easy.duckdns.org/
- **Production frontend API base:** `/api` (same-origin; must be routed to the Flask backend).
- **Mock banking service:** https://smartmoney-mock-bank.onrender.com/ (a separate simulated service, not a financial institution).
- **Production secrets:** Configure outside source control; use HTTPS and `SESSION_COOKIE_SECURE=true`.
- **Database:** Apply tracked migrations to the intended PostgreSQL instance and keep backups before schema changes.
- **Optional Thinker live mode:** Requires `THINKER_MODE=live` and a private server-side `OPENAI_API_KEY`, plus production-appropriate usage limiting. Default demo mode does not make paid provider requests.

See `docs/THINKER.md` for live-mode controls and deployment limits. Do not infer an AWS EC2/RDS/S3 deployment from an earlier plan unless the actual deployed configuration verifies it.

## Security and limitations

- **Never commit** `.env` files, passwords, Flask secrets, encryption keys, tokens, or real financial data.
- The authentication API uses sessions and CSRF checks; recovery and banking workflows should still be tested in the target environment.
- Banking is **simulated**. Do not use real bank login details.
- Financial summaries depend on the completeness and classification of imported/entered transactions. Some transfers, refunds, currencies, or unavailable records require review and may be excluded from totals.
- Savings goal progress is app-recorded progress, not a bank-verified balance.
- Thinker is educational, not a financial adviser. Live AI is optional and external-provider behaviour should be disclosed to users.
- This is an academic prototype and is **not presented as a production-ready regulated financial product**.

## Team and documentation

| Member | Main project responsibilities |
| --- | --- |
| Aries | Product ownership; financial features, savings goals, budgets, cash wallets, and Mock Bank integration |
| Han | Account/security features and bank synchronisation integration |
| Dhona | Shared UI, app shell/navigation, dashboard, and QA coordination |

The team follows **Agile Scrum**, using GitHub for code review/version control, Trello for backlog and sprint work, and Microsoft Teams for communication.

Additional repository documentation:

- [Dashboard](docs/DASHBOARD.md)
- [Reports & insights](docs/REPORTS.md)
- [Learn](docs/LEARN.md)
- [Learn app guide](docs/LEARN_APP_GUIDE.md)
- [Thinker](docs/THINKER.md)

---

**SmartMoney! Easy — SD204B & SD205**  
*Last README revision: 22 November 2026 (NZDT).*
