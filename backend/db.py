import os
import mysql.connector
from mysql.connector import Error
from dotenv import load_dotenv


load_dotenv()


def get_db_config():
    """Return the database configuration from environment variables."""
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "user": os.getenv("DB_USER"),
        "password": os.getenv("DB_PASSWORD"),
        "database": os.getenv("DB_NAME"),
    }


def get_db_connection(config=None):
    """Establish and return a connection to the MySQL database."""
    db_config = config or get_db_config()

    try:
        return mysql.connector.connect(**db_config)
    except Error as e:
        print(f"Database Connection Error: {e}")
        return None
