"""Tools executed in the browser through the hook's `frontendTools` map."""

from agno.agent import Agent

from db import db
from models import model
from tools.browser import get_local_time, get_location

agent = Agent(
    id="browser",
    name="Browser",
    description="Asks the browser for the user's location and local time.",
    instructions=[
        "To answer anything about where the user is, call get_location.",
        "To answer anything about the current time, call get_local_time.",
        "Both tools run in the browser; wait for their result and then answer.",
    ],
    model=model(),
    tools=[get_location, get_local_time],
    db=db,
    markdown=True,
    add_history_to_context=True,
)
