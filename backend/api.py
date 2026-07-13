import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from db import get_db_connection


# load environment variables from .env file
load_dotenv()


# Initialize the FastAPI application
app = FastAPI(
    title="Controller API",
    description="API for controlling and monitoring the system",
    version="1.0.0",
)

# Configure CORS settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development; restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/kpis")

async def get_kpis():
    """Fetch KPIs from the database"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    
    cursor = conn.cursor(dictionary=True)

    try:
        # Count users managed by daemon
        cursor.execute("select count(*) as count from SystemUsers where expected_state='present'")
        user_count = cursor.fetchone()['count']

        # Count active tasks
        cursor.execute ("select count(*) as count from ScheduledTasks where expected_state='present'")
        task_count = cursor.fetchone()['count']

        # Count errors in the last 24 hours
        cursor.execute("SELECT COUNT(*) as count FROM AuditLogs WHERE status = 'ERROR' AND timestamp >= NOW() - INTERVAL 1 DAY")
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

async def get_logs(limit: int = 50):
    """Fetch logs from the database"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    
    cursor = conn.cursor(dictionary=True)

    try:
        # Fetch logs ordered by newest first
        query = "SELECT id, timestamp, action_type, target_entity, details, status FROM AuditLogs ORDER BY timestamp DESC LIMIT %s"
        cursor.execute(query, (limit,))
        logs = cursor.fetchall()

        # format logs for react
        for log in logs:
            log['timestamp'] = log['timestamp'].strftime("%Y-%m-%d %H:%M:%S")
        return logs
    finally:
        cursor.close()
        conn.close()


@app.get("/api/chart-data")

async def get_data_charts():
    """Fetch data for charts from the database"""
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
        
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Fetch data for the last 7 days, grouped by date
        query = """
            SELECT 
                DATE(timestamp) as log_date,
                SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END) as error_count
            FROM AuditLogs
            WHERE timestamp >= NOW() - INTERVAL 7 DAY
            GROUP BY DATE(timestamp)
            ORDER BY log_date ASC
        """
        cursor.execute(query)
        chart_data = cursor.fetchall()
        
        # Format for React
        formatted_data = []
        for row in chart_data:
            formatted_data.append({
                "date": row['log_date'].strftime("%b %d"), # e.g., "Jul 11"
                "success": int(row['success_count']),
                "error": int(row['error_count'])
            })
            
        return formatted_data
    finally:
        cursor.close()
        conn.close()

