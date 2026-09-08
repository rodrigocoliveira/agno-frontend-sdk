"""An @approval tool: the run pauses until an admin resolves it in /approvals."""

from agno.agent import Agent

from db import db
from models import model
from tools.billing import issue_refund

agent = Agent(
    id="approval",
    name="Approval",
    description="Issues refunds, which an admin must approve first.",
    instructions=[
        "When asked for a refund, call issue_refund with the order id and amount.",
        "Tell the user the refund is waiting for approval when the tool is blocked.",
    ],
    model=model(),
    tools=[issue_refund],
    db=db,
    markdown=True,
    add_history_to_context=True,
)
