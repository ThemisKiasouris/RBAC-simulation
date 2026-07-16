import os
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel

from db import get_db_connection

load_dotenv()

app = FastAPI(
    title="Controller API",
    description="RBAC-enabled API for controlling and monitoring the system",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models for Input Validation ---
class UserCreate(BaseModel):
    username: str
    primary_group: str = 'users'
    has_sudo: bool = False
    shell_path: str = '/bin/bash'
    d_role: str = 'user'

class CreateTaskPayload(BaseModel):
    task_name: str
    cron_expression: str
    command_to_run: str
    run_as_user: str = "root"

class UpdateTaskPayload(BaseModel):
    cron_expression: str
    command_to_run: str
    run_as_user: str

# --- Helpers ---
def get_user_role(cursor, username: str):
    """Helper to check if the requester is a manager or standard user."""
    cursor.execute("SELECT d_role FROM SystemUsers WHERE username = %s", (username,))
    user = cursor.fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="User not found in system")
    return user['d_role']

# --- KPI & Dashboard Endpoints ---
@app.get("/api/kpis")
async def get_kpis(x_user: str = Header(default="root_admin")):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    
    cursor = conn.cursor(dictionary=True)
    try:
        role = get_user_role(cursor, x_user)

        if role == 'manager':
            cursor.execute("SELECT count(*) as count FROM SystemUsers WHERE expected_state='present'")
            user_count = cursor.fetchone()['count']

            cursor.execute("SELECT count(*) as count FROM ScheduledTasks WHERE expected_state='present'")
            task_count = cursor.fetchone()['count']

            cursor.execute("SELECT COUNT(*) as count FROM AuditLogs WHERE status = 'ERROR' AND timestamp >= NOW() - INTERVAL 1 DAY")
            error_count = cursor.fetchone()['count']
        else:
            user_count = 1 

            cursor.execute("SELECT count(*) as count FROM ScheduledTasks WHERE expected_state='present' AND run_as_user = %s", (x_user,))
            task_count = cursor.fetchone()['count']

            cursor.execute("""
                SELECT COUNT(a.id) as count FROM AuditLogs a
                JOIN ScheduledTasks s ON a.target_entity = s.task_name
                WHERE a.status = 'ERROR' AND a.timestamp >= NOW() - INTERVAL 1 DAY AND s.run_as_user = %s
            """, (x_user,))
            error_count = cursor.fetchone()['count']

        return {
            "managed_users": user_count,
            "active_tasks": task_count,
            "latest_errors": error_count
        }
    finally:
        cursor.close()
        conn.close()

@app.get("/api/logs")
async def get_logs(limit: int = 50, x_user: str = Header(default="root_admin")):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    
    cursor = conn.cursor(dictionary=True)
    try:
        role = get_user_role(cursor, x_user)

        if role == 'manager':
            query = "SELECT id, timestamp, action_type, target_entity, details, status FROM AuditLogs ORDER BY timestamp DESC LIMIT %s"
            cursor.execute(query, (limit,))
        else:
            query = """
                SELECT a.id, a.timestamp, a.action_type, a.target_entity, a.details, a.status 
                FROM AuditLogs a
                JOIN ScheduledTasks s ON a.target_entity = s.task_name
                WHERE s.run_as_user = %s
                ORDER BY a.timestamp DESC LIMIT %s
            """
            cursor.execute(query, (x_user, limit))
            
        logs = cursor.fetchall()
        for log in logs:
            log['timestamp'] = log['timestamp'].strftime("%Y-%m-%d %H:%M:%S")
        return logs
    finally:
        cursor.close()
        conn.close()

@app.get("/api/chart-data")
async def get_data_charts(x_user: str = Header(default="root_admin")):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
        
    cursor = conn.cursor(dictionary=True)
    try:
        role = get_user_role(cursor, x_user)

        if role == 'manager':
            query = """
                SELECT DATE(timestamp) as log_date,
                SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END) as error_count
                FROM AuditLogs WHERE timestamp >= NOW() - INTERVAL 7 DAY
                GROUP BY DATE(timestamp) ORDER BY log_date ASC
            """
            cursor.execute(query)
        else:
            query = """
                SELECT DATE(a.timestamp) as log_date,
                SUM(CASE WHEN a.status = 'SUCCESS' THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN a.status = 'ERROR' THEN 1 ELSE 0 END) as error_count
                FROM AuditLogs a
                JOIN ScheduledTasks s ON a.target_entity = s.task_name
                WHERE a.timestamp >= NOW() - INTERVAL 7 DAY AND s.run_as_user = %s
                GROUP BY DATE(a.timestamp) ORDER BY log_date ASC
            """
            cursor.execute(query, (x_user,))
            
        chart_data = cursor.fetchall()
        formatted_data = []
        for row in chart_data:
            formatted_data.append({
                "date": row['log_date'].strftime("%b %d"),
                "success": int(row['success_count']),
                "error": int(row['error_count'])
            })
        return formatted_data
    finally:
        cursor.close()
        conn.close()

