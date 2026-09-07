# Demo (`demo-agentos` + `demo-react`) e `guide/` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the scripted AgentOS to `e2e/agentos`, build a real-LLM demo server (`examples/demo-agentos`), a clean React showcase (`examples/demo-react`) and a user-facing `guide/`, so the SDK can be released with a convincing example and documentation.

**Architecture:** The demo server is one Python module per agent/team/workflow wired together by `server.py`, with a `model()` factory (OpenAI or Ollama), HS256 JWT auth with per-user isolation, and a `tokens.py` that prints admin/user tokens. The React app discovers agents/teams/workflows through the API, keeps endpoint + tokens in `localStorage`, and renders every session through one `RunShell` (session list, pending panel, run list, composer); pages are thin wrappers around `useAgnoAgent/Team/Workflow`. The guide is plain markdown whose code blocks are copied from the demo.

**Tech Stack:** Bun 1.3.9 workspaces, TS 5.9 strict, Vite 6, React 19, react-router 7, Tailwind 4 (`@tailwindcss/vite`, `@tailwindcss/typography`), lucide-react, react-markdown; Python 3.12 + `uv`, `agno==3.0.6`, PyJWT.

**Spec:** `docs/superpowers/specs/2026-09-07-demo-and-guide-design.md`

## Global Constraints

- No new features in `packages/*`. A gap found by the demo becomes an issue (or a separate fix PR if it is a bug). Never patch the lib inside a demo task.
- Clean and clear code above everything: one responsibility per file; `examples/demo-react/src/pages/*` ≤ ~40 lines each; no component above ~150 lines; each server module in `agents/`, `teams/`, `workflows/` ≤ ~60 lines with a one-sentence module docstring saying what it demonstrates.
- The React app re-wraps nothing from the lib: it consumes `hook.runs`, `hook.pending`, `hook.send`, `hook.continue`, `hook.resolveTool`, `hook.runTools`, `hook.resume`, `hook.cancel` and imports `isToolPending`, `confirm`, `reject`, `provideUserInput`, `provideUserFeedback` from `@rodrigocoliveira/agno-hooks`.
- No UI component library. Tailwind utilities + the six primitives in `src/ui/`.
- Server modules never read `os.environ` directly; everything goes through `settings.py`.
- Auth facts (verified in `agno==3.0.6`): `AgentOS(authorization=True, authorization_config=AuthorizationConfig(verification_keys=[secret], algorithm="HS256", user_isolation=True))`; claims `sub` → user id, `scopes` → RBAC; admin scope `agent_os:admin`; approvals resolve is admin-only; non-admins must send `session_id` on continue/resume (form) and cancel (query) — the lib already does.
- Port 7777 on the developer machine may be used by another process: every local verification in this plan uses `AGNO_PORT=7778` for `e2e/agentos` and `AGNO_PORT=7780` for `demo-agentos`. Never kill a process on 7777.
- The E2E suite (`bun run test:e2e`) keeps running only against `e2e/agentos`. Nothing in this plan adds LLM-backed tests.
- Commit messages follow the repo style (`feat(demo): …`, `docs(guide): …`, `chore: …`) and end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Spec adjustment (ruled while planning): the lib's `StepRun` is a flat list (`packages/agno-hooks/src/types.ts`), so `StepList` renders workflow steps flat, in `index` order, with `Parallel`/`Condition` children appearing as their own entries. No indentation.

---

### Task 1: Move the scripted server to `e2e/agentos`, drop `examples/react`

**Files:**
- Move: `examples/agentos/` → `e2e/agentos/` (all tracked files)
- Delete: `examples/react/` (whole directory, including the committed `dist/`)
- Modify: `package.json` (root), `.gitignore`, `.github/workflows/ci.yml`, `README.md`, `e2e/agentos/package.json`, `e2e/agentos/pyproject.toml`, `e2e/agentos/README.md`, `packages/agno-api/test/e2e/README.md`, `packages/agno-hooks/test/e2e/README.md`

**Interfaces:**
- Produces: root scripts `agentos` (starts `e2e/agentos`), `test:e2e` unchanged; workspace glob `e2e/*`.

- [ ] **Step 1: Move and delete**

```bash
git mv examples/agentos e2e/agentos
git rm -r -q examples/react
rm -rf e2e/agentos/__pycache__
```

- [ ] **Step 2: Rename the fixture package**

`e2e/agentos/package.json`:
```json
{
  "name": "agentos-e2e",
  "private": true,
  "scripts": {
    "dev": "uv run --python 3.12 python server.py"
  }
}
```

`e2e/agentos/pyproject.toml`: change `name = "agentos-example"` to `name = "agentos-e2e"`. Then run `cd e2e/agentos && uv lock` so `uv.lock` matches the new name.

Replace the first two paragraphs of `e2e/agentos/README.md` with:

```markdown
# e2e/agentos — the deterministic AgentOS fixture

This is **not an example**. It is the [AgentOS](https://docs.agno.com) `3.0.6` server the SDK's
E2E suite runs against in CI. It uses a `ScriptedModel` (see `scripted_model.py`) instead of an LLM,
so every run is deterministic and needs no API key. For a real server with real agents, see
[`examples/demo-agentos`](../../examples/demo-agentos).
```

Keep the rest of the README as is.

- [ ] **Step 3: Root package.json, gitignore**

`package.json` (root): set `"workspaces": ["packages/*", "examples/*", "e2e/*"]`; replace the two scripts:
```json
    "agentos": "bun run --filter agentos-e2e dev",
```
and delete the `"example"` line (the demo scripts arrive in Task 5).

`.gitignore`:
```
reference/
node_modules/
dist/
__pycache__/
.venv/
e2e/agentos/tmp/
examples/demo-agentos/tmp/
```

- [ ] **Step 4: CI and docs paths**

`.github/workflows/ci.yml`: replace `cd examples/agentos` with `cd e2e/agentos`; delete the line `- run: bun run --filter react-example build` (Task 10 adds the demo build).

`README.md` (root): replace the "Examples:" line and the bash block with:
```markdown
E2E fixture: [`e2e/agentos`](e2e/agentos) (zero-key scripted server used by CI).

```bash
bun install
AGNO_PORT=7778 bun run agentos                       # terminal 1
AGNO_URL=http://localhost:7778 bun run test:e2e      # terminal 2
```
```

`packages/agno-api/test/e2e/README.md`: replace both `examples/agentos` with `e2e/agentos`. `packages/agno-hooks/test/e2e/README.md`: same.

- [ ] **Step 5: Verify**

```bash
bun install
grep -rn "examples/agentos\|examples/react\|react-example\|agentos-example" --include='*.md' --include='*.json' --include='*.yml' . | grep -v -E 'node_modules|reference/|docs/superpowers|uv.lock'
```
Expected: `bun install` updates `bun.lock` without error; the grep prints nothing.

Start the fixture and run the suite:
```bash
rm -f e2e/agentos/tmp/agentos.db
(cd e2e/agentos && AGNO_PORT=7778 uv run --python 3.12 python server.py &) ; sleep 8; curl -sf localhost:7778/health
bun run build && AGNO_URL=http://localhost:7778 bun run test:e2e
pkill -f 'python server.py'
```
Expected: health returns JSON; E2E reports all tests passing (22 at the time of writing).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: move the scripted AgentOS to e2e/agentos and drop examples/react

The scripted server is a CI fixture, not an example. The old bench UI is
replaced by examples/demo-react in the following commits.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `demo-agentos` core — settings, model, auth, tokens, first agent

**Files:**
- Create: `examples/demo-agentos/{package.json,pyproject.toml,README.md,settings.py,models.py,db.py,auth.py,tokens.py,server.py,.gitignore}`
- Create: `examples/demo-agentos/tools/__init__.py`, `examples/demo-agentos/agents/__init__.py`, `examples/demo-agentos/teams/__init__.py`, `examples/demo-agentos/workflows/__init__.py` (empty files)
- Create: `examples/demo-agentos/agents/chat.py`

**Interfaces:**
- Produces: `settings.PORT/OPENAI_API_KEY/OPENAI_MODEL/OLLAMA_MODEL/JWT_SECRET/WEB_ORIGIN`; `models.model() -> Model`; `db.db: SqliteDb`; `auth.CONFIG: AuthorizationConfig`, `auth.PROFILES: dict[str, dict]`; `server.agent_os`, `server.app`.

- [ ] **Step 1: Package files**

`examples/demo-agentos/package.json`:
```json
{
  "name": "demo-agentos",
  "private": true,
  "scripts": {
    "dev": "uv run --python 3.12 python server.py",
    "tokens": "uv run --python 3.12 python tokens.py"
  }
}
```

`examples/demo-agentos/pyproject.toml`:
```toml
[project]
name = "demo-agentos"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "agno==3.0.6",
  "fastapi",
  "uvicorn",
  "python-multipart",
  "sqlalchemy",
  "pyjwt",
  "openai",
  "ollama",
]

[tool.uv]
package = false
```

`examples/demo-agentos/.gitignore`:
```
tmp/
.venv/
__pycache__/
```

Run `cd examples/demo-agentos && uv lock` to create `uv.lock` (commit it).

- [ ] **Step 2: settings, models, db**

`examples/demo-agentos/settings.py`:
```python
"""Every environment variable the demo reads, in one place."""

import os

PORT = int(os.environ.get("AGNO_PORT", "7777"))
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1")
JWT_SECRET = os.environ.get("JWT_SECRET", "demo-secret-change-me")
WEB_ORIGIN = os.environ.get("WEB_ORIGIN", "http://localhost:5173")
```

`examples/demo-agentos/models.py`:
```python
"""Picks the LLM: OpenAI when a key is present, a local Ollama model otherwise."""

from agno.models.base import Model
from agno.models.ollama import Ollama
from agno.models.openai import OpenAIChat

import settings


def model() -> Model:
    if settings.OPENAI_API_KEY:
        return OpenAIChat(id=settings.OPENAI_MODEL)
    return Ollama(id=settings.OLLAMA_MODEL)
```

`examples/demo-agentos/db.py`:
```python
"""One SQLite database shared by every agent, team and workflow. Delete tmp/demo.db to reset."""

from agno.db.sqlite import SqliteDb

db = SqliteDb(db_file="tmp/demo.db")
```

- [ ] **Step 3: auth and tokens**

`examples/demo-agentos/auth.py`:
```python
"""JWT setup: HS256 with a shared dev secret, per-user isolation, three token profiles."""

from agno.os.config import AuthorizationConfig

import settings

CONFIG = AuthorizationConfig(
    verification_keys=[settings.JWT_SECRET],
    algorithm="HS256",
    user_isolation=True,
)

# Enough to use every page of demo-react except resolving approvals (admin only).
USER_SCOPES = [
    "config:read",
    "agents:read", "agents:run",
    "teams:read", "teams:run",
    "workflows:read", "workflows:run",
    "sessions:read", "sessions:write",
    "approvals:read",
]

PROFILES = {
    "admin": {"sub": "admin", "scopes": ["agent_os:admin"]},
    "user-1": {"sub": "user-1", "scopes": USER_SCOPES},
    "user-2": {"sub": "user-2", "scopes": USER_SCOPES},
}
```

`examples/demo-agentos/tokens.py`:
```python
"""Prints one JWT per profile as JSON. Paste the output into demo-react → Settings → Import."""

import json
import time

import jwt

import auth
import settings

THIRTY_DAYS = 30 * 24 * 60 * 60


def make_token(claims: dict) -> str:
    now = int(time.time())
    return jwt.encode({**claims, "iat": now, "exp": now + THIRTY_DAYS}, settings.JWT_SECRET, algorithm="HS256")


if __name__ == "__main__":
    print(json.dumps({label: make_token(claims) for label, claims in auth.PROFILES.items()}, indent=2))
```

- [ ] **Step 4: first agent and server**

`examples/demo-agentos/agents/chat.py`:
```python
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
```

`examples/demo-agentos/server.py` (grows in Tasks 3 and 4):
```python
"""Wires every demo agent, team and workflow into one AgentOS."""

from agno.os import AgentOS

import auth
import settings
from agents import chat
from db import db

agent_os = AgentOS(
    id="demo",
    name="agno-frontend-sdk demo",
    agents=[chat.agent],
    db=db,
    authorization=True,
    authorization_config=auth.CONFIG,
    cors_allowed_origins=[settings.WEB_ORIGIN],
)
app = agent_os.get_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=settings.PORT)
```

- [ ] **Step 5: Verify import, tokens, auth**

```bash
cd examples/demo-agentos
uv run --python 3.12 python -c "import server; print(sorted(a.id for a in server.agent_os.agents))"
uv run --python 3.12 python tokens.py > /tmp/demo-tokens.json && python3 -c "import json;d=json.load(open('/tmp/demo-tokens.json'));assert set(d)=={'admin','user-1','user-2'};print('tokens ok')"
```
Expected: `['chat']` and `tokens ok` (no API key needed: `model()` falls back to `Ollama`, which does not connect at construction).

Run the server and check the auth gate:
```bash
(AGNO_PORT=7780 uv run --python 3.12 python server.py &) ; sleep 8
curl -s -o /dev/null -w "%{http_code}\n" localhost:7780/agents                                    # expect 401
T=$(python3 -c "import json;print(json.load(open('/tmp/demo-tokens.json'))['user-1'])")
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $T" localhost:7780/agents        # expect 200
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $T" -X POST localhost:7780/approvals/x/resolve -H 'content-type: application/json' -d '{"status":"approved"}'   # expect 403 (non-admin)
pkill -f 'python server.py'
```

- [ ] **Step 6: README (first version)**

`examples/demo-agentos/README.md`:
```markdown
# examples/demo-agentos

A real [AgentOS](https://docs.agno.com) `3.0.6` with agents, teams and workflows that exercise
every feature of `@rodrigocoliveira/agno-hooks`. Pair it with [`examples/demo-react`](../demo-react).

## Run

```bash
cd examples/demo-agentos
uv sync
OPENAI_API_KEY=sk-... uv run python server.py     # OpenAI
# or, with no key, a local Ollama model (needs tool calling: llama3.1, qwen2.5, ...)
ollama pull llama3.1 && uv run python server.py
```

Then print the tokens and import them in the web app (Settings → Import):

```bash
uv run python tokens.py
```

| env | default | what |
|---|---|---|
| `AGNO_PORT` | `7777` | port |
| `OPENAI_API_KEY` | – | when set, OpenAI is used |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model id |
| `OLLAMA_MODEL` | `llama3.1` | Ollama model id (used when no OpenAI key) |
| `JWT_SECRET` | `demo-secret-change-me` | HS256 secret shared by `server.py` and `tokens.py` |
| `WEB_ORIGIN` | `http://localhost:5173` | CORS origin of demo-react |

