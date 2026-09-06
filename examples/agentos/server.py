import os

from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.os import AgentOS
from agno.team import Team
from agno.tools import tool
from agno.workflow import Step, Workflow

from scripted_model import ScriptedModel


@tool(requires_confirmation=True)
def add_one(x: int) -> str:
    """Add one to x."""
    return str(x + 1)


db = SqliteDb(db_file="tmp/agentos.db")
agent = Agent(id="test-agent", name="Test Agent", model=ScriptedModel(), tools=[add_one], db=db, markdown=False)
team = Team(id="test-team", name="Test Team", model=ScriptedModel(), members=[agent], db=db)
workflow = Workflow(id="test-workflow", name="Test Workflow", db=db, steps=[Step(name="echo", agent=agent)])
agent_os = AgentOS(id="spike", agents=[agent], teams=[team], workflows=[workflow], db=db)
app = agent_os.get_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("AGNO_PORT", "7777")))
