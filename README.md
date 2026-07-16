INFRA-CTRL: Infrastructure Control Plane

INFRA-CTRL is a full-stack, Role-Based Access Control (RBAC) platform designed to manage and monitor a Linux server's state. It bridges the gap between a modern web dashboard and low-level Linux system administration.

Instead of executing system commands directly from the web API, this platform uses an Infrastructure as Code (IaC) pattern. The React frontend writes the "desired state" to a MySQL database, and a continuously running Python background daemon reconciles the actual Linux OS to match that blueprint.

🚀 Key Features

Role-Based Access Control (RBAC): Simulated authentication separating manager and std (standard) users. Managers can see and control everything; standard users can only view logs and tasks assigned specifically to them.

Declarative OS User Management: Add users via the web dashboard. The background daemon automatically provisions the Linux user account, sets primary groups, and assigns sudo privileges.

Cron Job Delegation: Schedule background tasks mapped to specific users.

Self-Healing State: If an unauthorized user modifies the crontab or deletes a managed user directly in Linux, the daemon will automatically detect the drift and fix it on its next cycle.

Immutable Audit Trail: Every action taken by the daemon is logged with a timestamp and status, viewable in real-time on the React dashboard.

🛠️ Tech Stack

Frontend: React, Tailwind CSS, Recharts (for data visualization), Lucide React (for iconography).

Backend: FastAPI (Python), Pydantic (data validation).

Database: MySQL 8.0 (Dockerized).

System Daemon: Python subprocess library (interacting with Ubuntu/Linux native commands like useradd, userdel, crontab).

⚙️ Setup & Installation

1. Database Setup

Ensure you have Docker installed, then spin up the MySQL instance:

cd backend
docker-compose up -d


Note: Make sure your .env file matches the credentials in docker-compose.yml (e.g., DB_PASSWORD=1230, DB_NAME=Linux-Users).

2. Backend API Setup

Activate your virtual environment and run the FastAPI server:

cd backend
# Windows: .\.venv\Scripts\activate
# Linux/Mac: source .venv/bin/activate
pip install fastapi uvicorn python-dotenv mysql-connector-python pydantic
uvicorn api:app --reload


The API will be available at http://127.0.0.1:8000.

3. Frontend Setup

Open a new terminal and start the Vite React server:

cd frontend
npm install
npm run dev


The dashboard will be available at http://localhost:3000 (or the port Vite provides).

4. Running the Background Daemon (Linux Only)

To actually have the system create Linux users and manage crontabs, the daemon must be running with root privileges on the target machine.

cd backend
sudo python3 Prossesor.py


(In a production environment, this should be configured as a systemd service).

🗄️ Database Schema Summary

SystemUsers: Tracks users, groups, sudo access, expected OS state, and their dashboard role (d_role: 'manager' or 'std').

ScheduledTasks: Stores the cron expression, command, and the run_as_user linking it to a specific system user.

AuditLogs: Records every action (USER_CREATE, CRON_DELETE, etc.), the target entity, and the success/error status.
