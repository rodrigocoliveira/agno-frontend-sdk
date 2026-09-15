"""Manual + agent-driven session_state edits, live side by side: add_item/remove_item write the
same `session_state["items"]` list the frontend's +/- buttons edit directly with mergeSessionState."""

from agno.agent import Agent

from db import db
from models import model
from tools.shopping import add_item, remove_item

agent = Agent(
    id="shopping",
    name="Shopping List",
    description="Keeps a shopping list in session_state — add or remove items by name.",
    instructions=[
        "Manage the shopping list with add_item and remove_item, using the item's plain name (no ids).",
        "After a change, confirm briefly what changed — don't restate the whole list unless asked.",
    ],
    model=model(),
    tools=[add_item, remove_item],
    db=db,
    markdown=True,
    add_history_to_context=True,
)
