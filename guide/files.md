# Files

Agents and teams can take file attachments on `send`; workflows can't. This page covers attaching
files, showing them back in the run, and what the server does with them once they arrive.

## Attach

Pass a `files` array alongside `message` to `send` — an agent or team run accepts `(File | Blob)[]`:

```ts
// packages/agno-hooks/src/types.ts
export interface RunInput {
  message: string
  files: File[]
  media: unknown | null
}
```

```ts
// packages/agno-api/src/types/inputs.ts
export interface AgentRunInput extends RunInputBase {
  files?: (File | Blob)[]
  /** Sent as a JSON string when an object is given. */
  files_metadata?: string | Record<string, unknown> | null
}

export type WorkflowRunInput = RunInputBase
```

`WorkflowRunInput` has no `files` field at all — a workflow's input is whatever its own input
schema declares, not a chat message with attachments. Whenever the body includes at least one
`File`/`Blob`, `agno-api` encodes the request as `multipart/form-data` instead of JSON
automatically; you don't pick the encoding yourself. `RunShell`'s `send` wrapper only adds `files`
to the `SendInput` object when there are any to attach:

```tsx
// examples/demo-react/src/run/RunShell.tsx
const send = (message: string, files: File[], background: boolean) =>
  hook.send({ message, background, ...(files.length > 0 ? { files } : {}) } as SendInput<K>)
```

## Show them

`run.input.files` holds the `File` objects for a run this client created locally — a run hydrated
from history has no `File` instances to show (only what the server persisted about it), so file
chips only render for runs sent in the current session. `RunCard` renders them as small chips next
to the message bubble:

```tsx
// examples/demo-react/src/run/RunCard.tsx
{(run.input.message || run.input.files.length > 0) && (
  <div className="ml-auto max-w-[75%] rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white">
    {run.input.message}
    {run.input.files.map((f) => <div key={f.name} className="mt-1 flex items-center gap-1 text-xs opacity-80"><Paperclip size={12} />{f.name}</div>)}
  </div>
)}
```

## Server side

The `chat` agent is what the demo's `/agents/chat` page attaches files to. `add_history_to_context`
means the model sees earlier turns of the same session, files included:

```python
# examples/demo-agentos/agents/chat.py
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

What the model actually does with an attached file depends on the underlying provider: OpenAI's
vision-capable models handle images and PDFs directly, while an Ollama model's ability to see a
file depends entirely on whether that particular model supports vision at all.

**See it in the demo:** `/agents/chat`
