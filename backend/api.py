import os
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from db import get_db_connection

load_dotenv()

app = FastAPI(
    title="Controller API",
    description="RBAC-enabled API for controlling and monitoring a linux system",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_user_role(cursor, username: str):
    """Helper to check if the requester is a manager or standard user."""
    cursor.execute("SELECT dashboard_role FROM SystemUsers WHERE username = %s", (username,))
    user = cursor.fetchone()
    if not user:
        raise HTTPException(status_code=401, detail="User not found in system")
    return user['dashboard_role']


@app.get("/api/kpis")
async def get_kpis(x_user: str = Header(default="root_admin")): # Simulating authentication
    """Fetch KPIs filtered by user role."""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    
    cursor = conn.cursor(dictionary=True)

    try:
        role = get_user_role(cursor, x_user)

        if role == 'manager':
            # Manager sees EVERYTHING
            cursor.execute("SELECT count(*) as count FROM SystemUsers WHERE expected_state='present'")
            user_count = cursor.fetchone()['count']

            cursor.execute("SELECT count(*) as count FROM ScheduledTasks WHERE expected_state='present'")
            task_count = cursor.fetchone()['count']

            cursor.execute("SELECT COUNT(*) as count FROM AuditLogs WHERE status = 'ERROR' AND timestamp >= NOW() - INTERVAL 1 DAY")
            error_count = cursor.fetchone()['count']
        else:
            # Standard User sees only their stats
            user_count = 1 # They only manage themselves

            cursor.execute("SELECT count(*) as count FROM ScheduledTasks WHERE expected_state='present' AND run_as_user = %s", (x_user,))
            task_count = cursor.fetchone()['count']

            # Join AuditLogs to ScheduledTasks to only count errors for their tasks
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
    """Fetch logs filtered by user role."""
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
            # INNER JOIN ensures standard users only see logs where the target_entity matches their assigned tasks
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
    """Fetch chart data filtered by user role."""
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


@app.get("/api/users")
async def get_users(x_user: str = Header(default="root_admin")):
    """Get list of system users. Managers only."""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        role = get_user_role(cursor, x_user)
        if role != 'manager':
            raise HTTPException(status_code=403, detail="Forbidden. Managers only.")
            
        cursor.execute("SELECT id, username, primary_group, has_sudo, dashboard_role, expected_state FROM SystemUsers")
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@app.get("/api/tasks")
async def get_tasks(x_user: str = Header(default="root_admin")):
    """Get list of cron tasks. Role filtered."""
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        role = get_user_role(cursor, x_user)
        
        if role == 'manager':
            cursor.execute("SELECT * FROM ScheduledTasks")
        else:
            cursor.execute("SELECT * FROM ScheduledTasks WHERE run_as_user = %s", (x_user,))
            
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()