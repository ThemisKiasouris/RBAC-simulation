# a robust python service designed to run continuously in the background 
# (managed by systemd on an Ubuntu environment).

import subprocess
import time
import mysql.connector
import os

class Daemon:
    def __init__(self, db_config):
        self.db_config = db_config

    def db_connect(self):
        """Establish a connection to the MySQL database."""
        try:
            self.connection = mysql.connector.connect(**self.db_config)
            self.cursor = self.connection.cursor()
            print("Database connection established.")
        except mysql.connector.Error as err:
            print(f"Error: {err}")
            self.connection = None
            self.cursor = None
    
    def user_exists(self, username):
        """Check if a user exists in the database."""
        result = subprocess.run(['id', '-u', username], output=True, text=True)
        return result.returncode == 0

    def reconcile_users(self):
        """Compares the database blueprint against the live OS and fixes drift."""
        print("Starting user reconciliation cycle...")
        conn = self.get_db_connection()
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
                
                # Execute the fix
                subprocess.run(cmd, check=True)
                print(f"Success: '{username}' created.")

            # Scenario 2: User is revoked in DB, but still on the system (Drift: Unauthorized access)
            elif expected_state == 'absent' and is_present:
                print(f"Drift detected: Removing revoked user '{username}'")
                # -r removes their home directory as well
                subprocess.run(['userdel', '-r', username], check=True) 
                print(f"Success: '{username}' removed.")
                
        cursor.close()
        conn.close()


    def get_crontab(self, system_user):
        """Fetches the current crontab for a specific user."""
        # 'crontab -l' lists the current cron jobs
        result = subprocess.run(['crontab', '-l', '-u', system_user], capture_output=True, text=True)
        # If the user has no crontab, it returns an error code, so we just return an empty string
        if result.returncode != 0:
            return ""
        return result.stdout
    
    def set_crontab(self, system_user, cron_content):
        """Overwrites the user's crontab with new content."""
        # Piping the new string directly into crontab via standard input
        subprocess.run(['crontab', '-u', system_user, '-'], input=cron_content, text=True, check=True)
    
    def reconcile_tasks(self):
        """Compares the database blueprint against the live OS and fixes drift for tasks."""
        print("Starting task reconciliation cycle...")
        conn = self.get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        # Fetch the master blueprint for tasks
        cursor.execute("SELECT task_name, expected_state FROM SystemTasks")
        desired_tasks = cursor.fetchall()
        
        for task in desired_tasks:
            task_name = task['task_name']
            run_as = task['run_as_user']
            expected_state = task['expected_state']

            # The exact string we expect to see in the Linux crontab
            cron_line = f"{task['cron_expression']} {task['command_to_run']} # MANAGED BY DAEMON: {task_name}"


            # Check if the task is present in the user's crontab
            current_crontab = self.get_crontab(run_as)
            is_present = cron_line in current_crontab

            # Scenario 1: Task should exist, but doesn't (Drift: Missing)
            if expected_state == 'present' and not is_present:
                print(f"Drift detected: Creating missing task '{task_name}'")
                new_crontab = current_crontab + f"\n{cron_line}\n"
                self.set_crontab(run_as, new_crontab)
                print(f"Success: '{task_name}' created.")

            # Scenario 2: Task is revoked in DB, but still on the system (Drift: Unauthorized access)
            elif expected_state == 'absent' and is_present:
                print(f"Drift detected: Removing revoked task '{task_name}'")

                # Filter out the specific line using a quick list comprehension
                cleaned_crontab = "\n".join(line for line in current_crontab.splitlines() if task_name not in line)
                new_crontab = "\n".join(cleaned_lines) + "\n"

                self.set_crontab(run_as, new_crontab)
                print(f"Success: '{task_name}' removed.")

        cursor.close()
        conn.close()

    def run_forever(self, interval=60) :
        """Run the reconciliation process indefinitely at specified intervals."""
        while True:
            try:
                self.reconcile_users()
                self.reconcile_tasks()
            except Exception as e:
                print(f"Error during reconciliation: {e}")

            time.sleep(interval)

if __name__ == "__main__":
    load_dotnev()   # Load environment variables from .env file

    db_config = {
        "host": os.getenv("DB_HOST", "localhost"), # Fallback to localhost if missing
        "user": os.getenv("DB_USER"),
        "password": os.getenv("DB_PASSWORD"),
        "database": os.getenv("DB_NAME")
    }

    # safety check before starting the infinite loop
    if not all([db_settings['user'], db_settings['password'], db_settings['database']]):
        print("CRITICAL ERROR: Missing database credentials in .env file.")
        exit(1)
        
    print("Initializing Infrastructure Daemon...")

    daemon = Processor(db_config)
    daemon.run_forever(interval=300) # Runs every 5 minutes
