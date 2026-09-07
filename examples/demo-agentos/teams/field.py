"""A member's browser tool: the external-execution requirement travels up through the team."""

from agno.agent import Agent
from agno.team import Team

from db import db
from models import model
from tools.browser import get_location

scout = Agent(
    id="field-scout", name="Scout", role="Finds out where the user is and describes the area.",
    instructions=["Always call get_location first; it runs in the user's browser."],
    model=model(), tools=[get_location], db=db,
)

team = Team(
    id="field",
    name="Field",
    description="Delegates to a scout that needs the user's location from the browser.",
    instructions=["For any question about the user's surroundings, delegate to Scout."],
    members=[scout],
    model=model(),
    db=db,
    markdown=True,
    store_member_responses=True,
)
