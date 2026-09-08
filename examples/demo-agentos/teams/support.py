"""Leader delegates to members; a member's requires_confirmation tool pauses the whole team."""

from agno.agent import Agent
from agno.team import Team

from db import db
from models import model
from tools.billing import send_invoice

triage = Agent(
    id="support-triage", name="Triage", role="Classifies the request and answers general questions.",
    model=model(), db=db,
)
billing = Agent(
    id="support-billing", name="Billing", role="Handles anything about invoices and payments.",
    instructions=["To invoice a customer call send_invoice; the user confirms it."],
    model=model(), tools=[send_invoice], db=db,
)

team = Team(
    id="support",
    name="Support",
    description="A support desk: triage first, billing when money is involved.",
    instructions=[
        "Delegate general questions to Triage and anything about invoices to Billing.",
        "Summarise the member's answer for the user.",
    ],
    members=[triage, billing],
    model=model(),
    db=db,
    markdown=True,
    store_member_responses=True,
)
