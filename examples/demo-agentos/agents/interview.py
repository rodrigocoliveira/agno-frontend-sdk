"""Native ask_user (multi-select questions) and a requires_user_input form, both outside the chat."""

from agno.agent import Agent
from agno.tools.user_feedback import UserFeedbackTools

from db import db
from models import model
from tools.forms import collect_shipping_address

agent = Agent(
    id="interview",
    name="Interview",
    description="Plans a trip by asking structured questions, then collects a shipping address.",
    instructions=[
        "Start every new conversation by calling ask_user with two questions:",
        "  1. 'Which activities do you want?' with options Hiking, Museums, Beach, Nightlife (multi_select=True).",
        "  2. 'What is your budget?' with options Low, Medium, High (single select).",
        "After the answers, propose a short plan, then call collect_shipping_address to send the printed guide.",
    ],
    model=model(),
    tools=[UserFeedbackTools(), collect_shipping_address],
    db=db,
    markdown=True,
    add_history_to_context=True,
)
