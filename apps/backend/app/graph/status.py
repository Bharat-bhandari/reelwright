from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from app.graph.state import AgentState, StatusMessage

# Hackathon-grade in-memory pub/sub. Single-process only.
_subscribers: dict[str, list[asyncio.Queue[StatusMessage]]] = {}


def subscribe(thread_id: str) -> asyncio.Queue[StatusMessage]:
    queue: asyncio.Queue[StatusMessage] = asyncio.Queue()
    _subscribers.setdefault(thread_id, []).append(queue)
    return queue


def unsubscribe(thread_id: str, queue: asyncio.Queue[StatusMessage]) -> None:
    queues = _subscribers.get(thread_id)
    if not queues:
        return

    try:
        queues.remove(queue)
    except ValueError:
        return

    if not queues:
        _subscribers.pop(thread_id, None)


def publish(thread_id: str, message: StatusMessage) -> None:
    for queue in _subscribers.get(thread_id, []):
        queue.put_nowait(message)


def append_status_message(state: AgentState, message_type: str, message_text: str) -> AgentState:
    status_message: StatusMessage = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": message_type,
        "message": message_text,
    }

    messages = [*state.get("status_messages", []), status_message]
    updated_state: AgentState = {
        **state,
        "status_messages": messages,
    }

    publish(state["thread_id"], status_message)
    return updated_state