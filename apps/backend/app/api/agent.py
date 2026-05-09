from __future__ import annotations

import asyncio
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.graph.graph import graph
from app.graph.nodes import apply_direction_node
from app.graph.state import AgentState
from app.graph.status import subscribe, unsubscribe

router = APIRouter()


class RunRequest(BaseModel):
    url: str


class ResumeRequest(BaseModel):
    patch: dict | None = None


class DirectionRequest(BaseModel):
    direction: str


async def _run_graph_until_interrupt_or_end(thread_id: str, initial_state: AgentState | None) -> None:
    config = {"configurable": {"thread_id": thread_id}}
    async for _ in graph.astream(initial_state, config, stream_mode="updates"):
        pass


@router.post("/run")
async def run_agent(request: RunRequest, background_tasks: BackgroundTasks):
    thread_id = str(uuid4())
    initial_state: AgentState = {
        "thread_id": thread_id,
        "url": request.url,
        "scrape": None,
        "plan": None,
        "user_directions": [],
        "shots": [],
        "voiceover_url": None,
        "final_video_url": None,
        "status_messages": [],
        "error": None,
    }
    background_tasks.add_task(_run_graph_until_interrupt_or_end, thread_id, initial_state)
    return {"thread_id": thread_id, "status": "running"}


@router.get("/state/{thread_id}")
async def get_agent_state(thread_id: str):
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = await graph.aget_state(config)
    if snapshot.values is None:
        raise HTTPException(status_code=404, detail="Thread state not found")

    return {
        "thread_id": thread_id,
        "next": list(snapshot.next),
        "state": jsonable_encoder(snapshot.values),
    }


@router.post("/resume/{thread_id}")
async def resume_agent(
    thread_id: str,
    background_tasks: BackgroundTasks,
    request: ResumeRequest | None = None,
):
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = await graph.aget_state(config)
    if snapshot.values is None:
        raise HTTPException(status_code=404, detail="Thread state not found")

    if request and request.patch:
        await graph.aupdate_state(config, request.patch)

    background_tasks.add_task(_run_graph_until_interrupt_or_end, thread_id, None)
    return {"thread_id": thread_id, "status": "resumed"}


@router.post("/direct/{thread_id}")
async def direct_agent(thread_id: str, request: DirectionRequest):
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = await graph.aget_state(config)
    if snapshot.values is None:
        raise HTTPException(status_code=404, detail="Thread state not found")

    state: AgentState = snapshot.values
    directions = [*state.get("user_directions", []), request.direction]
    state["user_directions"] = directions

    updated_state = await apply_direction_node(state)
    await graph.aupdate_state(
        config,
        {
            "plan": updated_state.get("plan"),
            "user_directions": updated_state.get("user_directions", []),
            "status_messages": updated_state.get("status_messages", []),
            "error": updated_state.get("error"),
        },
    )

    return {
        "thread_id": thread_id,
        "plan": jsonable_encoder(updated_state.get("plan")),
        "status_messages": jsonable_encoder(updated_state.get("status_messages", [])),
    }


@router.get("/stream/{thread_id}")
async def stream_agent(thread_id: str):
    config = {"configurable": {"thread_id": thread_id}}

    async def event_generator():
        queue = subscribe(thread_id)
        seen: set[tuple[str, str, str]] = set()

        async def emit_unseen_from_state(state_values: dict | None):
            if not state_values:
                return
            for message in state_values.get("status_messages", []):
                key = (
                    str(message.get("timestamp", "")),
                    str(message.get("type", "")),
                    str(message.get("message", "")),
                )
                if key in seen:
                    continue
                seen.add(key)
                yield {
                    "event": "status",
                    "data": jsonable_encoder(message),
                }

        try:
            snapshot = await graph.aget_state(config)
            async for event in emit_unseen_from_state(snapshot.values):
                yield event

            if snapshot.values and snapshot.values.get("final_video_url"):
                yield {
                    "event": "complete",
                    "data": jsonable_encoder({"final_video_url": snapshot.values["final_video_url"]}),
                }
                return

            while True:
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=1.0)
                    key = (
                        str(message.get("timestamp", "")),
                        str(message.get("type", "")),
                        str(message.get("message", "")),
                    )
                    if key not in seen:
                        seen.add(key)
                        yield {
                            "event": "status",
                            "data": jsonable_encoder(message),
                        }
                except TimeoutError:
                    pass

                latest_snapshot = await graph.aget_state(config)
                async for event in emit_unseen_from_state(latest_snapshot.values):
                    yield event
                if latest_snapshot.values and latest_snapshot.values.get("final_video_url"):
                    yield {
                        "event": "complete",
                        "data": jsonable_encoder(
                            {"final_video_url": latest_snapshot.values.get("final_video_url")}
                        ),
                    }
                    break
        finally:
            unsubscribe(thread_id, queue)

    return EventSourceResponse(event_generator())