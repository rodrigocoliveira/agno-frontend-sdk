# Team

`useAgnoTeam` looks exactly like `useAgnoAgent` from the outside — same snapshot shape, same
`send`/`continue`/`cancel` — but every run it drives can fan out into member runs, and a pause can
come from a member instead of the team leader itself. This page covers what changes: the member
runs, `member_responses`, and how a member's pause surfaces through the same `pending` field.

## The hook

`useAgnoTeam({ teamId, sessionId?, background?, frontendTools? })` has the identical shape to
`useAgnoAgent`, `frontendTools` included — a team member can pause on a browser tool just like an
agent can (see [frontend-tools.md](frontend-tools.md)):

```tsx
// examples/demo-react/src/pages/TeamPage.tsx
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

`RunShell` is the same component `agent.md` walks through — a `TeamRun` renders through the same
`RunCard`, it just has more to show.

## Member runs

A `TeamRun` carries its members as `AgentRun[]`:

```ts
// packages/agno-hooks/src/types.ts
export interface TeamRun extends RunBase { kind: 'team'; teamId: string; members: AgentRun[] }
```

Live, each member's own SSE events (a `run_id` other than the team run's, carrying the team run as
its `parent_run_id`) are applied to that member's own `AgentRun` inside `members`. Hydrated from
history, `GET /sessions/{id}/runs` returns team rows and member rows in one flat list; the store
groups them by `parent_run_id` — a row with none is a team run, a row that has one is nested under
its parent's `members`. `RunCard` renders them with `MemberRuns`:

```tsx
// examples/demo-react/src/run/MemberRuns.tsx
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

## `member_responses`

On `TeamRunCompleted`, AgentOS can attach every member's final output as `member_responses` — the
store doesn't parse it, but it lands on `run.raw` the same way the whole `RunCompleted` event does,
so `run.raw.member_responses` is there once the run finishes. This only happens when the team turns
it on:

```python
# examples/demo-agentos/teams/research.py
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

Without `store_member_responses=True` the team still runs its members and shows their output
through `members` as they stream, but `member_responses` on the completed event stays absent.

## A pause coming from a member

When a member's tool needs a decision, the pause still shows up as `hook.pending` on the team run —
but the wire shape wraps the member's `ToolExecution` in a `RunRequirement`, which carries which
member it came from:

```ts
// packages/agno-api/src/types/hitl.ts
export interface RunRequirement {
  id: string
  tool_execution: ToolExecution
  created_at?: number
  confirmation?: boolean | null
  confirmation_note?: string | null
  user_input_schema?: UserInputField[] | null
  user_feedback_schema?: UserFeedbackQuestion[] | null
  external_execution_result?: string | null
  member_agent_id?: string | null
  member_agent_name?: string | null
  member_run_id?: string | null
}
```

The store already unwraps this: `chat.pending!.tools` is a flat list of `ToolExecution`s regardless
of whether they came from `requirements[]` (a team pause) or the team's own `tools` (an agent
pause), so there is nothing extra to render — the same `PendingPanel` from
[concepts/hitl.md](concepts/hitl.md) handles a member's confirmation exactly like the leader's.
`support`'s billing member is this in practice: `send_invoice` is `requires_confirmation`, called
by the `Billing` member, and it pauses the whole team run the same way an agent's own tool would.

## Frontend tools for members

A member can also pause on a browser tool, and it runs the same way an agent's does — the
`external_execution_required` requirement travels up through the team run to `chat.pending`, and a
matching entry in `frontendTools` runs automatically for a live pause:

```python
# examples/demo-agentos/teams/field.py
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

**See it in the demo:** `/teams/support`, `/teams/research`, `/teams/field`
