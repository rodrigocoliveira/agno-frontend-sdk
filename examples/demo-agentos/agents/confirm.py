"""A requires_confirmation tool: the run pauses until the user confirms or rejects."""

from agno.agent import Agent

from db import db
from models import model
from tools.billing import send_invoice

agent = Agent(
    id="confirm",
    name="Confirm",
    description="Sends invoices, but only after you confirm.",
    instructions=[
        "When asked to invoice someone, call send_invoice with the customer and amount.",
        "If the user rejects, apologise briefly and do not retry.",
    ],
    model=model(),
    tools=[send_invoice],
    db=db,
    markdown=True,
    add_history_to_context=True,
)
