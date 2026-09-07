"""Plain chat: streaming, markdown, file attachments, cancel and per-run metrics."""

from agno.agent import Agent

from db import db
from models import model

agent = Agent(
    id="chat",
    name="Chat",
    description="A general assistant. Send text, images or PDFs.",
    instructions=[
        "Answer in well-structured markdown: a short title, then paragraphs or bullet lists.",
        "When the user attaches a file, describe what you see in it before answering.",
    ],
    model=model(),
    db=db,
    markdown=True,
    add_history_to_context=True,
)
