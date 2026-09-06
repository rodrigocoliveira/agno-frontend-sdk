# agentos-example

A minimal [AgentOS](https://docs.agno.com) `3.0.6` server used to run the SDK's E2E suite
without any API key. It uses a `ScriptedModel` (see `scripted_model.py`) instead of a real
LLM provider, so the whole suite runs deterministically and offline.

## Requirements

- [`uv`](https://docs.astral.sh/uv/) (Python package manager)
- Python 3.12 (uv will fetch it automatically if you don't have it)

## Run

    bun run agentos

or on a different port (port `7777` is often already taken):

    AGNO_PORT=7778 bun run agentos

The server listens on `127.0.0.1` and takes `AGNO_PORT` (default `7777`).

## What the scripted model does

`ScriptedModel` looks at the last user message:

- if it contains the word **"tool"**, it calls a tool (the leader agent delegates to
  `test-agent`, which then calls `add_one`, a `requires_confirmation=True` tool) and the run
  pauses for confirmation (HITL).
- otherwise, it just echoes back `Echo: <message>`, streamed word by word.

Registered ids: agent `test-agent`, team `test-team`, workflow `test-workflow`.

## Run the E2E suite against it

    AGNO_URL=http://localhost:7778 bun run test:e2e