Auth is JWT (HS256) with per-user isolation: `admin` sees everything and resolves approvals;
`user-1` and `user-2` only see their own sessions. In production you would use RS256 with a JWKS,
see `agno.os.config.AuthorizationConfig`. Delete `tmp/demo.db` to reset all data.

## Catalog

(filled in Task 4)
```

- [ ] **Step 7: Commit**

```bash
git add examples/demo-agentos
git commit -m "feat(demo): demo-agentos core — settings, model factory, JWT auth, tokens, chat agent

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `demo-agentos` tools and the remaining five agents

**Files:**
- Create: `examples/demo-agentos/tools/{catalog.py,browser.py,billing.py,forms.py}`
- Create: `examples/demo-agentos/agents/{tools.py,browser.py,confirm.py,interview.py,approval.py}`
- Modify: `examples/demo-agentos/server.py`

**Interfaces:**
- Consumes: `models.model()`, `db.db`.
- Produces: tool functions `lookup_product`, `slow_task`, `get_location`, `get_local_time`, `send_invoice`, `issue_refund`, `collect_shipping_address`; agents `tools`, `browser`, `confirm`, `interview`, `approval` (each module exports `agent`). Task 4 reuses `slow_task`, `send_invoice`, `get_location`.

- [ ] **Step 1: Tools**

`examples/demo-agentos/tools/catalog.py`:
```python
"""Server-side tools rendered in the chat: a product lookup and a deliberately slow task."""

import json
import time

from agno.tools import tool

PRODUCTS = {
    "SKU-1": {"name": "Trail running shoes", "price": 129.9, "stock": 12},
    "SKU-2": {"name": "Road running shoes", "price": 149.9, "stock": 0},
    "SKU-3": {"name": "Hydration vest", "price": 89.0, "stock": 4},
}


@tool
def lookup_product(sku: str) -> str:
    """Look up a product by SKU (SKU-1, SKU-2, SKU-3). Returns name, price and stock as JSON."""
    return json.dumps(PRODUCTS.get(sku.upper(), {"error": f"unknown sku {sku}"}))


@tool
def slow_task(seconds: int = 20) -> str:
    """Run a long job that takes `seconds` seconds. Use it when asked to run the slow task."""
    time.sleep(seconds)
    return f"slow task finished after {seconds}s"
```

`examples/demo-agentos/tools/browser.py`:
```python
"""Tools the browser executes (external_execution=True): the server only declares them."""

from agno.tools import tool


@tool(external_execution=True)
def get_location() -> str:
    """Return the user's current location as {lat, lng}. Executed by the frontend."""
    return ""


@tool(external_execution=True)
def get_local_time() -> str:
    """Return the user's local time and timezone. Executed by the frontend."""
    return ""
```

`examples/demo-agentos/tools/billing.py`:
```python
"""Money-moving tools: one asks the user to confirm, one needs an admin approval."""

from agno.approval import approval
from agno.tools import tool


@tool(requires_confirmation=True)
def send_invoice(customer: str, amount: float) -> str:
    """Send an invoice of `amount` to `customer`. Asks the user to confirm first."""
    return f"invoice of {amount:.2f} sent to {customer}"


@approval
@tool
def issue_refund(order_id: str, amount: float) -> str:
    """Refund `amount` for `order_id`. Blocked until an admin approves it."""
    return f"refund of {amount:.2f} issued for order {order_id}"
```

`examples/demo-agentos/tools/forms.py`:
```python
"""A tool whose arguments are filled by the user through a form (requires_user_input)."""

from agno.tools import tool


@tool(requires_user_input=True, user_input_fields=["street", "city", "zip"])
def collect_shipping_address(street: str, city: str, zip: str) -> str:
    """Collect the shipping address from the user. Call it when an address is needed."""
    return f"shipping to {street}, {city} {zip}"
```

- [ ] **Step 2: Agents**

`examples/demo-agentos/agents/tools.py`:
```python
"""Server tools shown in the chat, plus a 20-second tool to test reload-while-running."""

from agno.agent import Agent

from db import db
from models import model
from tools.catalog import lookup_product, slow_task

agent = Agent(
    id="tools",
    name="Tools",
    description="Looks up products (SKU-1..3) and can run a slow 20s task.",
    instructions=[
        "Use lookup_product whenever a SKU is mentioned and quote the JSON you got back.",
        "When asked to run the slow task, call slow_task with the requested seconds (default 20).",
    ],
    model=model(),
    tools=[lookup_product, slow_task],
    db=db,
    markdown=True,
    add_history_to_context=True,
)
```

`examples/demo-agentos/agents/browser.py`:
```python
"""Tools executed in the browser through the hook's `frontendTools` map."""

from agno.agent import Agent

from db import db
from models import model
from tools.browser import get_local_time, get_location

agent = Agent(
    id="browser",
    name="Browser",
    description="Asks the browser for the user's location and local time.",
    instructions=[
        "To answer anything about where the user is, call get_location.",
        "To answer anything about the current time, call get_local_time.",
        "Both tools run in the browser; wait for their result and then answer.",
    ],
    model=model(),
    tools=[get_location, get_local_time],
    db=db,
    markdown=True,
    add_history_to_context=True,
)
```

`examples/demo-agentos/agents/confirm.py`:
```python
"""A requires_confirmation tool: the run pauses until the user confirms or rejects."""

from agno.agent import Agent

from db import db
from models import model
from tools.billing import send_invoice

agent = Agent(
    id="confirm",
    name="Confirm",
    description="Sends invoices, but only after you confirm.",
    instructions=[
        "When asked to invoice someone, call send_invoice with the customer and amount.",
        "If the user rejects, apologise briefly and do not retry.",
    ],
    model=model(),
    tools=[send_invoice],
    db=db,
    markdown=True,
    add_history_to_context=True,
)
```

`examples/demo-agentos/agents/interview.py`:
```python
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
```

`examples/demo-agentos/agents/approval.py`:
```python
"""An @approval tool: the run pauses until an admin resolves it in /approvals."""

from agno.agent import Agent

from db import db
from models import model
from tools.billing import issue_refund

agent = Agent(
    id="approval",
    name="Approval",
    description="Issues refunds, which an admin must approve first.",
    instructions=[
        "When asked for a refund, call issue_refund with the order id and amount.",
        "Tell the user the refund is waiting for approval when the tool is blocked.",
    ],
    model=model(),
    tools=[issue_refund],
    db=db,
    markdown=True,
    add_history_to_context=True,
)
```

- [ ] **Step 3: Register in server.py**

Replace the `from agents import chat` line and `agents=[chat.agent]` with:
```python
from agents import approval, browser, chat, confirm, interview, tools
```
```python
    agents=[chat.agent, tools.agent, browser.agent, confirm.agent, interview.agent, approval.agent],
```

- [ ] **Step 4: Verify**

```bash
cd examples/demo-agentos && uv run --python 3.12 python -c "
import server
print(sorted(a.id for a in server.agent_os.agents))
from tools.billing import issue_refund; print(issue_refund.approval_type)
from tools.forms import collect_shipping_address; print(collect_shipping_address.user_input_fields)
"
```
Expected:
```
['approval', 'browser', 'chat', 'confirm', 'interview', 'tools']
required
['street', 'city', 'zip']
```

- [ ] **Step 5: Commit**

```bash
git add examples/demo-agentos
git commit -m "feat(demo): tools and the six demo agents

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `demo-agentos` teams and workflows

**Files:**
- Create: `examples/demo-agentos/teams/{support.py,research.py,field.py}`
- Create: `examples/demo-agentos/workflows/{publish.py,report.py,nightly.py}`
- Modify: `examples/demo-agentos/server.py`, `examples/demo-agentos/README.md` (catalog table)

**Interfaces:**
- Consumes: `models.model()`, `db.db`, tools from Task 3.
- Produces: `teams.*.team`, `workflows.*.workflow`. Member/step agents use ids prefixed with the team/workflow id (e.g. `support-billing`) and are **not** registered in `AgentOS(agents=...)`.

- [ ] **Step 1: Teams**

`examples/demo-agentos/teams/support.py`:
```python
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
```

`examples/demo-agentos/teams/research.py`:
```python
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
```

`examples/demo-agentos/teams/field.py`:
```python
"""A member's browser tool: the external-execution requirement travels up through the team."""

from agno.agent import Agent
from agno.team import Team

from db import db
from models import model
from tools.browser import get_location

scout = Agent(
    id="field-scout", name="Scout", role="Finds out where the user is and describes the area.",
    instructions=["Always call get_location first; it runs in the user's browser."],
    model=model(), tools=[get_location], db=db,
)

team = Team(
    id="field",
    name="Field",
    description="Delegates to a scout that needs the user's location from the browser.",
    instructions=["For any question about the user's surroundings, delegate to Scout."],
    members=[scout],
    model=model(),
    db=db,
    markdown=True,
    store_member_responses=True,
)
```

- [ ] **Step 2: Workflows**

`examples/demo-agentos/workflows/publish.py`:
```python
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
```

`examples/demo-agentos/workflows/report.py`:
```python
"""Parallel steps and a conditional step: the step list shows entries that may not run."""

from agno.agent import Agent
from agno.workflow import Condition, Parallel, Step, Workflow

from db import db
from models import model


def analyst(id: str, focus: str) -> Agent:
    return Agent(id=id, name=id, instructions=[f"Given a company name, invent plausible {focus} for last quarter in 3 bullets."],
                 model=model(), db=db, markdown=True)


sales = analyst("report-sales", "sales figures")
costs = analyst("report-costs", "cost figures; end with the word 'loss' if costs exceeded sales")
alert = Agent(id="report-alert", name="Alert", instructions=["Write a two-line warning about the loss."], model=model(), db=db)
summary = Agent(id="report-summary", name="Summary", instructions=["Summarise everything above in one paragraph."], model=model(), db=db, markdown=True)

workflow = Workflow(
    id="report",
    name="Report",
    description="gather (sales ∥ costs) → check (alert only on 'loss') → summary.",
    db=db,
    steps=[
        Parallel(Step(name="sales", agent=sales), Step(name="costs", agent=costs), name="gather"),
        Condition(name="check", evaluator='previous_step_content.contains("loss")', steps=[Step(name="alert", agent=alert)]),
        Step(name="summary", agent=summary),
    ],
)
```

`examples/demo-agentos/workflows/nightly.py`:
```python
"""Three slow steps: close the tab mid-run, reopen the session, and watch the steps finish."""

from agno.agent import Agent
from agno.workflow import Step, Workflow

from db import db
from models import model
from tools.catalog import slow_task

worker = Agent(
    id="nightly-worker", name="Worker",
    instructions=["Call slow_task with seconds=15, then say which stage finished in one line."],
    tools=[slow_task], model=model(), db=db,
)

workflow = Workflow(
    id="nightly",
    name="Nightly",
    description="Three 15-second steps, to test reconnecting to a background run.",
    db=db,
    steps=[Step(name="extract", agent=worker), Step(name="transform", agent=worker), Step(name="load", agent=worker)],
)
```

- [ ] **Step 3: Register and document**

`server.py`: add
```python
from teams import field, research, support
from workflows import nightly, publish, report
```
and inside `AgentOS(...)`:
```python
    teams=[support.team, research.team, field.team],
    workflows=[publish.workflow, report.workflow, nightly.workflow],
```

Replace `(filled in Task 4)` in the README with:
```markdown
| kind | id | try | shows |
|---|---|---|---|
| agent | `chat` | "Summarise this PDF" (attach one) | streaming, markdown, files, cancel, metrics |
| agent | `tools` | "What is SKU-2?" / "Run the slow task" | tool calls in the chat; reload while `slow_task` runs |
| agent | `browser` | "Where am I and what time is it?" | tools executed in the browser (`frontendTools`) |
| agent | `confirm` | "Invoice ACME 120 dollars" | `requires_confirmation` |
| agent | `interview` | "Plan me a weekend" | `ask_user` (multi-select) and a `requires_user_input` form |
| agent | `approval` | "Refund order 42, 30 dollars" | admin approval: pauses until `/approvals` resolves it |
| team | `support` | "Invoice ACME 50 dollars" | member runs, confirmation coming from a member |
| team | `research` | "Electric bikes" | parallel members, `member_responses`, `ask_user` on the leader |
| team | `field` | "What is around me?" | browser tool executed for a member |
| workflow | `publish` | "Edge computing" | executor pause (question) then step pause (human review) |
| workflow | `report` | "ACME Corp" | `Parallel` and `Condition` steps |
| workflow | `nightly` | "go" | 45 s background run: close the tab and come back |
```

- [ ] **Step 4: Verify**

```bash
cd examples/demo-agentos && uv run --python 3.12 python -c "
import server
print(sorted(t.id for t in server.agent_os.teams)); print(sorted(w.id for w in server.agent_os.workflows))
print(sorted(a.id for a in server.agent_os.agents))
"
```
Expected: `['field', 'research', 'support']`, `['nightly', 'publish', 'report']`, and the agents list still has exactly the six standalone ids (member/step agents are not registered).

- [ ] **Step 5: Commit**

```bash
git add examples/demo-agentos
git commit -m "feat(demo): three teams and three workflows covering member, parallel, condition and pause paths

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `demo-react` foundation — connection, layout, settings, home

**Files:**
- Create: `examples/demo-react/{package.json,index.html,vite.config.ts,tsconfig.json,README.md}`
- Create: `examples/demo-react/src/{main.tsx,routes.tsx,styles.css,catalog.ts}`
- Create: `examples/demo-react/src/connection/{ConnectionContext.tsx,TargetsContext.tsx,useHealth.ts}`
- Create: `examples/demo-react/src/layout/{AppLayout.tsx,Sidebar.tsx}`
- Create: `examples/demo-react/src/ui/{Button.tsx,Input.tsx,Textarea.tsx,Badge.tsx,Card.tsx,Empty.tsx}`, `examples/demo-react/src/lib/{cn.ts,format.ts}`
- Create: `examples/demo-react/src/pages/{HomePage.tsx,SettingsPage.tsx,NotFoundPage.tsx}`
- Modify: `package.json` (root scripts), `bun.lock`

