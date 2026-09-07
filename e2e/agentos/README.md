# e2e/agentos — the deterministic AgentOS fixture

This is **not an example**. It is the [AgentOS](https://docs.agno.com) `3.0.6` server the SDK's
E2E suite runs against in CI. It uses a `ScriptedModel` (see `scripted_model.py`) instead of an LLM,
so every run is deterministic and needs no API key. For a real server with real agents, see
[`examples/demo-agentos`](../../examples/demo-agentos).

## Requirements

- [`uv`](https://docs.astral.sh/uv/) (Python package manager)
- Python 3.12 (uv will fetch it automatically if you don't have it)

## Run

    bun run agentos

or on a different port (port `7777` is often already taken):

    AGNO_PORT=7778 bun run agentos

The server listens on `127.0.0.1` and takes `AGNO_PORT` (default `7777`).

## What the scripted model does

`ScriptedModel` looks at the last user message (case-insensitive) and picks one of four scripts:

- **"ask"** -> calls `ask_user` with one question ("Where do you run?", options `Trail` / `Road`);
  the run pauses for user feedback (`user_feedback_schema`).
- **"locate"** -> calls `get_location`, an `external_execution=True` tool: the run pauses and the
  frontend supplies the result.
- **"tool"** -> calls `add_one(x=41)`, a `requires_confirmation=True` tool: the run pauses for
  confirmation (HITL).
- anything else -> answers `Echo: <message>`, streamed word by word.

A team leader always delegates to `test-agent` first (so the same triggers fire on the member), and
after any tool result the answer is `Done after tool.`

Registered ids: agent `test-agent`, team `test-team`, workflows `test-workflow` and
`test-workflow-hitl` (its single step `echo` carries `HumanReview(requires_confirmation=True)`, so
the workflow pauses on `step_requirements` before running).

## Run the E2E suite against it

    AGNO_URL=http://localhost:7778 bun run test:e2e
