# SmartMoney! Easy

## Development Environment Setup

SmartMoney! Easy is a cloud-based personal finance application developed for the **SD205 project**.

This document explains how to prepare the local development environment, install the frontend and backend dependencies, configure PostgreSQL, and run the application locally.

---

## Technology Stack

### Frontend

- Ionic
- Angular
- TypeScript
- HTML
- CSS

### Backend

- Python
- Flask
- Flask-SQLAlchemy
- Flask-CORS
- python-dotenv
- Psycopg

### Database

- PostgreSQL

### Version Control and Collaboration

- Git
- GitHub
- Trello
- Microsoft Teams

### Future Deployment

The following technologies are part of the planned project architecture but are not required during the initial local development phase:

- AWS EC2
- AWS RDS
- AWS S3
- AWS IAM
- AWS Security Groups
- Capacitor mobile packaging

AWS configuration will be completed during the deployment phase.

---

# 1. Install Git

Download and install Git:

https://git-scm.com/

Verify the installation:

```powershell
git --version
```

Example:

```text
git version 2.x.x
```

---

# 2. Install Node.js

Ionic and Angular require Node.js and npm.

Download Node.js:

https://nodejs.org/

Verify Node.js:

```powershell
node -v
```

Verify npm:

```powershell
npm -v
```

Current development environment:

```text
Node.js: v24.16.0
npm: 11.13.0
```

---

# 3. Install Ionic CLI

Install the Ionic CLI globally:

```powershell
npm install -g @ionic/cli
```

Verify:

```powershell
ionic --version
```

Current development environment:

```text
Ionic CLI: 7.2.1
```

---

# 4. Install Angular CLI

Install Angular CLI globally:

```powershell
npm install -g @angular/cli
```

Verify:

```powershell
ng version
```

Current development environment:

```text
Angular CLI: 22.1.8
Angular: 22.1.7
```

---

# 5. Install Python

Download Python:

https://www.python.org/downloads/

During installation, make sure Python is added to the Windows system `PATH`.

Verify Python:

```powershell
python --version
```

Verify pip:

```powershell
pip --version
```

Current development environment:

```text
Python: 3.14.6
pip: 26.1.2
```

---

# 6. Install PostgreSQL

Download PostgreSQL:

https://www.postgresql.org/download/

Install the following components:

- PostgreSQL Server
- PostgreSQL command-line tools
- pgAdmin 4

During installation:

- Keep the default port `5432`
- Use the default administrator username `postgres`
- Create and remember the PostgreSQL administrator password

Current development environment:

```text
PostgreSQL: 18.4
```

Verify PostgreSQL:

```powershell
psql --version
```

## If `psql` Is Not Recognised

On Windows, PostgreSQL may be installed correctly even if `psql` is not available directly from PowerShell.

Find `psql.exe` using:

```powershell
Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter psql.exe -ErrorAction SilentlyContinue
```

Example PostgreSQL 18 location:

```text
C:\Program Files\PostgreSQL\18\bin\psql.exe
```

Run it directly using:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres
```

To temporarily add PostgreSQL to the current PowerShell session:

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"
```

Then verify:

```powershell
psql --version
```

For permanent access, add the PostgreSQL `bin` directory to the Windows `PATH` environment variable.

---

# 7. Clone the GitHub Repository

Clone the SmartMoney! Easy repository:

```powershell
git clone <repository-url>
```

Move into the repository:

```powershell
cd smartmoney-easy-
```

Check the repository:

```powershell
git status
```

---

# 8. Install Frontend Dependencies

From the project root, install the packages defined in `package.json`:

```powershell
npm install
```

The frontend is located primarily inside:

```text
src/
```

The existing Ionic + Angular application should not require any additional setup after `npm install`.

---

# 9. Run the Ionic + Angular Application

From the project root:

```powershell
ionic serve
```

The frontend should normally become available at:

```text
http://localhost:8100
```

Stop the server using:

```text
Ctrl + C
```

---

# 10. Backend Project Structure

The Flask backend is stored separately from the Ionic + Angular frontend.

Current backend structure:

```text
backend/
│
├── app/
│   ├── __init__.py
│   ├── extensions.py
│   │
│   ├── models/
│   │   └── __init__.py
│   │
│   ├── routes/
│   │   ├── __init__.py
│   │   └── health.py
│   │
│   └── services/
│       └── __init__.py
│
├── .env
├── .env.example
├── config.py
├── requirements.txt
└── run.py
```

The frontend and backend remain inside the same Git repository but are kept logically separated.

---

# 11. Create the Python Virtual Environment