**Interfaces:**
- Produces: `useConnection()` → `{ endpoint, tokens, activeLabel, activeToken, setEndpoint, setActive, upsertTokens, removeToken }`; `useTargets()` → `{ status, agents, teams, workflows, error }`; `useHealth()` → `{ online: boolean | null, osId: string | null }`; UI primitives; `CATALOG`.
- Later tasks add routes to `routes.tsx` (placeholders are created here so the file compiles).

- [ ] **Step 1: Package and tooling**

`examples/demo-react/package.json`:
```json
{
  "name": "demo-react",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json && vite build",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@rodrigocoliveira/agno-api": "workspace:*",
    "@rodrigocoliveira/agno-hooks": "workspace:*",
    "lucide-react": "^0.575.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-markdown": "^10.1.0",
    "react-router": "^7.13.0"
  },
  "devDependencies": {
    "@tailwindcss/typography": "^0.5.16",
    "@tailwindcss/vite": "^4.1.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.4.1",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.9.3",
    "vite": "^6.3.5"
  }
}
```

`examples/demo-react/vite.config.ts`:
```ts
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Point the packages at their sources so edits in packages/* hot-reload here.
const pkg = (name: string) => fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@rodrigocoliveira/agno-hooks': pkg('agno-hooks'),
      '@rodrigocoliveira/agno-api': pkg('agno-api'),
    },
  },
})
```

`examples/demo-react/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "types": ["vite/client"] },
  "include": ["src", "vite.config.ts"]
}
```

`examples/demo-react/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>agno-hooks demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`examples/demo-react/src/styles.css`:
```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

:root { color-scheme: light; }
body { @apply bg-neutral-50 text-neutral-900 antialiased; }
```

Root `package.json` scripts, add:
```json
    "demo:server": "bun run --filter demo-agentos dev",
    "demo:tokens": "bun run --filter demo-agentos tokens",
    "demo:web": "bun run --filter demo-react dev",
```

Run `bun install` (commit the updated `bun.lock`).

- [ ] **Step 2: lib and ui primitives**

`src/lib/cn.ts`:
```ts
export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')
```

`src/lib/format.ts`:
```ts
export function formatTime(epochSeconds: number | string | null | undefined): string {
  if (epochSeconds == null) return ''
  const n = typeof epochSeconds === 'string' ? Date.parse(epochSeconds) / 1000 : epochSeconds
  if (!Number.isFinite(n)) return String(epochSeconds)
  return new Date(n * 1000).toLocaleString()
}

export function short(id: string | null | undefined, n = 8): string {
  return id ? (id.length > n ? `${id.slice(0, n)}…` : id) : ''
}

export const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Decodes a JWT payload without verifying it — for display only. */
export function jwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>
  } catch {
    return null
  }
}
```

`src/ui/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
const styles: Record<Variant, string> = {
  primary: 'bg-neutral-900 text-white hover:bg-neutral-700',
  secondary: 'border border-neutral-300 bg-white hover:bg-neutral-100',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  ghost: 'hover:bg-neutral-100',
}

export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50', styles[variant], className)}
      {...props}
    />
  )
}
```

`src/ui/Input.tsx`:
```tsx
import type { InputHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-900', className)} {...props} />
}
```

`src/ui/Textarea.tsx`:
```tsx
import type { TextareaHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900', className)} {...props} />
}
```

`src/ui/Badge.tsx`:
```tsx
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export type Tone = 'neutral' | 'green' | 'amber' | 'red' | 'blue'
const tones: Record<Tone, string> = {
  neutral: 'bg-neutral-100 text-neutral-700',
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-blue-100 text-blue-800',
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-block rounded px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide', tones[tone], className)}>{children}</span>
}
```

`src/ui/Card.tsx`:
```tsx
import type { HTMLAttributes } from 'react'
import { cn } from '../lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-neutral-200 bg-white p-4', className)} {...props} />
}
```

`src/ui/Empty.tsx`:
```tsx
import type { ReactNode } from 'react'

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="m-auto max-w-md p-8 text-center text-sm text-neutral-500">
      <p className="font-medium text-neutral-700">{title}</p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  )
}
```

- [ ] **Step 3: Connection state**

`src/connection/ConnectionContext.tsx`:
```tsx
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export interface TokenEntry { label: string; token: string }
export interface ConnectionState { endpoint: string; tokens: TokenEntry[]; activeLabel: string | null }

const STORAGE_KEY = 'demo-react:connection'
const DEFAULT: ConnectionState = { endpoint: 'http://localhost:7777', tokens: [], activeLabel: null }

/** Accepts the JSON printed by demo-agentos/tokens.py: { "admin": "<jwt>", "user-1": "<jwt>", ... } */
export function parseTokens(json: string): TokenEntry[] {
  const obj = JSON.parse(json) as Record<string, unknown>
  return Object.entries(obj)
    .filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0)
    .map(([label, token]) => ({ label, token }))
}

function load(): ConnectionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT, ...(JSON.parse(raw) as Partial<ConnectionState>) }
  } catch { /* unavailable or corrupted storage: start fresh */ }
  const seeded = import.meta.env.VITE_AGNO_TOKENS as string | undefined
  try { return seeded ? { ...DEFAULT, tokens: parseTokens(seeded) } : DEFAULT } catch { return DEFAULT }
}

function persist(state: ConnectionState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* private mode: keep in memory */ }
}

export interface Connection extends ConnectionState {
  activeToken: string | null
  setEndpoint(url: string): void
  setActive(label: string | null): void
  upsertTokens(entries: TokenEntry[]): void
  removeToken(label: string): void
}

const Ctx = createContext<Connection | null>(null)

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConnectionState>(load)
  const update = (patch: (s: ConnectionState) => ConnectionState) =>
    setState((s) => { const next = patch(s); persist(next); return next })

  const value = useMemo<Connection>(() => ({
    ...state,
    activeToken: state.tokens.find((t) => t.label === state.activeLabel)?.token ?? null,
    setEndpoint: (url) => update((s) => ({ ...s, endpoint: url.trim().replace(/\/+$/, '') })),
    setActive: (activeLabel) => update((s) => ({ ...s, activeLabel })),
    upsertTokens: (entries) => update((s) => ({
      ...s,
      tokens: [...s.tokens.filter((t) => !entries.some((e) => e.label === t.label)), ...entries],
    })),
    removeToken: (label) => update((s) => ({
      ...s,
      tokens: s.tokens.filter((t) => t.label !== label),
      activeLabel: s.activeLabel === label ? null : s.activeLabel,
    })),
  }), [state])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useConnection(): Connection {
  const v = useContext(Ctx)
  if (!v) throw new Error('useConnection must be used inside <ConnectionProvider>')
  return v
}
```

`src/connection/TargetsContext.tsx`:
```tsx
import type { components } from '@rodrigocoliveira/agno-api'
import { useAgnoApi } from '@rodrigocoliveira/agno-hooks'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type AgentInfo = components['schemas']['AgentResponse']
export type TeamInfo = components['schemas']['TeamResponse']
export type WorkflowInfo = components['schemas']['WorkflowSummaryResponse']

export interface Targets {
  status: 'loading' | 'ready' | 'error'
  agents: AgentInfo[]
  teams: TeamInfo[]
  workflows: WorkflowInfo[]
  error: Error | null
}

const EMPTY: Targets = { status: 'loading', agents: [], teams: [], workflows: [], error: null }
const Ctx = createContext<Targets>(EMPTY)

/** Lists agents, teams and workflows once per connection (the provider is remounted on endpoint/token change). */
export function TargetsProvider({ children }: { children: ReactNode }) {
  const api = useAgnoApi()
  const [targets, setTargets] = useState<Targets>(EMPTY)
  useEffect(() => {
    let alive = true
    Promise.all([api.agents.list(), api.teams.list(), api.workflows.list()])
      .then(([agents, teams, workflows]) => { if (alive) setTargets({ status: 'ready', agents, teams, workflows, error: null }) })
      .catch((e: unknown) => { if (alive) setTargets({ ...EMPTY, status: 'error', error: e instanceof Error ? e : new Error(String(e)) }) })
    return () => { alive = false }
  }, [api])
  return <Ctx.Provider value={targets}>{children}</Ctx.Provider>
}

export const useTargets = () => useContext(Ctx)
```

`src/connection/useHealth.ts`:
```ts
import { useAgnoApi } from '@rodrigocoliveira/agno-hooks'
import { useEffect, useState } from 'react'

/** `online` is null until the first /health answers; `osId` comes from /config when the token allows it. */
export function useHealth() {
  const api = useAgnoApi()
  const [state, setState] = useState<{ online: boolean | null; osId: string | null }>({ online: null, osId: null })
  useEffect(() => {
    let alive = true
    api.os.health()
      .then(() => api.os.config().then((c) => c.os_id ?? null).catch(() => null))
      .then((osId) => { if (alive) setState({ online: true, osId }) })
      .catch(() => { if (alive) setState({ online: false, osId: null }) })
    return () => { alive = false }
  }, [api])
  return state
}
```

- [ ] **Step 4: Catalog, layout, sidebar**

`src/catalog.ts`:
```ts
import type { Kind } from '@rodrigocoliveira/agno-hooks'

export const GUIDE_URL = 'https://github.com/rodrigocoliveira/agno-frontend-sdk/blob/main/guide/'

export interface CatalogEntry { kind: Kind; id: string; try: string; shows: string; guide: string }

/** What each demo target demonstrates and which guide chapter explains it. Ids must match demo-agentos. */
export const CATALOG: CatalogEntry[] = [
  { kind: 'agent', id: 'chat', try: 'Summarise this PDF (attach one)', shows: 'Streaming, markdown, file attachments, cancel, metrics', guide: 'agent.md' },
  { kind: 'agent', id: 'tools', try: 'What is SKU-2? / Run the slow task', shows: 'Tool calls in the chat; reload the page while slow_task runs', guide: 'reconnection.md' },
  { kind: 'agent', id: 'browser', try: 'Where am I and what time is it?', shows: 'Tools executed in the browser (frontendTools)', guide: 'frontend-tools.md' },
  { kind: 'agent', id: 'confirm', try: 'Invoice ACME 120 dollars', shows: 'requires_confirmation, decided outside the chat', guide: 'confirmation-and-input.md' },
  { kind: 'agent', id: 'interview', try: 'Plan me a weekend', shows: 'ask_user with multi-select and a requires_user_input form', guide: 'confirmation-and-input.md' },
  { kind: 'agent', id: 'approval', try: 'Refund order 42, 30 dollars', shows: 'Admin approval: pauses until /approvals resolves it', guide: 'approvals.md' },
  { kind: 'team', id: 'support', try: 'Invoice ACME 50 dollars', shows: 'Member runs; a confirmation coming from a member', guide: 'team.md' },
  { kind: 'team', id: 'research', try: 'Electric bikes', shows: 'Parallel members, member_responses, ask_user on the leader', guide: 'team.md' },
  { kind: 'team', id: 'field', try: 'What is around me?', shows: 'A browser tool executed for a member', guide: 'frontend-tools.md' },
  { kind: 'workflow', id: 'publish', try: 'Edge computing', shows: 'Executor pause (question) then step pause (human review)', guide: 'workflow.md' },
  { kind: 'workflow', id: 'report', try: 'ACME Corp', shows: 'Parallel and Condition steps', guide: 'workflow.md' },
  { kind: 'workflow', id: 'nightly', try: 'go', shows: '45 s background run: close the tab and come back', guide: 'reconnection.md' },
]

export const pathFor = (kind: Kind, id: string) => `/${kind}s/${id}`
```

`src/layout/Sidebar.tsx`:
```tsx
import { Bot, CheckSquare, History, Home, Settings, Users, Workflow } from 'lucide-react'
import { NavLink } from 'react-router'
import { pathFor } from '../catalog'
import { useTargets } from '../connection/TargetsContext'
import { cn } from '../lib/cn'

const link = ({ isActive }: { isActive: boolean }) =>
  cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-100', isActive && 'bg-neutral-200 font-medium')

function Section({ title, icon, items, kind }: { title: string; icon: React.ReactNode; items: { id: string; name?: string | null }[]; kind: 'agent' | 'team' | 'workflow' }) {
  return (
    <div>
      <div className="mt-4 mb-1 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{icon}{title}</div>
      {items.length === 0 && <div className="px-2 text-xs text-neutral-400">none</div>}
      {items.map((t) => <NavLink key={t.id} to={pathFor(kind, t.id)} className={link}>{t.name || t.id}</NavLink>)}
    </div>
  )
}

export function Sidebar() {
  const { agents, teams, workflows } = useTargets()
  return (
    <aside className="flex h-full flex-col overflow-y-auto border-r border-neutral-200 bg-white p-2">
      <NavLink to="/" end className={link}><Home size={14} />Home</NavLink>
      <Section title="Agents" icon={<Bot size={12} />} items={agents} kind="agent" />
      <Section title="Teams" icon={<Users size={12} />} items={teams} kind="team" />
      <Section title="Workflows" icon={<Workflow size={12} />} items={workflows} kind="workflow" />
      <div className="mt-4 border-t border-neutral-200 pt-2">
        <NavLink to="/sessions" className={link}><History size={14} />Sessions</NavLink>
        <NavLink to="/approvals" className={link}><CheckSquare size={14} />Approvals</NavLink>
        <NavLink to="/settings" className={link}><Settings size={14} />Settings</NavLink>
      </div>
    </aside>
  )
}
```

`src/layout/AppLayout.tsx`:
```tsx
import { Link, Outlet } from 'react-router'
import { useConnection } from '../connection/ConnectionContext'
import { TargetsProvider } from '../connection/TargetsContext'
import { useHealth } from '../connection/useHealth'
import { cn } from '../lib/cn'
import { Badge } from '../ui/Badge'
import { Sidebar } from './Sidebar'

function Header() {
  const { endpoint, activeLabel } = useConnection()
  const { online, osId } = useHealth()
  return (
    <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2 text-sm">
      <span className={cn('h-2 w-2 rounded-full', online === null ? 'bg-neutral-300' : online ? 'bg-green-500' : 'bg-red-500')} />
      <span className="font-mono text-xs text-neutral-600">{endpoint}</span>
      {osId && <Badge>{osId}</Badge>}
      <span className="ml-auto text-neutral-500">token:</span>
      <Link to="/settings"><Badge tone={activeLabel ? 'blue' : 'neutral'}>{activeLabel ?? 'none'}</Badge></Link>
    </header>
  )
}

