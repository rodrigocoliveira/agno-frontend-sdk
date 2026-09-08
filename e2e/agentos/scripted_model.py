"""ScriptedModel: a deterministic agno Model with no API key.

Rules (looked up from the last user message, case-insensitive):
- contains "ask"    -> call `ask_user` with one question ("Where do you run?", options Trail/Road)
- contains "locate" -> call `get_location` (an external_execution tool: the frontend runs it)
- contains "tool"   -> call `add_one(x=41)` (a requires_confirmation tool)
- otherwise         -> answer "Echo: <message>" (streamed word by word)

A team leader (a model that sees `delegate_task_to_member`) always delegates to
`delegate_to` first. After any tool result the answer is "Done after tool."
"""
import json
import uuid
from dataclasses import dataclass
from typing import Any, AsyncIterator, Iterator, List, Optional

from agno.models.base import Model
from agno.models.message import Message
from agno.models.response import ModelResponse


@dataclass
class ScriptedModel(Model):
    id: str = "scripted"
    name: str = "ScriptedModel"
    provider: str = "scripted"
    delegate_to: str = "test-agent"  # member id used when the leader gets delegate_task_to_member

    def _plan(self, messages: List[Message], tools: Optional[List[dict]]):
        last_user = next((m for m in reversed(messages) if m.role == "user"), None)
        text = str(last_user.content) if last_user and last_user.content else ""
        low = text.lower()
        has_tool_result = any(m.role == "tool" for m in messages)
        names = [(t.get("function") or t).get("name") for t in (tools or [])]
        if "delegate_task_to_member" in names and not has_tool_result:
            return "tool", ("delegate_task_to_member", {"member_id": self.delegate_to, "task": text})
        if tools and not has_tool_result:
            if "ask" in low and "ask_user" in names:
                return "tool", ("ask_user", {"questions": [{
                    "header": "Use", "question": "Where do you run?",
                    "options": [{"label": "Trail", "description": "Off road"}, {"label": "Road"}], "multi_select": False,
                }]})
            if "locate" in low and "get_location" in names:
                return "tool", ("get_location", {})
            if "tool" in low:
                fn = "add_one" if "add_one" in names else next(n for n in names if n != "delegate_task_to_member")
                return "tool", (fn, {"x": 41})
        return "text", ("Done after tool." if has_tool_result else f"Echo: {text}")

    def _tool_call(self, call) -> dict:
        fn, args = call
        return {"id": f"call_{uuid.uuid4().hex[:8]}", "type": "function", "function": {"name": fn, "arguments": json.dumps(args)}}

    def invoke(self, messages, assistant_message=None, response_format=None, tools=None,
               tool_choice=None, run_response=None, compress_tool_results=False) -> ModelResponse:
        kind, payload = self._plan(messages, tools)
        if kind == "tool":
            return ModelResponse(role="assistant", content=None, tool_calls=[self._tool_call(payload)])
        return ModelResponse(role="assistant", content=payload)

    async def ainvoke(self, **kwargs) -> ModelResponse:
        return self.invoke(**kwargs)

    def invoke_stream(self, messages, assistant_message=None, response_format=None, tools=None,
                      tool_choice=None, run_response=None, compress_tool_results=False) -> Iterator[ModelResponse]:
        kind, payload = self._plan(messages, tools)
        if kind == "tool":
            yield ModelResponse(role="assistant", tool_calls=[self._tool_call(payload)])
            return
        for word in payload.split(" "):
            yield ModelResponse(role="assistant", content=word + " ")

    async def ainvoke_stream(self, **kwargs) -> AsyncIterator[ModelResponse]:
        for r in self.invoke_stream(**kwargs):
            yield r

    def _parse_provider_response(self, response: Any, **kwargs) -> ModelResponse:
        return response

    def _parse_provider_response_delta(self, response: Any) -> ModelResponse:
        return response
