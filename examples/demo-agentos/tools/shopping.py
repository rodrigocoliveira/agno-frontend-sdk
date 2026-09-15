"""Two tools that mutate `session_state["items"]` directly, alongside the frontend's +/- buttons.

`session_state` reaches a tool through `run_context: RunContext` (not a bare `session_state`
parameter — see agno/tools/function.py's `_build_entrypoint_args`, which only injects params named
`agent`, `team`, `run_context`, `fc`, the media lists, and their `_agno_`-prefixed twins, plus
anything type-annotated as `Agent`/`Team`/`RunContext`). `run_context.session_state` is the same
dict the run keeps live, passed by reference, so mutating it in place is what persists it — no
return value or setter call needed. It is also exactly what ends up on the `session_state` field of
the run's terminal event, which is what the frontend's `sessionState` mirrors.
"""

from uuid import uuid4

from agno.run import RunContext
from agno.tools import tool


@tool
def add_item(run_context: RunContext, name: str, qty: int = 1) -> str:
    """Add `name` to the shopping list, or increase its quantity by `qty` if already on it."""
    if run_context.session_state is None:
        run_context.session_state = {}
    items = run_context.session_state.setdefault("items", [])
    for item in items:
        if item["name"].lower() == name.lower():
            item["qty"] += qty
            return f"{item['name']}: now {item['qty']}."
    items.append({"id": str(uuid4()), "name": name, "qty": qty})
    return f"Added {name} (x{qty})."


@tool
def remove_item(run_context: RunContext, name: str) -> str:
    """Remove the item named `name` (case-insensitive) from the shopping list."""
    if run_context.session_state is None:
        run_context.session_state = {}
    items = run_context.session_state.get("items", [])
    match = next((i for i in items if i["name"].lower() == name.lower()), None)
    if match is None:
        return f"No item named {name} on the list."
    run_context.session_state["items"] = [i for i in items if i is not match]
    return f"Removed {match['name']}."