export function AppLayout() {
  return (
    <TargetsProvider>
      <div className="grid h-screen grid-cols-[220px_1fr] grid-rows-[auto_1fr]">
        <div className="col-span-2"><Header /></div>
        <Sidebar />
        <main className="min-h-0 min-w-0 overflow-hidden"><Outlet /></main>
      </div>
    </TargetsProvider>
  )
}
```

- [ ] **Step 5: Pages: Home, Settings, NotFound**

`src/pages/HomePage.tsx`:
```tsx
import { Link } from 'react-router'
import { CATALOG, GUIDE_URL, pathFor } from '../catalog'
import { useTargets } from '../connection/TargetsContext'
import { useHealth } from '../connection/useHealth'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'

export function HomePage() {
  const { online } = useHealth()
  const t = useTargets()
  const known = new Set([...t.agents.map((a) => `agent:${a.id}`), ...t.teams.map((x) => `team:${x.id}`), ...t.workflows.map((w) => `workflow:${w.id}`)])
  return (
    <div className="h-full space-y-6 overflow-y-auto p-6">
      {online === false && <Card className="border-red-300 text-sm">AgentOS did not answer. Check the endpoint in <Link className="underline" to="/settings">Settings</Link>.</Card>}
      {t.status === 'error' && <Card className="border-amber-300 text-sm">Could not list targets: {t.error?.message}. This OS may require a token — see <Link className="underline" to="/settings">Settings</Link>.</Card>}
      <div className="grid grid-cols-3 gap-4">
        {([['Agents', t.agents.length], ['Teams', t.teams.length], ['Workflows', t.workflows.length]] as const).map(([label, n]) => (
          <Card key={label}><div className="text-xs uppercase text-neutral-500">{label}</div><div className="text-3xl font-semibold">{n}</div></Card>
        ))}
      </div>
      <Card>
        <h2 className="mb-3 font-medium">What each demo shows</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-neutral-500"><tr><th className="py-1">target</th><th>try</th><th>shows</th><th>guide</th></tr></thead>
          <tbody>
            {CATALOG.map((c) => {
              const present = known.has(`${c.kind}:${c.id}`)
              return (
                <tr key={`${c.kind}:${c.id}`} className="border-t border-neutral-100 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <Badge>{c.kind}</Badge>{' '}
                    {present ? <Link className="underline" to={pathFor(c.kind, c.id)}>{c.id}</Link> : <span className="text-neutral-400" title="not in this OS">{c.id}</span>}
                  </td>
                  <td className="py-2 pr-3 text-neutral-600">“{c.try}”</td>
                  <td className="py-2 pr-3">{c.shows}</td>
                  <td className="py-2"><a className="underline" href={GUIDE_URL + c.guide} target="_blank" rel="noreferrer">{c.guide}</a></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
```

`src/pages/SettingsPage.tsx`:
```tsx
import { useState } from 'react'
import { parseTokens, useConnection } from '../connection/ConnectionContext'
import { useHealth } from '../connection/useHealth'
import { jwtPayload, messageOf, short } from '../lib/format'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'

export function SettingsPage() {
  const c = useConnection()
  const { online, osId } = useHealth()
  const [endpoint, setEndpoint] = useState(c.endpoint)
  const [label, setLabel] = useState('')
  const [token, setToken] = useState('')
  const [json, setJson] = useState('')
  const [error, setError] = useState<string | null>(null)
  const payload = c.activeToken ? jwtPayload(c.activeToken) : null

  const importJson = () => {
    try { c.upsertTokens(parseTokens(json)); setJson(''); setError(null) } catch (e) { setError(`Not the tokens.py JSON: ${messageOf(e)}`) }
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto p-6">
      <Card>
        <h2 className="mb-2 font-medium">Endpoint</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); c.setEndpoint(endpoint) }}>
          <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="http://localhost:7777" />
          <Button type="submit">Save</Button>
        </form>
        <p className="mt-2 text-xs text-neutral-500">{online === null ? 'checking…' : online ? `online${osId ? ` · ${osId}` : ''}` : 'offline'}</p>
      </Card>

      <Card>
        <h2 className="mb-2 font-medium">Tokens</h2>
        <ul className="divide-y divide-neutral-100 text-sm">
          <li className="flex items-center gap-3 py-2">
            <input type="radio" name="active" checked={c.activeLabel === null} onChange={() => c.setActive(null)} /> <span>no token</span>
          </li>
          {c.tokens.map((t) => (
            <li key={t.label} className="flex items-center gap-3 py-2">
              <input type="radio" name="active" checked={c.activeLabel === t.label} onChange={() => c.setActive(t.label)} />
              <span className="font-medium">{t.label}</span>
              <span className="font-mono text-xs text-neutral-400">{short(t.token, 24)}</span>
              <Button variant="ghost" className="ml-auto" onClick={() => c.removeToken(t.label)}>remove</Button>
            </li>
          ))}
        </ul>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (label && token) { c.upsertTokens([{ label, token }]); setLabel(''); setToken('') } }}>
          <Input className="w-32" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="label" />
          <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="paste a JWT" />
          <Button type="submit" variant="secondary">Add</Button>
        </form>
        <div className="mt-3">
          <Textarea rows={4} value={json} onChange={(e) => setJson(e.target.value)} placeholder='Paste the output of `bun run demo:tokens` ({"admin": "...", "user-1": "...", "user-2": "..."})' />
          <div className="mt-2 flex items-center gap-3">
            <Button variant="secondary" onClick={importJson} disabled={!json.trim()}>Import JSON</Button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      </Card>

      {payload && (
        <Card>
          <h2 className="mb-2 font-medium">Active token payload</h2>
          <pre className="overflow-x-auto rounded bg-neutral-50 p-3 text-xs">{JSON.stringify(payload, null, 2)}</pre>
        </Card>
      )}
    </div>
  )
}
```

`src/pages/NotFoundPage.tsx`:
```tsx
import { Link } from 'react-router'
import { Empty } from '../ui/Empty'

export function NotFoundPage() {
  return <Empty title="Nothing here"><Link className="underline" to="/">Back to home</Link></Empty>
}
```

- [ ] **Step 6: Routes and entry**

`src/routes.tsx` (Tasks 6, 8, 9 replace the placeholders):
```tsx
import { Route, Routes } from 'react-router'
import { AppLayout } from './layout/AppLayout'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SettingsPage } from './pages/SettingsPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
```

`src/main.tsx`:
```tsx
import { AgnoProvider } from '@rodrigocoliveira/agno-hooks'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { ConnectionProvider, useConnection } from './connection/ConnectionContext'
import { AppRoutes } from './routes'
import './styles.css'

function Root() {
  const { endpoint, activeLabel, activeToken } = useConnection()
  // Keyed by endpoint + token: switching users remounts every hook, so no store keeps another user's runs.
  return (
    <AgnoProvider key={`${endpoint}|${activeLabel ?? ''}`} baseUrl={endpoint} token={activeToken ?? undefined}>
      <AppRoutes />
    </AgnoProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ConnectionProvider>
        <Root />
      </ConnectionProvider>
    </BrowserRouter>
  </StrictMode>,
)
```

`examples/demo-react/README.md`:
```markdown
# examples/demo-react

The showcase app for `@rodrigocoliveira/agno-hooks`. It discovers agents, teams and workflows from
the connected AgentOS, so it works against [`examples/demo-agentos`](../demo-agentos) (real LLM)
and against [`e2e/agentos`](../../e2e/agentos) (scripted, no auth).

```bash
bun install
bun run demo:server     # terminal 1 (see demo-agentos/README.md for the API key)
bun run demo:tokens     # prints the JWTs
bun run demo:web        # terminal 2 → http://localhost:5173
```

Open **Settings**, set the endpoint (default `http://localhost:7777`), paste the tokens JSON into
"Import JSON" and pick `user-1`. The Home page maps each demo target to the feature it shows and to
its chapter in [`guide/`](../../guide).

Tokens can also be seeded with `VITE_AGNO_TOKENS='<json>' bun run demo:web` (read on first load only).
```

- [ ] **Step 7: Verify**

```bash
bun run --filter demo-react typecheck && bun run --filter demo-react build
```
Expected: both succeed (Vite prints the bundle sizes).

Manual: `bun run --filter demo-react dev`, open `http://localhost:5173/settings`, set endpoint `http://localhost:7778` with `e2e/agentos` running (`AGNO_PORT=7778 bun run agentos`): header dot turns green, sidebar lists `Test Agent`, `Test Team`, `Test Workflow`, `Test Workflow HITL`; Home shows the counts 1/1/2 and the catalog rows greyed out (ids not in this OS).

- [ ] **Step 8: Commit**

```bash
git add examples/demo-react package.json bun.lock
git commit -m "feat(demo): demo-react foundation — connection and tokens, layout, home, settings

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `demo-react` run rendering and the agent page

**Files:**
- Create: `examples/demo-react/src/run/{RunShell.tsx,RunList.tsx,RunCard.tsx,ToolCallList.tsx,Composer.tsx,RawDrawer.tsx,StepList.tsx,MemberRuns.tsx}`
- Create: `examples/demo-react/src/sessions/SessionList.tsx`
- Create: `examples/demo-react/src/pending/PendingPanel.tsx` (stub returning `null`; Task 7 fills it)
- Create: `examples/demo-react/src/tools/frontendTools.ts`
- Create: `examples/demo-react/src/pages/AgentPage.tsx`
- Modify: `examples/demo-react/src/routes.tsx`

**Interfaces:**
- Consumes: `AgnoHook<K>`, `Run`, `StepRun`, `SendInput<K>` from the lib.
- Produces: `<RunShell kind targetId hook />` used by Team/Workflow pages in Task 8; `frontendTools` map; `PendingPanel({ hook })` contract for Task 7.

- [ ] **Step 1: Frontend tools and the PendingPanel stub**

`src/tools/frontendTools.ts`:
```ts
import type { FrontendTool } from '@rodrigocoliveira/agno-hooks'

/** Tools the demo server declares with external_execution=True. The hook runs them when a live run pauses on them. */
export const frontendTools: Record<string, FrontendTool> = {
  get_location: () =>
    new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (e) => reject(new Error(e.message)),
        { timeout: 10_000 },
      ),
    ),
  get_local_time: () => ({ iso: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
}
```

`src/pending/PendingPanel.tsx` (stub):
```tsx
import type { AgnoHook, Kind } from '@rodrigocoliveira/agno-hooks'

export function PendingPanel<K extends Kind>(_: { hook: AgnoHook<K> }) {
  return null
}
```

- [ ] **Step 2: Run pieces**

`src/run/RawDrawer.tsx`:
```tsx
import type { Run } from '@rodrigocoliveira/agno-hooks'

export function RawDrawer({ run }: { run: Run }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-neutral-500 hover:text-neutral-800">raw</summary>
      <pre className="mt-1 max-h-80 overflow-auto rounded bg-neutral-50 p-2">
        {JSON.stringify({ id: run.id, status: run.status, metrics: run.metrics, citations: run.citations, raw: run.raw }, null, 2)}
      </pre>
    </details>
  )
}
```

`src/run/ToolCallList.tsx`:
```tsx
import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { isToolPending } from '@rodrigocoliveira/agno-hooks'
import { Badge, type Tone } from '../ui/Badge'

function state(t: ToolExecution): { label: string; tone: Tone } {
  if (t.tool_call_error) return { label: 'error', tone: 'red' }
  if (isToolPending(t)) return { label: 'pending', tone: 'amber' }
  if (t.confirmed === false) return { label: 'rejected', tone: 'neutral' }
  return { label: 'done', tone: 'green' }
}

function answers(t: ToolExecution): string | null {
  const qs = t.user_feedback_schema?.filter((q) => q.selected_options?.length)
  return qs?.length ? qs.map((q) => `${q.header ?? q.question}: ${q.selected_options!.join(', ')}`).join(' · ') : null
}

export function ToolCallList({ tools }: { tools: ToolExecution[] }) {
  return (
    <ul className="space-y-1">
      {tools.map((t) => {
        const s = state(t)
        return (
          <li key={t.tool_call_id}>
            <details className="rounded border border-neutral-200 bg-white text-xs">
              <summary className="flex cursor-pointer items-center gap-2 px-2 py-1">
                <span className="font-mono">{t.tool_name}</span>
                <Badge tone={s.tone}>{s.label}</Badge>
                {answers(t) && <span className="text-neutral-500">{answers(t)}</span>}
              </summary>
              <div className="space-y-1 border-t border-neutral-100 px-2 py-1">
                <div><span className="text-neutral-500">args </span><code>{JSON.stringify(t.tool_args ?? {})}</code></div>
                {t.result != null && <div><span className="text-neutral-500">result </span><code className="whitespace-pre-wrap">{String(t.result)}</code></div>}
                {t.approval_id && <div><span className="text-neutral-500">approval </span><code>{t.approval_id}</code></div>}
              </div>
            </details>
          </li>
        )
      })}
    </ul>
  )
}
```

`src/run/StepList.tsx`:
```tsx
import type { StepRun } from '@rodrigocoliveira/agno-hooks'
import Markdown from 'react-markdown'
import { Badge, type Tone } from '../ui/Badge'
import { ToolCallList } from './ToolCallList'

const tone: Record<StepRun['status'], Tone> = { running: 'blue', paused: 'amber', completed: 'green', error: 'red' }

/** Flat, in index order: Parallel/Condition children arrive as their own steps. */
export function StepList({ steps }: { steps: StepRun[] }) {
  if (steps.length === 0) return <p className="text-sm text-neutral-400">starting…</p>
  return (
    <ol className="space-y-2">
      {[...steps].sort((a, b) => a.index - b.index).map((s) => (
        <li key={s.id} className="rounded-md border border-neutral-200 bg-white p-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono text-xs text-neutral-400">{s.index + 1}</span>
            <span className="font-medium">{s.name}</span>
            <Badge tone={tone[s.status]}>{s.status}</Badge>
          </div>
          {s.tools.length > 0 && <div className="mt-2"><ToolCallList tools={s.tools} /></div>}
          {s.content && <div className="prose prose-sm mt-2 max-w-none"><Markdown>{s.content}</Markdown></div>}
        </li>
      ))}
    </ol>
  )
}
```

`src/run/MemberRuns.tsx`:
```tsx
import type { AgentRun } from '@rodrigocoliveira/agno-hooks'
import { RunCard } from './RunCard'

