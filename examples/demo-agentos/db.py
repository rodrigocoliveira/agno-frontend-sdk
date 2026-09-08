"""One SQLite database shared by every agent, team and workflow. Delete tmp/demo.db to reset."""

from agno.db.sqlite import SqliteDb

db = SqliteDb(db_file="tmp/demo.db")
