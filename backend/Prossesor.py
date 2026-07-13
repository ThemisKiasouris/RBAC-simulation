# a robust python service designed to run continuously in the background 
# (managed by systemd on an Ubuntu environment).

import subprocess
import time
import mysql.connector
import os
from dotenv import load_dotenv

from db import get_db_connection, get_db_config

class Daemon:
    def __init__(self, db_config):
        self.db_config = db_config

    def get_db_connection(self):
        """Establish a fresh connection to the MySQL database."""
        return get_db_connection(self.db_config)
    
    def user_exists(self, username):
        """Check if a user exists in the database."""
        result = subprocess.run(['id', '-u', username], capture_output=True, text=True)
        return result.returncode == 0

    def reconcile_users(self):
        """Compares the database blueprint against the live OS and fixes drift."""
        print("Starting user reconciliation cycle...")
        conn = self.get_db_connection()
        if not conn:
            return
            
        cursor = conn.cursor(dictionary=True)
        
        # Fetch the master blueprint
        cursor.execute("SELECT username, primary_group, has_sudo, shell_path, expected_state FROM SystemUsers")
        desired_users = cursor.fetchall()
        
        for user in desired_users:
            username = user['username']
            expected_state = user['expected_state']
            is_present = self.user_exists(username)

            # Scenario 1: User should exist, but doesn't (Drift: Missing)
            if expected_state == 'present' and not is_present:
                print(f"Drift detected: Creating missing user '{username}'")
                
                # Constructing the exact bash command
                cmd = ['useradd', '-m', '-g', user['primary_group'], '-s', user['shell_path']]
                if user['has_sudo']:
                    cmd.extend(['-G', 'sudo'])
                cmd.append(username)
                cmd_string = " ".join(cmd)
                
                try:
                    # Run it ONLY ONCE here, and capture the output properly
                    subprocess.run(cmd, check=True, capture_output=True, text=True)
                    print(f"Success: '{username}' created.")
                    self.log_action('USER_CREATE', username, cmd_string, 'SUCCESS')
                except subprocess.CalledProcessError as e:
                    print(f"Error creating user '{username}': {e.stderr}")
                    self.log_action('USER_CREATE', username, cmd_string, f'FAILURE: {e.stderr}')

            # Scenario 2: User is revoked in DB, but still on the system (Drift: Unauthorized access)
            elif expected_state == 'absent' and is_present:
                print(f"Drift detected: Removing revoked user '{username}'")
                try:
                    # -r removes their home directory as well
                    subprocess.run(['userdel', '-r', username], check=True, capture_output=True, text=True) 
                    print(f"Success: '{username}' removed.")
                    self.log_action('USER_DELETE', username, f"userdel -r {username}", 'SUCCESS')
                except subprocess.CalledProcessError as e:
                    print(f"Error removing user '{username}': {e.stderr}")
                    self.log_action('USER_DELETE', username, f"userdel -r {username}", f'FAILURE: {e.stderr}')
                
        cursor.close()
        conn.close()

    def get_crontab(self, system_user):
        """Fetches the current crontab for a specific user."""
        result = subprocess.run(['crontab', '-l', '-u', system_user], capture_output=True, text=True)
        if result.returncode != 0:
            return ""
        return result.stdout
    
    def set_crontab(self, system_user, cron_content):
        """Overwrites the user's crontab with new content."""
        subprocess.run(['crontab', '-u', system_user, '-'], input=cron_content, text=True, check=True)
    
    def reconcile_tasks(self):
        """Compares the database blueprint against the live OS and fixes drift for tasks."""
        print("Starting task reconciliation cycle...")
        conn = self.get_db_connection()
        if not conn:
            return
            
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT task_name, cron_expression, command_to_run, run_as_user, expected_state FROM ScheduledTasks")
        desired_tasks = cursor.fetchall()
        
        for task in desired_tasks:
            task_name = task['task_name']
            run_as = task['run_as_user']
            expected_state = task['expected_state']

            cron_line = f"{task['cron_expression']} {task['command_to_run']} # MANAGED BY DAEMON: {task_name}"
            current_crontab = self.get_crontab(run_as)
            is_present = cron_line in current_crontab

            # Scenario 1: Task should exist, but doesn't (Drift: Missing)
            if expected_state == 'present' and not is_present:
                print(f"Drift detected: Creating missing task '{task_name}'")
                try:
                    new_crontab = current_crontab + f"\n{cron_line}\n"
                    self.set_crontab(run_as, new_crontab)
                    print(f"Success: '{task_name}' scheduled.")
                    self.log_action('CRON_CREATE', task_name, f"Assigned to: {run_as}", 'SUCCESS')
                except Exception as e:
                    print(f"Error creating task '{task_name}': {e}")
                    self.log_action('CRON_CREATE', task_name, str(e), 'ERROR')

            # Scenario 2: Task is revoked in DB, but still on the system (Drift: Unauthorized access)
            elif expected_state == 'absent' and is_present:
                print(f"Drift detected: Removing revoked task '{task_name}'")
                try:
                    cleaned_crontab = "\n".join(line for line in current_crontab.splitlines() if task_name not in line)
                    new_crontab = cleaned_crontab + "\n"
                    self.set_crontab(run_as, new_crontab)
                    print(f"Success: '{task_name}' removed.")
                    self.log_action('CRON_DELETE', task_name, f"Removed from: {run_as}", 'SUCCESS')
                except Exception as e:
                    print(f"Error removing task '{task_name}': {e}")
                    self.log_action('CRON_DELETE', task_name, str(e), 'ERROR')

        cursor.close()
        conn.close()

    def log_action(self, action_type, target_entity, details, status):
        """Action record"""
        conn = self.get_db_connection()
        if not conn:
            print("Failed to log action: Database connection could not be established.")
            return
        
        cursor = None
        try:
            cursor = conn.cursor()
            query = """ INSERT INTO AuditLogs (action_type, target_entity, details, status)
                        VALUES (%s, %s, %s, %s)"""
            cursor.execute(query, (action_type, target_entity, details, status))            
            conn.commit()
        except mysql.connector.Error as err:
            print(f"Database Logging Error: {err}")
        finally:
            if cursor:
                cursor.close()
            conn.close() 

    def run_forever(self, interval=60):
        """Run the reconciliation process indefinitely at specified intervals."""
        while True:
            try:
                self.reconcile_users()
                self.reconcile_tasks()
            except Exception as e:
                print(f"Error during reconciliation: {e}")

            time.sleep(interval)

if __name__ == "__main__":
    load_dotenv()   # Load environment variables from .env file

    db_config = get_db_config()

    # safety check before starting the infinite loop
    if not all([db_config['user'], db_config['password'], db_config['database']]):
        print("CRITICAL ERROR: Missing database credentials in .env file.")
        exit(1)
        
    print("Initializing Infrastructure Daemon...")

    daemon = Daemon(db_config)
    daemon.run_forever(interval=100) # Set to 1 minute for easier testing