export function MemberRuns({ members }: { members: AgentRun[] }) {
  return (
    <div className="space-y-3 rounded-md border border-dashed border-neutral-300 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Members</div>
      {members.map((m) => <RunCard key={m.id} run={m} nested />)}
    </div>
  )
}
```

`src/run/RunCard.tsx`:
```tsx
import type { Run } from '@rodrigocoliveira/agno-hooks'
import { Paperclip } from 'lucide-react'
import Markdown from 'react-markdown'
import { cn } from '../lib/cn'
import { formatTime } from '../lib/format'
import { Badge, type Tone } from '../ui/Badge'
import { Button } from '../ui/Button'
import { MemberRuns } from './MemberRuns'
import { RawDrawer } from './RawDrawer'
import { StepList } from './StepList'
import { ToolCallList } from './ToolCallList'

const tone: Record<Run['status'], Tone> = { running: 'blue', paused: 'amber', completed: 'green', error: 'red', cancelled: 'neutral' }

function metricsSummary(m: unknown): string | null {
  if (!m || typeof m !== 'object') return null
  const r = m as Record<string, unknown>
  const parts = [
    typeof r.total_tokens === 'number' && `${r.total_tokens} tokens`,
    typeof r.duration === 'number' && `${r.duration.toFixed(1)} s`,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

export function RunCard({ run, onRetry, nested = false }: { run: Run; onRetry?: (id: string) => void; nested?: boolean }) {
  const agentName = run.kind === 'agent' ? run.agentId : null
  return (
    <article className={cn('space-y-3', nested && 'border-l-2 border-neutral-200 pl-3')}>
      {nested && agentName && <div className="text-xs font-medium text-neutral-500">{agentName}</div>}
      {(run.input.message || run.input.files.length > 0) && (
        <div className="ml-auto max-w-[75%] rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white">
          {run.input.message}
          {run.input.files.map((f) => <div key={f.name} className="mt-1 flex items-center gap-1 text-xs opacity-80"><Paperclip size={12} />{f.name}</div>)}
        </div>
      )}
      {run.kind === 'workflow' ? (
        <StepList steps={run.steps} />
      ) : (
        <>
          {run.tools.length > 0 && <ToolCallList tools={run.tools} />}
          {run.kind === 'team' && run.members.length > 0 && <MemberRuns members={run.members} />}
        </>
      )}
      {run.content && <div className="prose prose-sm max-w-none"><Markdown>{run.content}</Markdown></div>}
      {run.status === 'running' && !run.content && run.kind !== 'workflow' && <p className="text-sm text-neutral-400">thinking…</p>}
      <footer className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
        <Badge tone={tone[run.status]}>{run.status}</Badge>
        {run.createdAt && <span>{formatTime(run.createdAt)}</span>}
        {metricsSummary(run.metrics) && <span>{metricsSummary(run.metrics)}</span>}
        {run.error && <span className="text-red-600">{run.error}</span>}
        {run.error && onRetry && <Button variant="secondary" onClick={() => onRetry(run.id)}>resume</Button>}
        <RawDrawer run={run} />
      </footer>
    </article>
  )
}
```

`src/run/RunList.tsx`:
```tsx
import type { Run } from '@rodrigocoliveira/agno-hooks'
import { useEffect, useRef } from 'react'
import { Empty } from '../ui/Empty'
import { RunCard } from './RunCard'

export function RunList({ runs, hint, onRetry }: { runs: Run[]; hint: string; onRetry: (id: string) => void }) {
  const end = useRef<HTMLDivElement>(null)
  const last = runs.at(-1)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [runs.length, last?.content, last?.status])
  if (runs.length === 0) return <div className="flex flex-1 flex-col"><Empty title="No runs yet">{hint}</Empty></div>
  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-4">
      {runs.map((r) => <RunCard key={r.id} run={r} onRetry={onRetry} />)}
      <div ref={end} />
    </div>
  )
}
```

`src/run/Composer.tsx`:
```tsx
import { Paperclip, Send, Square } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { messageOf } from '../lib/format'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'

interface Props {
  busy: boolean
  allowFiles: boolean
  placeholder: string
  onSend: (message: string, files: File[]) => Promise<void>
  onCancel: () => void
}

export function Composer({ busy, allowFiles, placeholder, onSend, onCancel }: Props) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!text.trim() || busy) return
    setError(null)
    try {
      await onSend(text, files)
      setText(''); setFiles([])
    } catch (err) { setError(messageOf(err)) }
  }

  return (
    <form onSubmit={submit} className="border-t border-neutral-200 bg-white p-3">
      {files.length > 0 && <div className="mb-2 text-xs text-neutral-500">{files.map((f) => f.name).join(', ')}</div>}
      <div className="flex items-end gap-2">
        {allowFiles && (
          <>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            <Button type="button" variant="ghost" onClick={() => fileInput.current?.click()} title="Attach files"><Paperclip size={16} /></Button>
          </>
        )}
        <Textarea
          rows={2}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) void submit(e) }}
        />
        {busy
          ? <Button type="button" variant="danger" onClick={onCancel} title="Cancel the run"><Square size={16} /></Button>
          : <Button type="submit" disabled={!text.trim()} title="Send"><Send size={16} /></Button>}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 3: Session list**

`src/sessions/SessionList.tsx`:
```tsx
import type { components } from '@rodrigocoliveira/agno-api'
import { useAgnoApi, type Kind } from '@rodrigocoliveira/agno-hooks'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { cn } from '../lib/cn'
import { formatTime, short } from '../lib/format'

type SessionRow = components['schemas']['SessionSchema']

/** Sessions of one target for the active user. Refetched when the active session changes (a new one appears after the first run). */
export function SessionList({ kind, targetId, activeId }: { kind: Kind; targetId: string; activeId: string | null }) {
  const api = useAgnoApi()
  const [rows, setRows] = useState<SessionRow[]>([])
  useEffect(() => {
    let alive = true
    api.sessions.list({ type: kind, component_id: targetId, limit: 50, sort_by: 'updated_at', sort_order: 'desc' })
      .then((res) => { if (alive) setRows(res.data ?? []) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [api, kind, targetId, activeId])

  return (
    <aside className="flex h-full flex-col overflow-y-auto border-r border-neutral-200 bg-white">
      <Link to="." className={cn('m-2 flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm hover:bg-neutral-100', activeId === null && 'bg-neutral-200')}>
        <Plus size={14} /> New session
      </Link>
      <ul className="text-sm">
        {rows.map((s) => (
          <li key={s.session_id}>
            <Link to={`?session=${s.session_id}`} className={cn('block px-3 py-2 hover:bg-neutral-100', s.session_id === activeId && 'bg-neutral-200')}>
              <div className="truncate">{s.session_name || short(s.session_id, 12)}</div>
              <div className="text-xs text-neutral-400">{formatTime(s.updated_at ?? s.created_at)}</div>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
```

- [ ] **Step 4: RunShell**

`src/run/RunShell.tsx`:
```tsx
import { AgnoApiError } from '@rodrigocoliveira/agno-api'
import type { AgnoHook, Kind, SendInput } from '@rodrigocoliveira/agno-hooks'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PendingPanel } from '../pending/PendingPanel'
import { SessionList } from '../sessions/SessionList'
import { Button } from '../ui/Button'
import { Empty } from '../ui/Empty'
import { Composer } from './Composer'
import { RunList } from './RunList'

interface Props<K extends Kind> { kind: K; targetId: string; hook: AgnoHook<K>; hint: string }

function LoadError({ error }: { error: Error | null }) {
  const denied = error instanceof AgnoApiError && (error.status === 401 || error.status === 403)
  return (
    <Empty title={denied ? 'The active token cannot open this session' : 'Could not load the session'}>
      <p>{error?.message}</p>
      <div className="mt-3 flex justify-center gap-2">
        {denied && <Link to="/settings"><Button variant="secondary">Settings</Button></Link>}
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    </Empty>
  )
}

/** One session of any kind: session list | pending panel, runs, composer. Keeps `?session=` in sync with the hook. */
export function RunShell<K extends Kind>({ kind, targetId, hook, hint }: Props<K>) {
  const [params, setParams] = useSearchParams()
  const sessionParam = params.get('session')
  useEffect(() => {
    if (hook.sessionId && hook.sessionId !== sessionParam) setParams({ session: hook.sessionId }, { replace: true })
  }, [hook.sessionId, sessionParam, setParams])

  const send = (message: string, files: File[]) =>
    hook.send(files.length > 0 ? ({ message, files } as SendInput<K>) : message)

  return (
    <div className="grid h-full grid-cols-[200px_1fr]">
      <SessionList kind={kind} targetId={targetId} activeId={sessionParam} />
      <section className="flex min-h-0 min-w-0 flex-col">
        {hook.status === 'loading' && <Empty title="Loading session…" />}
        {hook.status === 'error' && <LoadError error={hook.error} />}
        {hook.status === 'ready' && (
          <>
            <PendingPanel hook={hook} />
            <RunList runs={hook.runs} hint={hint} onRetry={(id) => void hook.resume(id)} />
            <Composer busy={hook.isBusy} allowFiles={kind !== 'workflow'} placeholder={kind === 'workflow' ? 'Workflow input' : 'Message'} onSend={send} onCancel={() => void hook.cancel()} />
          </>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Agent page and route**

`src/pages/AgentPage.tsx`:
```tsx
import { useAgnoAgent } from '@rodrigocoliveira/agno-hooks'
import { useParams, useSearchParams } from 'react-router'
import { RunShell } from '../run/RunShell'
import { frontendTools } from '../tools/frontendTools'

export function AgentPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const agent = useAgnoAgent({ agentId: id, sessionId: params.get('session'), frontendTools })
  return <RunShell kind="agent" targetId={id} hook={agent} hint="Send a message to start a run." />
}
```

`src/routes.tsx`: add `import { AgentPage } from './pages/AgentPage'` and, before the settings route, `<Route path="agents/:id" element={<AgentPage />} />`.

- [ ] **Step 6: Verify**

```bash
bun run --filter demo-react typecheck && bun run --filter demo-react build
```
Expected: green.

Manual against `e2e/agentos` (no auth, endpoint `http://localhost:7778`): open `Test Agent`, send `hello` → a user bubble and `Echo: hello` streamed; the URL gains `?session=…`; the session list shows the new session; clicking "New session" clears it; sending `tool` pauses the run (`paused` badge, tool `add_one` marked `pending`) — the panel itself arrives in Task 7.

- [ ] **Step 7: Commit**

```bash
git add examples/demo-react
git commit -m "feat(demo): run rendering (RunShell, RunCard, StepList, Composer, sessions) and the agent page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `demo-react` HITL panel

**Files:**
- Replace: `examples/demo-react/src/pending/PendingPanel.tsx`
- Create: `examples/demo-react/src/pending/{ConfirmForm.tsx,UserInputForm.tsx,FeedbackForm.tsx,ApprovalNotice.tsx,ExternalToolCard.tsx,StepReviewForm.tsx,Panel.tsx}`

**Interfaces:**
- Consumes: `hook.pending`, `hook.continue`, `hook.resolveTool`, `hook.runTools`; helpers `isToolPending`, `confirm`, `reject`, `provideUserInput`, `provideUserFeedback`.
- Produces: `<PendingPanel hook />` (already mounted by `RunShell`).

- [ ] **Step 1: Panel frame and tool forms**

`src/pending/Panel.tsx`:
```tsx
import type { ReactNode } from 'react'

export function Panel({ title, error, children }: { title: string; error: string | null; children: ReactNode }) {
  return (
    <div className="space-y-3 border-b border-amber-200 bg-amber-50 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">{title}</div>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
```

`src/pending/ConfirmForm.tsx`:
```tsx
import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { confirm, reject } from '@rodrigocoliveira/agno-hooks'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

export function ConfirmForm({ tool, decided, onDecide }: { tool: ToolExecution; decided?: ToolExecution; onDecide: (t: ToolExecution) => void }) {
  return (
    <Card className="flex items-center gap-3 text-sm">
      <div className="flex-1">
        Run <code className="font-mono">{tool.tool_name}</code> with <code className="font-mono text-xs">{JSON.stringify(tool.tool_args ?? {})}</code>?
      </div>
      <Button variant={decided?.confirmed === true ? 'primary' : 'secondary'} onClick={() => onDecide(confirm(tool))}>Approve</Button>
      <Button variant={decided?.confirmed === false ? 'danger' : 'secondary'} onClick={() => onDecide(reject(tool, 'rejected by the user'))}>Reject</Button>
    </Card>
  )
}
```

`src/pending/UserInputForm.tsx`:
```tsx
import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { provideUserInput } from '@rodrigocoliveira/agno-hooks'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'

export function UserInputForm({ tool, decided, onDecide }: { tool: ToolExecution; decided?: ToolExecution; onDecide: (t: ToolExecution) => void }) {
  const fields = tool.user_input_schema ?? []
  return (
    <Card>
      <form
        className="space-y-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault()
          onDecide(provideUserInput(tool, Object.fromEntries(new FormData(e.currentTarget).entries())))
        }}
      >
        <div className="font-medium"><code className="font-mono">{tool.tool_name}</code> needs some details</div>
        {fields.map((f) => (
          <label key={f.name} className="block">
            <span className="text-xs text-neutral-600">{f.description || f.name}</span>
            <Input name={f.name} defaultValue={String(f.value ?? '')} required />
          </label>
        ))}
        <Button type="submit" variant={decided ? 'primary' : 'secondary'}>{decided ? 'Saved ✓' : 'Save'}</Button>
      </form>
    </Card>
  )
}
```

`src/pending/FeedbackForm.tsx`:
```tsx
import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { provideUserFeedback } from '@rodrigocoliveira/agno-hooks'
import { cn } from '../lib/cn'
import { Card } from '../ui/Card'

