"""An @approval tool: the run pauses until an admin resolves it in /approvals."""

from agno.agent import Agent

from db import db
from models import model
from tools.billing import issue_refund

agent = Agent(
    id="approval",
    name="Approval",
    description="Issues refunds. Every refund needs an admin's approval before it runs.",
    instructions=[
        "When asked for a refund, call issue_refund with the order id and amount.",
        "issue_refund only returns once an admin has decided. If it returned a result, the admin approved "
        "it and the refund was issued: confirm that to the user, quoting the result.",
        "If the call was rejected, tell the user an admin declined the refund.",
    ],
    model=model(),
    tools=[issue_refund],
    db=db,
    markdown=True,
    add_history_to_context=True,
)
