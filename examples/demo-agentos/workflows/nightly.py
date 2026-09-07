"""Three slow steps: close the tab mid-run, reopen the session, and watch the steps finish."""

from agno.agent import Agent
from agno.workflow import Step, Workflow

from db import db
from models import model
from tools.catalog import slow_task

worker = Agent(
    id="nightly-worker", name="Worker",
    instructions=["Call slow_task with seconds=15, then say which stage finished in one line."],
    tools=[slow_task], model=model(), db=db,
)

workflow = Workflow(
    id="nightly",
    name="Nightly",
    description="Three 15-second steps, to test reconnecting to a background run.",
    db=db,
    steps=[Step(name="extract", agent=worker), Step(name="transform", agent=worker), Step(name="load", agent=worker)],
)