/** Native ask_user: one block per question; multi_select toggles, single select replaces. Answers accumulate on `decided`. */
export function FeedbackForm({ tool, decided, onDecide }: { tool: ToolExecution; decided?: ToolExecution; onDecide: (t: ToolExecution) => void }) {
  const base = decided ?? tool
  const chosen = (question: string) => base.user_feedback_schema?.find((q) => q.question === question)?.selected_options ?? []
  const pick = (question: string, label: string, multi: boolean) => {
    const current = chosen(question)
    const next = multi ? (current.includes(label) ? current.filter((l) => l !== label) : [...current, label]) : [label]
    onDecide(provideUserFeedback(base, { [question]: next }))
  }
  return (
    <Card className="space-y-3 text-sm">
      {(tool.user_feedback_schema ?? []).map((q) => (
        <div key={q.question}>
          <div className="font-medium">{q.header && <span className="text-neutral-500">{q.header} · </span>}{q.question}</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {(q.options ?? []).map((o) => (
              <button
                key={o.label}
                type="button"
                title={o.description ?? ''}
                onClick={() => pick(q.question, o.label, !!q.multi_select)}
                className={cn('rounded-full border px-3 py-1 text-xs', chosen(q.question).includes(o.label) ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white hover:bg-neutral-100')}
              >
                {o.label}
              </button>
            ))}
          </div>
          {q.multi_select && <div className="mt-1 text-xs text-neutral-400">pick one or more</div>}
        </div>
      ))}
    </Card>
  )
}
```

`src/pending/ApprovalNotice.tsx`:
```tsx
import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { Link } from 'react-router'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

export function ApprovalNotice({ tool, onRetry }: { tool: ToolExecution; onRetry: () => void }) {
  return (
    <Card className="flex items-center gap-3 text-sm">
      <div className="flex-1">
        <code className="font-mono">{tool.tool_name}</code> is waiting for an admin. Approval <code className="font-mono text-xs">{tool.approval_id}</code>.
        <div className="text-xs text-neutral-500">Switch to the <code>admin</code> token, resolve it in <Link className="underline" to="/approvals">Approvals</Link>, come back and continue.</div>
      </div>
      <Button variant="secondary" onClick={onRetry}>Continue</Button>
    </Card>
  )
}
```

`src/pending/ExternalToolCard.tsx`:
```tsx
import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { useState } from 'react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'

/** A tool the server expects the client to execute. Shown for hydrated pauses (no auto-run) or tools with no frontendTools entry. */
export function ExternalToolCard({ tool, onRunTools, onResolve }: { tool: ToolExecution; onRunTools: () => void; onResolve: (result: string) => void }) {
  const [value, setValue] = useState('')
  const [sent, setSent] = useState(false)
  return (
    <Card className="space-y-2 text-sm">
      <div><code className="font-mono">{tool.tool_name}</code> must be executed by this app.</div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onRunTools}>Run browser tools</Button>
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="or type a result" />
        <Button variant="secondary" disabled={!value} onClick={() => { onResolve(value); setSent(true) }}>{sent ? 'Recorded ✓' : 'Use result'}</Button>
      </div>
    </Card>
  )
}
```

`src/pending/StepReviewForm.tsx`:
```tsx
import type { StepRequirement } from '@rodrigocoliveira/agno-api'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'

/** A workflow step pause (HumanReview): confirmation or a small input form. Returns the decided StepRequirement. */
export function StepReviewForm({ requirement, onSubmit }: { requirement: StepRequirement; onSubmit: (r: StepRequirement) => void }) {
  if (requirement.requires_user_input) {
    const fields = requirement.user_input_schema ?? []
    return (
      <Card>
        <form className="space-y-2 text-sm" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...requirement, user_input: Object.fromEntries(new FormData(e.currentTarget).entries()) }) }}>
          <div className="font-medium">{requirement.user_input_message ?? `Step "${requirement.step_name}" needs input`}</div>
          {fields.map((f) => <label key={f.name} className="block"><span className="text-xs text-neutral-600">{f.description || f.name}</span><Input name={f.name} required /></label>)}
          <Button type="submit">Send</Button>
        </form>
      </Card>
    )
  }
  return (
    <Card className="flex items-center gap-3 text-sm">
      <div className="flex-1">{requirement.confirmation_message ?? `Run step "${requirement.step_name}"?`}</div>
      <Button onClick={() => onSubmit({ ...requirement, confirmed: true })}>Approve</Button>
      <Button variant="danger" onClick={() => onSubmit({ ...requirement, confirmed: false })}>Reject</Button>
    </Card>
  )
}
```

- [ ] **Step 2: PendingPanel**

`src/pending/PendingPanel.tsx`:
```tsx
import type { ToolExecution } from '@rodrigocoliveira/agno-api'
import { isToolPending, type AgnoHook, type Decision, type Kind } from '@rodrigocoliveira/agno-hooks'
import { useEffect, useState } from 'react'
import { messageOf } from '../lib/format'
import { Button } from '../ui/Button'
import { ApprovalNotice } from './ApprovalNotice'
import { ConfirmForm } from './ConfirmForm'
import { ExternalToolCard } from './ExternalToolCard'
import { FeedbackForm } from './FeedbackForm'
import { Panel } from './Panel'
import { StepReviewForm } from './StepReviewForm'
import { UserInputForm } from './UserInputForm'

/** Tools the user decides here. Approvals are resolved by an admin; external tools are recorded through resolveTool/runTools. */
const needsDecision = (t: ToolExecution) => isToolPending(t) && t.approval_type !== 'required' && !t.external_execution_required
const isDecided = (d?: ToolExecution) => !!d && (d.user_feedback_schema ? d.user_feedback_schema.every((q) => (q.selected_options?.length ?? 0) > 0) : true)

interface ToolFormProps { tool: ToolExecution; decided?: ToolExecution; onDecide: (t: ToolExecution) => void; onResolve: (r: string) => void; onRunTools: () => void; onRetryApproval: () => void }

function ToolForm({ tool, decided, onDecide, onResolve, onRunTools, onRetryApproval }: ToolFormProps) {
  if (tool.approval_type === 'required') return <ApprovalNotice tool={tool} onRetry={onRetryApproval} />
  if (tool.user_feedback_schema) return <FeedbackForm tool={tool} decided={decided} onDecide={onDecide} />
  if (tool.user_input_schema) return <UserInputForm tool={tool} decided={decided} onDecide={onDecide} />
  if (tool.requires_confirmation) return <ConfirmForm tool={tool} decided={decided} onDecide={onDecide} />
  if (tool.external_execution_required) return <ExternalToolCard tool={tool} onRunTools={onRunTools} onResolve={onResolve} />
  return null
}

export function PendingPanel<K extends Kind>({ hook }: { hook: AgnoHook<K> }) {
  const pending = hook.pending
  const [draft, setDraft] = useState<Record<string, ToolExecution>>({})
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setDraft({}); setError(null) }, [pending?.runId])
  if (!pending) return null

  const submit = async (decisions: Decision<K>[]) => {
    setError(null)
    try { await hook.continue(decisions) } catch (e) { setError(messageOf(e)) }
  }

  // Workflow step pause (HumanReview): decide the step itself, not a tool.
  const step = 'stepRequirements' in pending && pending.tools.length === 0 ? pending.stepRequirements.at(-1) : undefined
  if (step) {
    return (
      <Panel title={`Step "${step.step_name ?? step.step_id}" is waiting for you`} error={error}>
        <StepReviewForm requirement={step} onSubmit={(r) => void submit([r as Decision<K>])} />
      </Panel>
    )
  }

  const ready = pending.tools.every((t) => !needsDecision(t) || isDecided(draft[t.tool_call_id]))
  return (
    <Panel title="Waiting for you" error={error}>
      {pending.tools.map((t) => (
        <ToolForm
          key={t.tool_call_id}
          tool={t}
          decided={draft[t.tool_call_id]}
          onDecide={(d) => setDraft((prev) => ({ ...prev, [d.tool_call_id]: d }))}
          onResolve={(r) => hook.resolveTool(t.tool_call_id, r)}
          onRunTools={() => void hook.runTools()}
          onRetryApproval={() => void submit([])}
        />
      ))}
      {pending.tools.some(needsDecision) && (
        <Button disabled={!ready} onClick={() => void submit(Object.values(draft).filter(isDecided) as Decision<K>[])}>Continue</Button>
      )}
      {!pending.tools.some(needsDecision) && pending.tools.some((t) => t.external_execution_required) && (
        <Button onClick={() => void submit([])}>Continue with recorded results</Button>
      )}
    </Panel>
  )
}
```

- [ ] **Step 3: Verify**

```bash
bun run --filter demo-react typecheck && bun run --filter demo-react build
```

Manual against `e2e/agentos` (`Test Agent`):
- `tool` → panel with Approve/Reject for `add_one`; Approve then Continue → run completes with `Done after tool.`
- `ask` → question "Where do you run?" with `Trail`/`Road`; pick one, Continue → completes.
- `locate` → the browser asks for geolocation permission (live pause auto-runs `get_location`) and the run completes without the panel; reload during a hydrated pause instead shows the `ExternalToolCard` with "Run browser tools".
- `Test Workflow HITL`, any input → `Step "echo" is waiting for you`, Approve → completes.

- [ ] **Step 4: Commit**

```bash
git add examples/demo-react
git commit -m "feat(demo): HITL panel — confirmation, user input, ask_user, approvals, external tools, step review

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `demo-react` team and workflow pages

**Files:**
- Create: `examples/demo-react/src/pages/{TeamPage.tsx,WorkflowPage.tsx}`
- Modify: `examples/demo-react/src/routes.tsx`

- [ ] **Step 1: Pages**

`src/pages/TeamPage.tsx`:
```tsx
import { useAgnoTeam } from '@rodrigocoliveira/agno-hooks'
import { useParams, useSearchParams } from 'react-router'
import { RunShell } from '../run/RunShell'
import { frontendTools } from '../tools/frontendTools'

export function TeamPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const team = useAgnoTeam({ teamId: id, sessionId: params.get('session'), frontendTools })
  return <RunShell kind="team" targetId={id} hook={team} hint="Ask the team something. Member runs appear nested under the leader." />
}
```

`src/pages/WorkflowPage.tsx`:
```tsx
import { useAgnoWorkflow } from '@rodrigocoliveira/agno-hooks'
import { useParams, useSearchParams } from 'react-router'
import { RunShell } from '../run/RunShell'

export function WorkflowPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const workflow = useAgnoWorkflow({ workflowId: id, sessionId: params.get('session') })
  return <RunShell kind="workflow" targetId={id} hook={workflow} hint="Give the workflow its input. Each step shows up as it runs." />
}
```

`src/routes.tsx`: import both and add
```tsx
        <Route path="teams/:id" element={<TeamPage />} />
        <Route path="workflows/:id" element={<WorkflowPage />} />
```

- [ ] **Step 2: Verify**

```bash
bun run --filter demo-react typecheck && bun run --filter demo-react build
```
Manual against `e2e/agentos`: `Test Team` + `tool` → the leader delegates, the member run appears under "Members" with `add_one` pending, the panel offers Approve/Reject, Continue completes the team run. `Test Workflow` + `hi` → one step `echo` completed with `Echo: hi`.

- [ ] **Step 3: Commit**

```bash
git add examples/demo-react
git commit -m "feat(demo): team and workflow pages on the shared RunShell

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: `demo-react` Sessions and Approvals pages

**Files:**
- Create: `examples/demo-react/src/pages/{SessionsPage.tsx,ApprovalsPage.tsx}`
- Modify: `examples/demo-react/src/routes.tsx`

- [ ] **Step 1: Sessions**

`src/pages/SessionsPage.tsx`:
```tsx
import { AgnoApiError, type components } from '@rodrigocoliveira/agno-api'
import { useAgnoApi, type Kind } from '@rodrigocoliveira/agno-hooks'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { pathFor } from '../catalog'
import { cn } from '../lib/cn'
import { formatTime, messageOf, short } from '../lib/format'
import { Card } from '../ui/Card'
import { Empty } from '../ui/Empty'

type SessionRow = components['schemas']['SessionSchema']
const KINDS: Kind[] = ['agent', 'team', 'workflow']
const targetOf = (s: SessionRow, kind: Kind) => (kind === 'agent' ? s.agent_id : kind === 'team' ? s.team_id : s.workflow_id) ?? ''

