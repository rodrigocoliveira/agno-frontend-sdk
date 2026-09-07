"""Every member runs in parallel; the leader asks the user a question before concluding."""

from agno.agent import Agent
from agno.team import Team
from agno.tools.user_feedback import UserFeedbackTools

from db import db
from models import model

web = Agent(
    id="research-web", name="Web", role="Writes a short qualitative overview of the topic.",
    model=model(), db=db,
)
numbers = Agent(
    id="research-numbers", name="Numbers", role="Lists 3 to 5 quantitative facts about the topic.",
    model=model(), db=db,
)

team = Team(
    id="research",
    name="Research",
    description="Two researchers work in parallel; the leader asks how deep to go.",
    instructions=[
        "First call ask_user with one question: 'How detailed should the report be?' "
        "options Brief, Standard, Deep (single select).",
        "Then send the topic to all members and merge their answers at the chosen depth.",
    ],
    members=[web, numbers],
    delegate_to_all_members=True,
    tools=[UserFeedbackTools()],
    model=model(),
    db=db,
    markdown=True,
    store_member_responses=True,
)
