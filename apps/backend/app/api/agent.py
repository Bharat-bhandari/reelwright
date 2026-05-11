from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from app.graph.graph import graph
from app.graph.nodes import apply_direction_node
from app.graph.state import AgentState
from app.graph.status import publish, subscribe, unsubscribe
from app.models.schemas import ScrapeData, VideoPlan

router = APIRouter()


class RunRequest(BaseModel):
    url: str


class ResumeRequest(BaseModel):
    patch: dict | None = None


class DirectionRequest(BaseModel):
    direction: str


class DeleteImageRequest(BaseModel):
    image_url: str


class RegenerateShotRequest(BaseModel):
    shot_index: int
    instruction: str


async def _run_graph_until_interrupt_or_end(thread_id: str, initial_state: AgentState | None) -> None:
    config = {"configurable": {"thread_id": thread_id}}
    try:
        async for _ in graph.astream(initial_state, config, stream_mode="updates"):
            pass
    except Exception as exc:  # noqa: BLE001
        # Persist the crash into graph state so the SSE stream can surface it
        try:
            await graph.aupdate_state(config, {"error": str(exc)})
        except Exception:  # noqa: BLE001
            pass  # If state update also fails, the SSE loop will time-out naturally


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
            "shots": updated_state.get("shots", []),
            "status_messages": updated_state.get("status_messages", []),
            "error": updated_state.get("error"),
        },
    )

    return {
        "thread_id": thread_id,
        "plan": jsonable_encoder(updated_state.get("plan")),
        "status_messages": jsonable_encoder(updated_state.get("status_messages", [])),
    }


@router.post("/edit-scrape/{thread_id}/delete-image")
async def delete_scrape_image(thread_id: str, request: DeleteImageRequest):
    """Remove a single image URL from state.scrape.product_images.

    Only valid when graph is paused at the plan_node interrupt
    (i.e., scrape is done, user is reviewing before planning).
    """
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = await graph.aget_state(config)
    if snapshot.values is None:
        raise HTTPException(404, "Thread not found")

    # Guard: only allow editing scrape before plan_node runs
    if "plan_node" not in snapshot.next:
        raise HTTPException(
            409,
            f"Cannot edit scrape — graph is past the scrape review interrupt (next={list(snapshot.next)})",
        )

    scrape = snapshot.values.get("scrape")
    if not scrape:
        raise HTTPException(409, "No scrape data to edit")

    # ScrapeData is a Pydantic model — convert to dict, mutate, validate back
    scrape_dict = scrape.model_dump() if hasattr(scrape, "model_dump") else dict(scrape)
    original_count = len(scrape_dict.get("product_images", []))
    scrape_dict["product_images"] = [
        url for url in scrape_dict.get("product_images", [])
        if url != request.image_url
    ]
    new_count = len(scrape_dict["product_images"])

    if new_count == original_count:
        raise HTTPException(404, "Image URL not found in product_images")

    updated_scrape = ScrapeData.model_validate(scrape_dict)

    msg = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": "scrape",
        "message": f"Removed 1 image ({original_count} → {new_count} remaining)",
    }
    publish(thread_id, msg)

    current_messages = snapshot.values.get("status_messages", [])
    await graph.aupdate_state(config, {
        "scrape": updated_scrape,
        "status_messages": current_messages + [msg],
    })

    return {
        "thread_id": thread_id,
        "product_images": updated_scrape.product_images,
        "remaining_count": new_count,
    }


@router.post("/regenerate-shot-prompt/{thread_id}")
async def regenerate_shot_prompt(thread_id: str, request: RegenerateShotRequest):
    """Regenerate a single shot's prompts via LLM, based on user instruction.

    Only valid when graph is paused at the generate_shot_node interrupt
    (i.e., plan is done, user is reviewing before generation).
    """
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = await graph.aget_state(config)
    if snapshot.values is None:
        raise HTTPException(404, "Thread not found")

    # Guard: only allow regeneration before generate_shot_node runs
    if "generate_shot_node" not in snapshot.next:
        raise HTTPException(
            409,
            f"Cannot regenerate shot prompt — graph is past the plan review interrupt (next={list(snapshot.next)})",
        )

    plan = snapshot.values.get("plan")
    shots_state = snapshot.values.get("shots", [])

    if not plan:
        raise HTTPException(409, "No plan available to edit")

    plan_dict = plan.model_dump() if hasattr(plan, "model_dump") else dict(plan)
    plan_shots = plan_dict.get("shots", [])

    target_plan_shot = next(
        (s for s in plan_shots if s.get("index") == request.shot_index),
        None,
    )
    if not target_plan_shot:
        raise HTTPException(404, f"Shot {request.shot_index} not found in plan")

    from app.services.groq import regenerate_shot_prompts

    scrape = snapshot.values.get("scrape")
    revised = await regenerate_shot_prompts(
        shot=target_plan_shot,
        instruction=request.instruction,
        scrape_data=scrape,
    )

    for s in plan_shots:
        if s.get("index") == request.shot_index:
            s["description"] = revised["description"]
            s["image_prompt"] = revised["image_prompt"]
            s["motion_prompt"] = revised["motion_prompt"]
            break

    updated_plan = VideoPlan.model_validate(plan_dict)

    updated_shots = []
    for s in shots_state:
        if s.get("index") == request.shot_index:
            updated_shots.append({
                **s,
                "description": revised["description"],
                "image_prompt": revised["image_prompt"],
                "motion_prompt": revised["motion_prompt"],
            })
        else:
            updated_shots.append(s)

    msg = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "type": "plan",
        "message": f"Revised shot {request.shot_index} prompts: {request.instruction[:60]}",
    }
    publish(thread_id, msg)

    current_messages = snapshot.values.get("status_messages", [])
    await graph.aupdate_state(config, {
        "plan": updated_plan,
        "shots": updated_shots,
        "status_messages": current_messages + [msg],
    })

    return {
        "thread_id": thread_id,
        "shot_index": request.shot_index,
        "description": revised["description"],
        "image_prompt": revised["image_prompt"],
        "motion_prompt": revised["motion_prompt"],
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
                    "data": json.dumps(jsonable_encoder(message)),
                }

        try:
            snapshot = await graph.aget_state(config)
            async for event in emit_unseen_from_state(snapshot.values):
                yield event

            if snapshot.values and snapshot.values.get("final_video_url"):
                yield {
                    "event": "complete",
                    "data": json.dumps(jsonable_encoder({"final_video_url": snapshot.values["final_video_url"]})),
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
                            "data": json.dumps(jsonable_encoder(message)),
                        }
                except TimeoutError:
                    pass

                latest_snapshot = await graph.aget_state(config)
                async for event in emit_unseen_from_state(latest_snapshot.values):
                    yield event

                state_vals = latest_snapshot.values or {}

                # Terminal: graph finished successfully
                if state_vals.get("final_video_url"):
                    yield {
                        "event": "complete",
                        "data": json.dumps(jsonable_encoder(
                            {"final_video_url": state_vals["final_video_url"]}
                        )),
                    }
                    break

                # Terminal: graph crashed (error set, nothing left to run)
                if state_vals.get("error") and not list(latest_snapshot.next):
                    yield {
                        "event": "error",
                        "data": json.dumps(jsonable_encoder({"error": state_vals["error"]})),
                    }
                    break
        finally:
            unsubscribe(thread_id, queue)

    return EventSourceResponse(event_generator())