/** Every session the active token can see. Under user isolation a user sees only their own; admin sees all. */
export function SessionsPage() {
  const api = useAgnoApi()
  const [kind, setKind] = useState<Kind>('agent')
  const [rows, setRows] = useState<SessionRow[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setError(null)
    api.sessions.list({ type: kind, limit: 100, sort_by: 'updated_at', sort_order: 'desc' })
      .then((res) => { if (alive) setRows(res.data ?? []) })
      .catch((e: unknown) => { if (alive) { setRows([]); setError(e instanceof AgnoApiError && e.status === 401 ? 'This OS requires a token (Settings).' : messageOf(e)) } })
    return () => { alive = false }
  }, [api, kind])

  return (
    <div className="h-full space-y-4 overflow-y-auto p-6">
      <div className="flex gap-1">
        {KINDS.map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cn('rounded-md px-3 py-1 text-sm', k === kind ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-200')}>{k}s</button>
        ))}
      </div>
      {error && <Card className="border-red-300 text-sm">{error}</Card>}
      {!error && rows.length === 0 && <Empty title={`No ${kind} sessions for this user`} />}
      {rows.length > 0 && (
        <Card className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500"><tr><th className="p-3">target</th><th>session</th><th>user</th><th>updated</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.session_id} className="border-t border-neutral-100">
                  <td className="p-3 font-mono text-xs">{targetOf(s, kind)}</td>
                  <td><Link className="underline" to={`${pathFor(kind, targetOf(s, kind))}?session=${s.session_id}`}>{s.session_name || short(s.session_id, 12)}</Link></td>
                  <td className="font-mono text-xs">{s.user_id ?? '–'}</td>
                  <td className="text-xs text-neutral-500">{formatTime(s.updated_at ?? s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Approvals**

`src/pages/ApprovalsPage.tsx`:
```tsx
import { AgnoApiError, type components } from '@rodrigocoliveira/agno-api'
import { useAgnoApi } from '@rodrigocoliveira/agno-hooks'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { formatTime, messageOf, short } from '../lib/format'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Empty } from '../ui/Empty'

type Approval = components['schemas']['ApprovalResponse']

/** Admin page: pending approvals across the OS. Non-admin tokens can list their own but get 403 on resolve. */
export function ApprovalsPage() {
  const api = useAgnoApi()
  const [rows, setRows] = useState<Approval[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api.approvals.list({ status: 'pending', limit: 100 })
      .then((res) => { setRows(res.data ?? []); setError(null) })
      .catch((e: unknown) => setError(messageOf(e)))
  }, [api])
  useEffect(load, [load])

  const resolve = async (id: string, status: 'approved' | 'rejected') => {
    try { await api.approvals.resolve(id, { status }); load() } catch (e) {
      setError(e instanceof AgnoApiError && e.status === 403 ? 'Only an admin can resolve approvals. Switch to the admin token in Settings.' : messageOf(e))
    }
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto p-6">
      {error && <Card className="border-red-300 text-sm">{error} <Link className="underline" to="/settings">Settings</Link></Card>}
      {rows.length === 0 && !error && <Empty title="No pending approvals">Trigger one with the <code>approval</code> agent as a user, then come back as admin.</Empty>}
      {rows.map((a) => (
        <Card key={a.id} className="flex items-center gap-4 text-sm">
          <div className="flex-1 space-y-1">
            <div><code className="font-mono">{a.tool_name}</code> <code className="font-mono text-xs text-neutral-500">{JSON.stringify(a.tool_args ?? {})}</code></div>
            <div className="text-xs text-neutral-500">
              by <b>{a.user_id ?? '–'}</b> · {a.agent_id ?? a.team_id ?? a.workflow_id} · run {short(a.run_id, 8)} · {formatTime(a.created_at)}
            </div>
          </div>
          <Button onClick={() => void resolve(a.id, 'approved')}>Approve</Button>
          <Button variant="danger" onClick={() => void resolve(a.id, 'rejected')}>Reject</Button>
        </Card>
      ))}
    </div>
  )
}
```

`src/routes.tsx`: import both and add
```tsx
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
```

- [ ] **Step 3: Verify**

```bash
bun run --filter demo-react typecheck && bun run --filter demo-react build
```
If `api.approvals.list({ status: 'pending', limit: 100 })` or `api.approvals.resolve(id, { status })` fails to typecheck, read `packages/agno-api/src/generated/openapi.d.ts` for the exact field names and adjust the call — do not cast to `any`.

Manual against `e2e/agentos`: `/sessions` lists the sessions created in Tasks 6–8, links open the right page with `?session=`; `/approvals` shows "No pending approvals".

- [ ] **Step 4: Commit**

```bash
git add examples/demo-react
git commit -m "feat(demo): sessions and approvals pages

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: CI, root README, package READMEs

**Files:**
- Modify: `.github/workflows/ci.yml`, `README.md`, `packages/agno-api/README.md`, `packages/agno-hooks/README.md`

- [ ] **Step 1: CI**

In job `ci`, after `- run: bun run test`, add:
```yaml
      - run: bun run --filter demo-react typecheck && bun run --filter demo-react build
      - uses: astral-sh/setup-uv@v5
        with:
          enable-cache: false
      - name: demo-agentos wires up without an LLM key
        run: |
          cd examples/demo-agentos
          uv sync
          uv run --python 3.12 python -c "import server; assert len(server.agent_os.agents) == 6"
          uv run --python 3.12 python tokens.py | python3 -c "import json,sys; d=json.load(sys.stdin); assert set(d)=={'admin','user-1','user-2'}"
```

- [ ] **Step 2: Root README**

Replace `README.md` with:
```markdown
# agno-frontend-sdk

Frontend SDK for [AgentOS v3](https://docs.agno.com) (`agno >= 3.0`).

| package | what |
|---|---|
| [`@rodrigocoliveira/agno-api`](packages/agno-api) | typed, stateless client for every AgentOS v3 route |
| [`@rodrigocoliveira/agno-hooks`](packages/agno-hooks) | session store + React hooks: agents, teams, workflows, HITL, frontend tools |

**Documentation:** [`guide/`](guide) — start with [getting started](guide/getting-started.md).

## Try the demo

A real AgentOS with agents, teams and workflows that exercise every feature, plus a React app
that shows each one. Needs an OpenAI key or a local Ollama model (details in
[`examples/demo-agentos`](examples/demo-agentos)).

```bash
bun install
OPENAI_API_KEY=sk-... bun run demo:server   # terminal 1 → http://localhost:7777
bun run demo:tokens                          # prints admin / user-1 / user-2 JWTs
bun run demo:web                             # terminal 2 → http://localhost:5173
```

In the app open **Settings**, import the tokens JSON and pick `user-1`. The Home page maps each
demo target to the feature it shows and to its guide chapter.

## Develop

```bash
bun run build && bun run typecheck && bun run test          # unit
AGNO_PORT=7778 bun run agentos                                # scripted E2E server (e2e/agentos)
AGNO_URL=http://localhost:7778 bun run test:e2e               # E2E, no API key needed
```
```

- [ ] **Step 3: Package READMEs**

`packages/agno-api/README.md`: keep everything; add after the first paragraph:
```markdown
Full documentation lives in [`guide/`](../../guide) — see [`guide/reference/agno-api.md`](../../guide/reference/agno-api.md).
```

`packages/agno-hooks/README.md`: replace everything after the `## Install` section with:
```markdown
## Quick start

```tsx
import { AgnoProvider, useAgnoAgent } from '@rodrigocoliveira/agno-hooks'

function App() {
  return (
    <AgnoProvider baseUrl="http://localhost:7777" token={() => localStorage.getItem('token') ?? undefined}>
      <Chat />
    </AgnoProvider>
  )
}

function Chat() {
  const chat = useAgnoAgent({ agentId: 'chat' })
  return (
    <>
      {chat.runs.map((run) => (
        <div key={run.id}>
          <p><b>you:</b> {run.input.message}</p>
          <p><b>agent:</b> {run.content}</p>
        </div>
      ))}
      <button disabled={chat.isBusy} onClick={() => chat.send('hi')}>Send</button>
    </>
  )
}
```

## Documentation

Everything else — sessions, background runs, human in the loop, frontend tools, teams, workflows,
errors, the store without React — is in [`guide/`](../../guide):
[agent](../../guide/agent.md) · [team](../../guide/team.md) · [workflow](../../guide/workflow.md) ·
[frontend tools](../../guide/frontend-tools.md) · [confirmation and input](../../guide/confirmation-and-input.md) ·
[approvals](../../guide/approvals.md) · [sessions and history](../../guide/sessions-and-history.md) ·
[reconnection](../../guide/reconnection.md) · [errors](../../guide/errors.md) ·
[reference](../../guide/reference/agno-hooks.md).

A complete app using every feature: [`examples/demo-react`](../../examples/demo-react).

## What is not here

- Session lists / sidebar hook ([#4](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/4)) — use `useAgnoApi()` + `api.sessions.list`.
- Approvals hook ([#5](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/5)) — `api.approvals.*`.
- A `send` queue ([#6](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/6)) — one active run per store.
- Fork / regenerate sugar ([#7](https://github.com/rodrigocoliveira/agno-frontend-sdk/issues/7)) — pass them in `continue`'s `extra`.
- UI components. Agno v2.

## License

MIT
```
(Keep the exact original text of the `## License` section if it differs.) The content removed here is ported into the guide chapters in Task 12; the implementer of this task must save the removed sections to `docs/superpowers/plans/_agno-hooks-readme-archive.md` (untracked is fine — add it to `.git/info/exclude`) so Task 12 can port them verbatim.

- [ ] **Step 4: Verify and commit**

```bash
grep -rn "examples/react\|examples/agentos" README.md packages/*/README.md; echo "exit=$?"
bun run --filter demo-react build
```
Expected: grep finds nothing (`exit=1`); build green.

```bash
git add .github/workflows/ci.yml README.md packages/agno-api/README.md packages/agno-hooks/README.md
git commit -m "docs: point READMEs at the demo and the guide; CI builds demo-react and imports demo-agentos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: `guide/` — index, getting started, concepts

**Files:**
- Create: `guide/README.md`, `guide/getting-started.md`, `guide/concepts/{runs.md,lifecycle.md,hitl.md,auth.md}`

**Rules for every guide file (also Tasks 12–13):** written in English; opens with one paragraph of context; every code block is either copied verbatim from `examples/demo-react/src` / `examples/demo-agentos` (say which file in the line above the block: `// examples/demo-react/src/pages/AgentPage.tsx`) or a ≤15-line adaptation of one; ends with `**See it in the demo:** ` + the route(s) when a screen exists. No feature is described that the lib does not have (check `packages/agno-hooks/src/types.ts`, `store.ts`, `hooks.ts`, `provider.tsx` when in doubt). Agno facts cite the source (`agno/os/scopes.py`, …) as the spec does.

- [ ] **Step 1: README (index)**

`guide/README.md`:
```markdown
# agno-frontend-sdk guide

Two packages for talking to [AgentOS v3](https://docs.agno.com) (`agno >= 3.0`) from the browser:

- **`@rodrigocoliveira/agno-api`** — a typed, stateless client: one function per route, streaming
  helpers, one error type. Use it alone for anything that is not a conversation (sessions lists,
  approvals, memory, knowledge, metrics).
- **`@rodrigocoliveira/agno-hooks`** — a session store and three React hooks (`useAgnoAgent`,
  `useAgnoTeam`, `useAgnoWorkflow`). Use it for the conversation itself: history, streaming,
  pauses (human in the loop), tools executed in the browser, reconnection.

The unit of state is the **run**, not the message — [concepts/runs.md](concepts/runs.md) explains why.

## Contents

| | |
|---|---|
| [Getting started](getting-started.md) | install, run the demo server and app, first conversation |
| **Concepts** | |
| [Runs](concepts/runs.md) | what a `Run` is and what it contains |
| [Lifecycle](concepts/lifecycle.md) | loading → ready, send, stream, paused, continue, terminal |
| [Human in the loop](concepts/hitl.md) | Agno's vocabulary: ToolExecution, RunRequirement, StepRequirement |
| [Auth](concepts/auth.md) | provider and token, user id in the JWT, scopes, user isolation |
| **Guides** | |
| [Agent](agent.md) | `useAgnoAgent` from zero: provider, hook, run list, composer |
| [Team](team.md) | member runs, `member_responses`, requirements coming from members |
| [Workflow](workflow.md) | steps, step pause and executor pause |
| [Frontend tools](frontend-tools.md) | `frontendTools`, auto-run, `resolveTool`, `runTools` |
| [Confirmation and input](confirmation-and-input.md) | `requires_confirmation`, `requires_user_input`, `ask_user` |
| [Approvals](approvals.md) | `@approval` on the server, 403 on continue, an admin page |
| [Sessions and history](sessions-and-history.md) | `sessionId`, hydration, listing sessions |
| [Files](files.md) | attaching files to `send` |
| [Reconnection](reconnection.md) | `background`, reload during a run, `resume` |
| [Errors](errors.md) | `AgnoApiError`, hook status `'error'`, per-run errors |
| **Reference** | |
| [agno-api](reference/agno-api.md) | `createAgnoApi`, config, signature rule, streaming, errors |
| [agno-hooks](reference/agno-hooks.md) | `AgnoProvider`, hooks, `Snapshot`, `Run*`, `Pending`, `Decision`, `FrontendTool` |
| [Demo map](demo.md) | which screen of `examples/demo-react` shows which chapter |
```

- [ ] **Step 2: Getting started**

`guide/getting-started.md` sections, in order:
1. **Install** — `bun add @rodrigocoliveira/agno-api @rodrigocoliveira/agno-hooks react` (peer `react >= 18`).
2. **Run the demo server** — copy the `## Run` section of `examples/demo-agentos/README.md` (OpenAI and Ollama variants, `tokens.py`).
3. **Run the demo app** — `bun run demo:web`, Settings → endpoint → Import JSON → pick `user-1`.
4. **Your first conversation** — the `Quick start` block from `packages/agno-hooks/README.md` (Task 10), followed by three sentences: the provider owns the connection, the hook owns one session, `send` starts a run that streams into `runs`.
5. **Where to go next** — link Agent, Concepts/Runs, Demo map.

- [ ] **Step 3: Concepts**

`guide/concepts/runs.md` — sections: *Why runs and not messages* (server stores runs, `GET /sessions/{id}/runs` for all three kinds, workflows have no chat history); *The `Run` shape* (paste `RunBase`, `AgentRun`, `TeamRun`, `StepRun`, `WorkflowRun` from `packages/agno-hooks/src/types.ts` and explain each field in one line); *`local`, `eventIndex`, `raw`*; *Rendering a run* (paste the `RunCard.tsx` body). See it: `/agents/chat`.

`guide/concepts/lifecycle.md` — sections: *Hook status* (`loading` only when a `sessionId` is given; `ready`; `error`); *Sending* (`send` accepts a string or `SendInput`; rejects while `isBusy` or loading, with the exact messages from `store.ts`); *Streaming* (events become `applyEvent` updates; clean end resolves; only thrown errors reconnect, 3 attempts 500/1000/2000 ms with `last_event_index`); *Paused and continue* (`pending`, `continue(decisions)`); *Terminal states* (`completed`, `cancelled`, `error`; `cancel` never rejects); *Background* (`background: true` default, what it means for a reload — link reconnection.md). Include a fenced text diagram:
```
send ──▶ running ──▶ completed
            │  ▲          
            │  └── continue ◀── paused ──▶ (admin approval)
            ├──▶ cancelled (cancel)
            └──▶ error (resume to retry)
```

`guide/concepts/hitl.md` — sections: *Agno's vocabulary* (`ToolExecution` = a tool call; `RunRequirement` wraps one on team pauses, with `member_*`; `StepRequirement` = a workflow pause with `pause_kind`); *The five ways a run pauses* (table: `requires_confirmation`, `requires_user_input`, `ask_user` / `user_feedback_schema`, `external_execution_required`, `approval_type: 'required'` → what the tool carries, what you send back, which helper: `confirm`/`reject`, `provideUserInput`, `provideUserFeedback`, `resolveTool`/frontend tools, nothing + `continue([])` after the admin); *Where decisions go on the wire* (agent `tools`, team `requirements`, workflow `step_requirements`, only the last one active — the store handles it); *Render pauses outside the chat* (paste `PendingPanel.tsx`'s `ToolForm` dispatch). See it: `/agents/confirm`, `/agents/interview`, `/agents/approval`, `/workflows/publish`.

`guide/concepts/auth.md` — sections: *Provider and token* (`token` string or function, read on every request; `onTokenExpired`); *One provider, one connection* (several hooks share it; remount the provider to switch users — paste `main.tsx`'s `Root`); *What the server reads from the JWT* (`sub` → `user_id`, `scopes`; `agno/os/middleware/jwt.py`); *Scopes* (paste `USER_SCOPES` from `auth.py`; `agent_os:admin`; `agno/os/scopes.py` route table for runs/sessions/approvals); *User isolation* (`AuthorizationConfig(user_isolation=True)`: sessions filtered by `sub`, `session_id` required on continue/resume/cancel for non-admins — the store sends it). See it: `/settings`, `/sessions`.

- [ ] **Step 4: Verify and commit**

```bash
ls guide guide/concepts
grep -L "See it in the demo" guide/concepts/*.md   # prints nothing: every concept page links a screen
```

```bash
git add guide
git commit -m "docs(guide): index, getting started and concepts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: `guide/` — practical chapters

**Files:**
- Create: `guide/{agent.md,team.md,workflow.md,frontend-tools.md,confirmation-and-input.md,approvals.md,sessions-and-history.md,files.md,reconnection.md,errors.md}`

**Source material:** the demo sources and `docs/superpowers/plans/_agno-hooks-readme-archive.md` (the sections removed from the agno-hooks README in Task 10: Sessions, Background runs and reload, Human in the loop, Frontend tools, Teams and workflows, Without React, Errors). Port their exact statements about behaviour; refresh their code to the demo's.

- [ ] **Step 1: agent.md, team.md, workflow.md**

`guide/agent.md` — *Provider* (`AgnoProvider` props: config props or `api`; paste `main.tsx`); *The hook* (`useAgnoAgent({ agentId, sessionId?, background?, frontendTools? })`; paste `AgentPage.tsx`); *Runs list* (paste `RunList.tsx`, mention auto-scroll); *Composer* (paste `Composer.tsx` `submit`; `send` rejects while busy — show the caught error); *Cancel*; *Metrics and raw* (`run.metrics`, `run.citations`, `run.raw`; paste `RawDrawer.tsx`). See it: `/agents/chat`, `/agents/tools`.

`guide/team.md` — *The hook* (paste `TeamPage.tsx`); *Member runs* (`TeamRun.members`, routed by `parent_run_id`; history rows with `parent_run_id` are grouped; paste `MemberRuns.tsx`); *`member_responses`* (on `TeamRunCompleted`, in `run.raw`; needs `store_member_responses=True` on the server — paste `teams/research.py`); *A pause coming from a member* (`requirements[].member_agent_id`; the store returns the whole `RunRequirement`; nothing to do in the UI beyond `PendingPanel`); *Frontend tools for members* (`field` team). See it: `/teams/support`, `/teams/research`, `/teams/field`.

`guide/workflow.md` — *The hook* (paste `WorkflowPage.tsx`; no `frontendTools` option); *Steps* (`WorkflowRun.steps`: flat, ordered by `index`; paste `StepList.tsx`; `Parallel`/`Condition` children as own steps — paste `workflows/report.py`); *Step pause* (`HumanReview(requires_confirmation=True)` → `pending.stepRequirements`, `pauseKind: 'step'`, `pending.tools` empty; decide with `{ ...active, confirmed }`; paste `StepReviewForm.tsx`); *Executor pause* (the step's agent paused: `pauseKind: 'executor'`, `pending.tools` are the agent's tools; decide them like an agent's); *Only the last requirement is active* (server accumulates; the store picks `.at(-1)`); *Background pauses* (`StepPaused` closes the stream before `WorkflowPaused`; the store refetches the row); *Foreground fallback* (409 "Retry without background"). See it: `/workflows/publish`, `/workflows/report`, `/workflows/nightly`.

- [ ] **Step 2: frontend-tools.md, confirmation-and-input.md, approvals.md**

`guide/frontend-tools.md` — *Declare on the server* (paste `tools/browser.py`); *Implement in the app* (`FrontendTool` type; paste `tools/frontendTools.ts`); *Auto-run rules* (live pauses only; parallel; a throw becomes `tool_call_error`; auto `continue([])` when everything resolved — port the archive's exact text); *Hydrated pauses* (`runTools(runId?)`; paste `ExternalToolCard.tsx`); *Manual results* (`resolveTool(id, result)` records without continuing). See it: `/agents/browser`, `/teams/field`.

`guide/confirmation-and-input.md` — *Confirmation* (server `@tool(requires_confirmation=True)` — paste `tools/billing.py` `send_invoice`; UI `ConfirmForm.tsx`; `confirm(tool, note?)`, `reject(tool, note?)`); *User input* (`@tool(requires_user_input=True, user_input_fields=[...])` — paste `tools/forms.py`; `user_input_schema[]`; `provideUserInput`; paste `UserInputForm.tsx`); *Ask user* (`UserFeedbackTools()`, `user_feedback_schema[{question, header, options, multi_select}]`, answer `selected_options`, answers persist in history; paste `FeedbackForm.tsx`); *Deciding several at once* (`PendingPanel` draft + one `continue`). See it: `/agents/confirm`, `/agents/interview`.

`guide/approvals.md` — *Server* (`@approval` + `@tool`; paste `issue_refund`); *What the run looks like* (`paused`, tool with `approval_type: 'required'` and `approval_id`; `continue([])` → 403 until resolved, `run.error` set, still `paused`); *Admin page* (paste `ApprovalsPage.tsx` `load` and `resolve`; scopes `approvals:read` / `approvals:write`; admin-only per `agno/os/routers/approvals/router.py`); *After resolution* (`continue([])`; paste `ApprovalNotice.tsx`). See it: `/agents/approval`, `/approvals`.

- [ ] **Step 3: sessions-and-history.md, files.md, reconnection.md, errors.md**

`guide/sessions-and-history.md` — *`sessionId` option* (null = new session; the hook exposes `sessionId` once learned; changing the prop switches session — the store registry rekeys, no refetch); *Keep it in the URL* (paste `RunShell.tsx`'s `useEffect`); *Hydration* (`GET /sessions/{id}/runs` → `fromRow`; a 404 "session" is an empty session; paused runs are refetched with `runs.get` for `requirements`; running runs are reattached with `resume`); *Listing sessions* (paste `SessionList.tsx` effect; `api.sessions.list({ type, component_id, sort_by, sort_order })`; the Sessions page for all targets). See it: any target's session list, `/sessions`.

`guide/files.md` — *Attach* (`send({ message, files })`, `files: (File | Blob)[]`, multipart; workflows take no files); *Show them* (`run.input.files` for local runs; paste the chips from `RunCard.tsx`); *Server side* (agent `chat`, `add_history_to_context`; OpenAI vision handles images/PDFs, Ollama depends on the model). See it: `/agents/chat`.

`guide/reconnection.md` — *`background: true`* (default; runs survive the tab); *Reload during a run* (hydration finds `RUNNING` → `resume` from the last index; a resume with no recorded index replays from the first event); *Reconnect on drop* (3 attempts 500/1000/2000 ms; `AgnoApiError.status === 0`; after that `status: 'error'`, `error: 'Connection lost'`, call `resume(run.id)` — paste the `resume` button from `RunCard.tsx`); *Cancel* (`cancel(runId?)` never rejects; local run aborted and marked `cancelled`); *Try it* (`tools` agent `slow_task`, `nightly` workflow). See it: `/agents/tools`, `/workflows/nightly`.

`guide/errors.md` — *`AgnoApiError`* (`status`, `body`, `status === 0` network drop); *Hook `status: 'error'`* (hydration failed; paste `LoadError` from `RunShell.tsx`); *Per-run `error`* (stream failure, failed cancel, failed refetch, 403 approval); *Usage errors thrown by `send`/`continue`* (`'A run is already active'`, `'Session is still loading'`, `'Tool <id> still pending'`, `'Step <id> still pending'`); *Stream ended before the run started*. See it: `/settings` with a wrong endpoint.

- [ ] **Step 4: Verify and commit**

```bash
ls guide/*.md | wc -l          # 11 (README + 10 chapters)
grep -L "See it in the demo" guide/*.md | grep -v README.md   # prints nothing
grep -rn "TODO\|TBD" guide; echo "exit=$?"                     # exit=1
```

```bash
git add guide
git commit -m "docs(guide): agent, team, workflow, frontend tools, HITL, approvals, sessions, files, reconnection, errors

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: `guide/` — reference and demo map

**Files:**
- Create: `guide/reference/{agno-api.md,agno-hooks.md}`, `guide/demo.md`

- [ ] **Step 1: agno-api reference**

`guide/reference/agno-api.md` — port from `packages/agno-api/README.md` (it stays the source of truth for now; the reference is the same content reorganised, not new claims): *createAgnoApi(config)* (`baseUrl`, `token`, `onTokenExpired`, `headers`, `fetch`, `params` — one paragraph each, with the 401 retry rule verbatim); *Signature rule* (`api.<group>[.<sub>].<op>(...pathParams, input?, options?)` with the README's examples); *Route families* (table: group → routes, from `packages/agno-api/src/routes/*.ts`: agents, teams, workflows, sessions, approvals, os, memories, learnings, knowledge, evals, metrics, databases, components …); *Forms and files*; *Streaming* (`create`/`continue` with `stream: true` return an async iterable of events; `resume`; how to cancel with `signal`); *Errors* (`AgnoApiError`, `ValidationErrorDetail`); *Types* (`components`, `paths`, hand-written run/HITL types).

- [ ] **Step 2: agno-hooks reference**

`guide/reference/agno-hooks.md` — one section per exported symbol of `packages/agno-hooks/src/index.ts`, each with the exact signature copied from the source and one paragraph:
`AgnoProvider` / `AgnoProviderProps`; `useAgnoApi`; `useAgnoAgent` / `useAgnoTeam` / `useAgnoWorkflow` and their option types; `AgnoHook<K>` (every method with its contract from `store.ts` comments: `send`, `continue`, `resolveTool`, `runTools`, `resume`, `cancel`, `store`); `Snapshot<K>`; `Run`, `AgentRun`, `TeamRun`, `WorkflowRun`, `StepRun`, `RunState`, `RunInput`, `RunMedia`; `Pending<K>`, `Decision<K>`, `SendInput<K>`, `ContinueExtra<K>`; `FrontendTool`; helpers `isToolPending`, `pendingTools`, `executorTools`, `resolveExecutorTools`, `confirm`, `reject`, `provideUserInput`, `provideUserFeedback`, `setExternalResult`; `createAgnoStore` / `AgnoStore` / `StoreOptions` (with the archive's "Without React" example); `fromServerStatus`, `isTerminal`.

- [ ] **Step 3: Demo map**

`guide/demo.md` — one table with a row per `CATALOG` entry of `examples/demo-react/src/catalog.ts`: route · server file · what it shows · chapters. Then a second table mapping the app's source folders to chapters (`run/` → agent/team/workflow, `pending/` → hitl chapters, `connection/` → auth, `sessions/` → sessions-and-history, `tools/` → frontend-tools). End with "Running against `e2e/agentos`" (no auth, four scripted targets and their triggers `ask`, `locate`, `tool`).

- [ ] **Step 4: Verify and commit**

```bash
# every symbol exported by agno-hooks is documented
for s in $(grep -oE '\b(useAgno[A-Za-z]+|AgnoProvider|useAgnoApi|createAgnoStore|isToolPending|pendingTools|executorTools|resolveExecutorTools|confirm|reject|provideUserInput|provideUserFeedback|setExternalResult|fromServerStatus|isTerminal)\b' packages/agno-hooks/src/index.ts | sort -u); do grep -q "$s" guide/reference/agno-hooks.md || echo "missing: $s"; done
# every catalog id appears in demo.md
for id in $(grep -oE "id: '[a-z]+'" examples/demo-react/src/catalog.ts | cut -d"'" -f2); do grep -q "\`$id\`" guide/demo.md || echo "missing: $id"; done
```
Expected: no `missing:` lines.

```bash
git add guide
git commit -m "docs(guide): agno-api and agno-hooks reference, demo map

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Full verification, manual checklist, PR

This task is run by the controller (not a subagent): it needs an OpenAI key or a local Ollama and a browser.

- [ ] **Step 1: Automated**

```bash
bun install --frozen-lockfile && bun run build && bun run typecheck && bun run test
bun run --filter demo-react typecheck && bun run --filter demo-react build
(cd examples/demo-agentos && uv sync && uv run --python 3.12 python -c "import server")
rm -f e2e/agentos/tmp/agentos.db; (cd e2e/agentos && AGNO_PORT=7778 uv run --python 3.12 python server.py &) ; sleep 8
AGNO_URL=http://localhost:7778 bun run test:e2e; pkill -f 'python server.py'
```
Expected: all green.

- [ ] **Step 2: Manual checklist (spec §7)**

Start `AGNO_PORT=7780 OPENAI_API_KEY=… bun run demo:server`, `bun run demo:tokens`, `bun run demo:web`; in Settings set endpoint `http://localhost:7780`, import the tokens, pick `user-1`. Walk the 15 items of spec section 7 and record each as ✅ / ❌ (with what happened) in a table. Any ❌ that is a lib bug gets a GitHub issue (`gh issue create`) and the issue number in the table; any ❌ that is a demo bug is fixed in this branch with its own commit before the PR.

If no key and no Ollama are available, the table says so and lists the items as "not run"; the PR body states it explicitly.

- [ ] **Step 3: PR**

```bash
git push -u origin feat/demo-and-guide
gh pr create --title "feat: demo-agentos, demo-react and guide/" --body-file /tmp/pr-body.md
```
`/tmp/pr-body.md` contains: summary (4 bullets: e2e move, demo server, demo app, guide), the spec link, the checklist table from Step 2, "How to run" (the root README block), and the footer `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

---

## Self-review notes (done while writing)

- Spec coverage: §2 → Task 1 (+10 for README); §3 → Tasks 2–4; §4 → Tasks 5–9; §5 → Tasks 11–13; §6 → Tasks 1 and 10; §7–8 → Task 14. Ruled adjustment: `StepList` flat (Global Constraints).
- Type consistency: `RunShell` props `{ kind, targetId, hook, hint }` used identically in Tasks 6 and 8; `PendingPanel({ hook })` stub (Task 6) and real (Task 7) share the signature; `frontendTools` map is imported by Agent and Team pages only; `Composer.onSend(message, files)` matches `RunShell.send`.
- Known risks to watch in review: `api.sessions.list` / `api.approvals.*` field names come from `docs/agentos-v3-openapi.json` (checked: `type`, `component_id`, `sort_by`, `sort_order`, `limit`; `status`, `limit`; resolve body `status`); react-router 7 `Link to="."` clears the query string inside a route element — if it does not in practice, use `to={pathFor(kind, targetId)}`; `Ollama`/`OpenAIChat` construction without a server or key must stay side-effect free for the CI import check (verified for agno 3.0.6).