Move into the backend folder:

```powershell
cd backend
```

Create the virtual environment:

```powershell
python -m venv .venv
```

Activate it:

```powershell
.\.venv\Scripts\Activate.ps1
```

Once activated, PowerShell should display:

```text
(.venv)
```

Example:

```text
(.venv) PS C:\...\smartmoney-easy-\backend>
```

The virtual environment must not be committed to GitHub.

The project `.gitignore` should include:

```gitignore
backend/.venv/
backend/.env
__pycache__/
*.pyc
```

---

# 12. Install Backend Dependencies

The backend dependencies are defined in:

```text
backend/requirements.txt
```

Current requirements:

```text
Flask
Flask-SQLAlchemy
Flask-Cors
python-dotenv
psycopg[binary]
```

Install them using:

```powershell
pip install -r requirements.txt
```

The packages provide the following functionality:

| Package | Purpose |
| --- | --- |
| Flask | Backend REST API framework |
| Flask-SQLAlchemy | SQLAlchemy integration with Flask |
| Flask-CORS | Allows the Ionic frontend to communicate with Flask |
| python-dotenv | Loads environment variables from `.env` |
| psycopg | PostgreSQL database driver |

Verify Flask:

```powershell
flask --version
```

Verify SQLAlchemy:

```powershell
python -c "import sqlalchemy; print(sqlalchemy.__version__)"
```

Verify Psycopg:

```powershell
pip show psycopg
```

---

# 13. Create the PostgreSQL Database

Connect to PostgreSQL:

```powershell
psql -U postgres
```

If `psql` is not available through the system `PATH`, use the full executable path:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres
```

Enter the PostgreSQL administrator password when requested.

Once connected, the terminal should display:

```text
postgres=#
```

Create the SmartMoney! Easy database:

```sql
CREATE DATABASE smartmoney_easy;
```

List the available databases:

```sql
\l
```

Confirm that the following database exists:

```text
smartmoney_easy
```

Exit PostgreSQL:

```sql
\q
```

---

# 14. Configure Backend Environment Variables

Inside the `backend` directory, create the local environment file from the provided example:

```powershell
Copy-Item .env.example .env
```

The `.env` file contains local configuration and database credentials.

Example:

```env
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/smartmoney_easy
```

Replace:

```text
YOUR_PASSWORD
```

with the local PostgreSQL administrator password.

The `.env` file must never be committed to GitHub.

Only `.env.example` should be stored in the repository.

Example `.env.example`:

```env
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/smartmoney_easy
```

---

# 15. Flask Database Configuration

The backend configuration is stored in:

```text
backend/config.py
```

Current configuration:

```python
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
```

SQLAlchemy is initialised in:

```text
backend/app/extensions.py
```

```python
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()
```

The Flask application factory is located in:

```text
backend/app/__init__.py
```

It is responsible for:

- Creating the Flask application
- Loading application configuration
- Initialising CORS
- Initialising SQLAlchemy
- Registering API blueprints

---

# 16. Run the Flask Backend

Make sure the Python virtual environment is activated:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
```

Start the backend:

```powershell
python run.py
```

The Flask API should normally become available at:

```text
http://127.0.0.1:5000
```

Example terminal output:

```text
* Running on http://127.0.0.1:5000
```

Stop the backend using:

```text
Ctrl + C
```

---

# 17. Test the Flask API

SmartMoney! Easy currently includes a basic health endpoint.

Open:

```text
http://127.0.0.1:5000/api/health
```

Expected response:

```json
{
  "service": "SmartMoney Easy API",
  "status": "ok"
}
```

This confirms that the Flask REST API is running.

---

# 18. Test the PostgreSQL Connection

The backend also includes a database health endpoint.

Open:

```text
http://127.0.0.1:5000/api/health/database
```

Expected response:

```json
{
  "database": "connected",
  "status": "ok"
}
```

This confirms that the following connection is working:

```text
Flask
  ↓
SQLAlchemy
  ↓
Psycopg
  ↓
PostgreSQL
```

If the connection fails, check:

- PostgreSQL Server is running
- The `smartmoney_easy` database exists
- The `.env` file exists
- The PostgreSQL username is correct
- The PostgreSQL password is correct
- PostgreSQL is using port `5432`
- `DATABASE_URL` is correctly configured

---

# 19. Running the Full Local Development Environment

SmartMoney! Easy currently requires two development servers.

## Terminal 1 — Frontend

From the project root:

```powershell
ionic serve
```

Frontend:

```text
http://localhost:8100
```

