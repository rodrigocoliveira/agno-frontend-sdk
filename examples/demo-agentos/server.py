"""Wires every demo agent, team and workflow into one AgentOS."""

from agno.os import AgentOS

import auth
import settings
from agents import approval, browser, chat, confirm, interview, tools
from db import db

agent_os = AgentOS(
    id="demo",
    name="agno-frontend-sdk demo",
    agents=[chat.agent, tools.agent, browser.agent, confirm.agent, interview.agent, approval.agent],
    db=db,
    authorization=True,
    authorization_config=auth.CONFIG,
    cors_allowed_origins=[settings.WEB_ORIGIN],
)
app = agent_os.get_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=settings.PORT)
