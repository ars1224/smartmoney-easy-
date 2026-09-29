# SmartMoney! Easy

## Development Environment Setup

SmartMoney! Easy is a cloud-based personal finance application developed for the SD205 project.

This document explains how to prepare the local development environment required to work on the project.

---

## Technology Stack

### Frontend

* Ionic
* Angular
* TypeScript
* HTML
* CSS

### Backend

* Python
* Flask
* SQLAlchemy

### Database

* PostgreSQL

### Version Control and Collaboration

* Git
* GitHub
* Trello
* Microsoft Teams

### Future Deployment

The following technologies are part of the project architecture but are not required during the initial local development setup:

* AWS EC2
* AWS RDS
* AWS S3
* AWS IAM
* AWS Security Groups
* Capacitor mobile packaging

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

During installation, make sure Python is added to the system `PATH`.

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

# 6. Install Flask

Flask is used as the backend API framework for SmartMoney! Easy.

Install Flask:

```powershell
python -m pip install Flask
```

Verify:

```powershell
flask --version
```

Flask should display the installed Python and Flask versions.

> Project-specific Python dependencies may later be installed inside a Python virtual environment when backend development begins.

---

# 7. Install SQLAlchemy

SQLAlchemy is used as the Object Relational Mapper (ORM) between the Flask backend and PostgreSQL database.

Install SQLAlchemy:

```powershell
python -m pip install SQLAlchemy
```

Verify:

```powershell
python -c "import sqlalchemy; print(sqlalchemy.__version__)"
```

---

# 8. Install PostgreSQL

Download PostgreSQL:

https://www.postgresql.org/download/

Install:

* PostgreSQL Server
* PostgreSQL command-line tools
* pgAdmin 4

During installation, keep a record of the PostgreSQL administrator password.

Verify PostgreSQL:

```powershell
psql --version
```

Current development environment:

```text
PostgreSQL: 18.4
```

---

# 9. Clone the GitHub Repository

Clone the SmartMoney! Easy repository:

```powershell
git clone <repository-url>
```

Move into the repository:

```powershell
cd smartmoney-easy
```

Check the repository:

```powershell
git status
```

---

# 10. Install Frontend Dependencies

After cloning the repository, install the Node.js packages defined in `package.json`:

```powershell
npm install
```

---

# 11. Run the Ionic + Angular Application

Start the Ionic development server:

```powershell
ionic serve
```

The application should normally become available at:

```text
http://localhost:8100
```

Stop the server using:

```text
Ctrl + C
```

---

# 12. Verify the Development Environment

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
```

---

# Development Environment Checklist

| Technology      | Purpose                       | Status |
| --------------- | ----------------------------- | ------ |
| Git             | Version control               | ✅      |
| GitHub          | Remote repository             | ✅      |
| Node.js         | Ionic/Angular runtime tooling | ✅      |
| npm             | JavaScript package management | ✅      |
| Ionic CLI       | Ionic development             | ✅      |
| Angular CLI     | Angular development           | ✅      |
| TypeScript      | Frontend programming          | ✅      |
| HTML            | Frontend structure            | ✅      |
| CSS             | Frontend styling              | ✅      |
| Python          | Backend programming           | ✅      |
| pip             | Python package management     | ✅      |
| Flask           | Backend API                   | ✅      |
| SQLAlchemy      | ORM                           | ✅      |
| PostgreSQL      | Database                      | ✅      |
| Trello          | Project/Sprint management     | ✅      |
| Microsoft Teams | Team communication            | ✅      |

---

# Not Required During Initial Development

The following are intentionally excluded from the initial local development setup:

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

Capacitor is included as a future mobile packaging option but is not required for the initial MVP development workflow.

---

# Current SmartMoney! Easy Architecture

```text
Ionic + Angular
       │
       │ HTTP / REST API
       ▼
Flask + Python
       │
       │ SQLAlchemy
       ▼
PostgreSQL
```

During deployment, the architecture will be extended to:

```text
Ionic + Angular
       │
       ▼
Flask API
       │
       ├──────────────► AWS S3
       │
       ▼
PostgreSQL
       │
       ▼
AWS Infrastructure
EC2 + RDS + IAM + Security Groups
```

---

## Team Workflow

Development work should be coordinated using:

* **GitHub** — source code and version control
* **Trello** — Product Backlog, sprint tasks and progress tracking
* **Microsoft Teams** — team communication and Scrum collaboration

Developers should pull the latest changes before beginning work:

```powershell
git pull
```

After completing a task:

```powershell
git status
git add .
git commit -m "Describe completed work"
git push
```

---

## Project

**Project:** SmartMoney! Easy
**Course:** SD205
**Development Methodology:** Agile Scrum
