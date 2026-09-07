"""Server tools shown in the chat, plus a 20-second tool to test reload-while-running."""

from agno.agent import Agent

from db import db
from models import model
from tools.catalog import lookup_product, slow_task

agent = Agent(
    id="tools",
    name="Tools",
    description="Looks up products (SKU-1..3) and can run a slow 20s task.",
    instructions=[
        "Use lookup_product whenever a SKU is mentioned and quote the JSON you got back.",
        "When asked to run the slow task, call slow_task with the requested seconds (default 20).",
    ],
    model=model(),
    tools=[lookup_product, slow_task],
    db=db,
    markdown=True,
    add_history_to_context=True,
)
