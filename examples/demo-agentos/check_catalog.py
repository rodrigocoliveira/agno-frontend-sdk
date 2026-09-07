"""Prints the ids AgentOS actually registered, as JSON, for scripts/check-demo-catalog.ts to
compare against demo-react's catalog.ts. Introspects the real `AgentOS` object exactly like the
CI import-check step does, rather than parsing server.py with regex."""

import json

import server

print(
    json.dumps(
        {
            "agent": [a.id for a in server.agent_os.agents],
            "team": [t.id for t in server.agent_os.teams],
            "workflow": [w.id for w in server.agent_os.workflows],
        }
    )
)
