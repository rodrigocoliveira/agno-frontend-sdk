import os

from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.os import AgentOS
from agno.team import Team
from agno.tools import tool
from agno.tools.user_feedback import UserFeedbackTools
from agno.workflow import Step, Workflow
from agno.workflow.types import HumanReview

from scripted_model import ScriptedModel


@tool(requires_confirmation=True)
def add_one(x: int) -> str:
    """Add one to x."""
    return str(x + 1)


@tool(external_execution=True)
def get_location() -> str:
    """Return the user's location. Executed by the frontend."""
    return ""


db = SqliteDb(db_file="tmp/agentos.db")
agent = Agent(
    id="test-agent", name="Test Agent", model=ScriptedModel(),
    tools=[add_one, get_location, UserFeedbackTools()], db=db, markdown=False,
)
team = Team(id="test-team", name="Test Team", model=ScriptedModel(), members=[agent], db=db)
workflow = Workflow(id="test-workflow", name="Test Workflow", db=db, steps=[Step(name="echo", agent=agent)])
workflow_hitl = Workflow(
    id="test-workflow-hitl", name="Test Workflow HITL", db=db,
    steps=[Step(name="echo", agent=agent, human_review=HumanReview(requires_confirmation=True, confirmation_message="Run echo?"))],
)
agent_os = AgentOS(id="spike", agents=[agent], teams=[team], workflows=[workflow, workflow_hitl], db=db)
app = agent_os.get_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("AGNO_PORT", "7777")))