# --- User Endpoints ---

@app.get("/api/users")
async def get_users(x_user: str = Header(default="root_admin")):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        role = get_user_role(cursor, x_user)
        if role != 'manager':
            raise HTTPException(status_code=403, detail="Forbidden. Managers only.")
            
        cursor.execute("SELECT id, username, primary_group, has_sudo, d_role, expected_state FROM SystemUsers")
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@app.post("/api/users")
async def create_user(user: UserCreate, x_user: str = Header(default="root_admin")):
    """Create a new system user. Managers only."""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        role = get_user_role(cursor, x_user)
        if role != 'manager':
            raise HTTPException(status_code=403, detail="Forbidden. Managers only.")
            
        # Insert user into the blueprint database
        cursor.execute(
            "INSERT INTO SystemUsers (username, primary_group, has_sudo, shell_path, d_role) VALUES (%s, %s, %s, %s, %s)",
            (user.username, user.primary_group, user.has_sudo, user.shell_path, user.d_role)
        )
        conn.commit()
        return {"message": "User created successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

# --- Task Endpoints ---

@app.get("/api/tasks")
async def get_tasks(x_user: str = Header(default="root_admin")):
    """Get list of cron tasks. Role filtered and only active tasks are returned."""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        role = get_user_role(cursor, x_user)
        
        if role == 'manager':
            cursor.execute("SELECT * FROM ScheduledTasks WHERE expected_state = 'present'")
        else:
            cursor.execute(
                "SELECT * FROM ScheduledTasks WHERE run_as_user = %s AND expected_state = 'present'",
                (x_user,),
            )
            
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()


class CreateTaskPayload(BaseModel):
    task_name: str
    cron_expression: str
    command_to_run: str
    run_as_user: str = "root"


@app.post("/api/tasks")
async def create_task(payload: CreateTaskPayload, x_user: str = Header(default="root_admin")):
    """Create a new cron task. Managers only."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")

    cursor = conn.cursor(dictionary=True)
    try:
        role = get_user_role(cursor, x_user)
        if role != 'manager':
            raise HTTPException(status_code=403, detail="Forbidden. Managers only.")
        
        query = """
            INSERT INTO ScheduledTasks (task_name, cron_expression, command_to_run, run_as_user, expected_state)
            VALUES (%s, %s, %s, %s, %s)
        """
        cursor.execute(
            query,
            (
                payload.task_name,
                payload.cron_expression,
                payload.command_to_run,
                payload.run_as_user,
                'present'
            ),
        )
        conn.commit()
        
        return {"message": f"Task '{payload.task_name}' created successfully."}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating task: {e}") from e
    finally:
        cursor.close()
        conn.close()

@app.put("/api/tasks/{task_id}")
async def update_task(task_id: int, payload: UpdateTaskPayload, x_user: str = Header(default="root_admin")):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        role = get_user_role(cursor, x_user)
        if role != 'manager':
            raise HTTPException(status_code=403, detail="Forbidden. Managers only.")
        
        query = """
            UPDATE ScheduledTasks 
            SET cron_expression = %s, command_to_run = %s, run_as_user = %s 
            WHERE task_id = %s
        """
        cursor.execute(query, (payload.cron_expression, payload.command_to_run, payload.run_as_user, task_id))
        conn.commit()
        return {"message": "Task updated successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: int, x_user: str = Header(default="root_admin")):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        role = get_user_role(cursor, x_user)
        if role != 'manager':
            raise HTTPException(status_code=403, detail="Forbidden. Managers only.")
        
        # We don't DELETE the row, we set it to 'absent' so the daemon knows to remove it from linux!
        cursor.execute("UPDATE ScheduledTasks SET expected_state = 'absent' WHERE task_id = %s", (task_id,))
        conn.commit()
        return {"message": "Task marked for deletion"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()