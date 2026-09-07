"""Two pause kinds in one run: the draft agent asks the user (executor), then a human reviews (step)."""

from agno.agent import Agent
from agno.tools.user_feedback import UserFeedbackTools
from agno.workflow import Step, Workflow
from agno.workflow.types import HumanReview

from db import db
from models import model

drafter = Agent(
    id="publish-drafter", name="Drafter",
    instructions=[
        "Before writing, call ask_user with one question: 'Who is the audience?' "
        "options Developers, Executives, General public (single select).",
        "Then write a 3-paragraph article on the given topic for that audience.",
    ],
    tools=[UserFeedbackTools()], model=model(), db=db, markdown=True,
)
editor = Agent(
    id="publish-editor", name="Editor",
    instructions=["Tighten the draft you receive. Keep its structure. Return only the edited text."],
    model=model(), db=db, markdown=True,
)
publisher = Agent(
    id="publish-publisher", name="Publisher",
    instructions=["Return the text prefixed with a one-line title and 'Published:' plus today's date."],
    model=model(), db=db, markdown=True,
)

workflow = Workflow(
    id="publish",
    name="Publish",
    description="Draft (asks the audience) → review (human confirmation) → publish.",
    db=db,
    steps=[
        Step(name="draft", agent=drafter),
        Step(
            name="review",
            agent=editor,
            human_review=HumanReview(requires_confirmation=True, confirmation_message="Send the draft to the editor?"),
        ),
        Step(name="publish", agent=publisher),
    ],
)