## Terminal 2 — Backend

From the backend directory:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python run.py
```

Backend:

```text
http://127.0.0.1:5000
```

The intended local communication flow is:

```text
Ionic + Angular
       │
       │ HTTP / REST API
       ▼
Flask
       │
       │ SQLAlchemy
       ▼
PostgreSQL
```

---

# 20. Verify the Development Environment

Run the following commands to confirm that the required development tools are available:

```powershell
git --version
node -v
npm -v
ionic --version
ng version
python --version
pip --version
flask --version
psql --version
python -c "import sqlalchemy; print(sqlalchemy.__version__)"
pip show psycopg
```

---

# Development Environment Checklist

| Technology | Purpose | Status |
| --- | --- | --- |
| Git | Version control | ✅ |
| GitHub | Remote repository | ✅ |
| Node.js | Ionic/Angular runtime tooling | ✅ |
| npm | JavaScript package management | ✅ |
| Ionic CLI | Ionic development | ✅ |
| Angular CLI | Angular development | ✅ |
| TypeScript | Frontend programming | ✅ |
| HTML | Frontend structure | ✅ |
| CSS | Frontend styling | ✅ |
| Python | Backend programming | ✅ |
| pip | Python package management | ✅ |
| Python Virtual Environment | Backend dependency isolation | ✅ |
| Flask | Backend REST API | ✅ |
| Flask-SQLAlchemy | Flask ORM integration | ✅ |
| Flask-CORS | Frontend/API communication | ✅ |
| python-dotenv | Environment variable management | ✅ |
| Psycopg | PostgreSQL driver | ✅ |
| PostgreSQL | Database | ✅ |
| Trello | Project/Sprint management | ✅ |
| Microsoft Teams | Team communication | ✅ |

---

# Not Required During Initial Development

The following technologies are intentionally excluded from the initial local development setup:

```text
AWS CLI
AWS EC2 configuration
AWS RDS configuration
AWS S3 configuration
AWS IAM configuration
AWS Security Groups
Android Studio
Java/JDK
Xcode
Docker
```

AWS infrastructure will be configured during the deployment phase.

Capacitor remains part of the planned mobile application architecture but is not required for the initial MVP development workflow.

---

# Current SmartMoney! Easy Architecture

```text
┌──────────────────────────────┐
│       Ionic + Angular        │
│          Frontend            │
└──────────────┬───────────────┘
               │
               │ HTTP / REST API
               ▼
┌──────────────────────────────┐
│        Flask + Python        │
│          Backend API         │
└──────────────┬───────────────┘
               │
               │ SQLAlchemy
               ▼
┌──────────────────────────────┐
│          PostgreSQL          │
│           Database           │
└──────────────────────────────┘
```

---

# Planned Deployment Architecture

During the deployment phase, the architecture will be extended using AWS infrastructure.

```text
Ionic + Angular
       │
       │ HTTPS / REST API
       ▼
Flask API
       │
       ├──────────────► AWS S3
       │
       ▼
SQLAlchemy
       │
       ▼
PostgreSQL
       │
       ▼
AWS RDS

Backend Hosting:
AWS EC2

Supporting AWS Services:
IAM
Security Groups
S3
RDS
```

---

# Team Workflow

Development work should be coordinated using:

- **GitHub** — source code and version control
- **Trello** — Product Backlog, sprint tasks, and progress tracking
- **Microsoft Teams** — team communication and Scrum collaboration

Developers should pull the latest changes before beginning work:

```powershell
git pull
```

Developers should work on their own feature branch where appropriate.

Example:

```powershell
git checkout -b feature/example-feature
```

After completing a task:

```powershell
git status
git add .
git commit -m "Describe completed work"
git push
```

Changes should be reviewed before being merged into the main development branch.

---

# Security Notes

The following files or information must never be committed to GitHub:

```text
.env
Database passwords
API keys
Secret keys
AWS credentials
Private access tokens
```

Use environment variables for sensitive configuration.

The repository should contain `.env.example` only as a configuration template.

---

# Current Development Status

The initial local development foundation is now configured.

```text
Ionic + Angular                  ✅
Flask REST API                  ✅
Flask-SQLAlchemy                ✅
PostgreSQL driver               ✅
PostgreSQL local database       ✅
Environment configuration       ✅
API health endpoint             ✅
Database connection endpoint    ✅
```

The next development stage will introduce the SmartMoney! Easy application models, API endpoints, and frontend/backend integration.

---

## Project

**Project:** SmartMoney! Easy  
**Course:** SD205  
**Development Methodology:** Agile Scrum