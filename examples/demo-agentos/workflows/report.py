"""Parallel steps and a conditional step: the step list shows entries that may not run."""

from agno.agent import Agent
from agno.workflow import Condition, Parallel, Step, Workflow

from db import db
from models import model


def analyst(id: str, focus: str) -> Agent:
    return Agent(id=id, name=id, instructions=[f"Given a company name, invent plausible {focus} for last quarter in 3 bullets."],
                 model=model(), db=db, markdown=True)


sales = analyst("report-sales", "sales figures")
costs = analyst("report-costs", "cost figures; end with the word 'loss' if costs exceeded sales")
alert = Agent(id="report-alert", name="Alert", instructions=["Write a two-line warning about the loss."], model=model(), db=db)
summary = Agent(id="report-summary", name="Summary", instructions=["Summarise everything above in one paragraph."], model=model(), db=db, markdown=True)

workflow = Workflow(
    id="report",
    name="Report",
    description="gather (sales ∥ costs) → check (alert only on 'loss') → summary.",
    db=db,
    steps=[
        Parallel(Step(name="sales", agent=sales), Step(name="costs", agent=costs), name="gather"),
        Condition(name="check", evaluator='previous_step_content.contains("loss")', steps=[Step(name="alert", agent=alert)]),
        Step(name="summary", agent=summary),
    ],
)
