from __future__ import annotations

import logging
import time

from app.graph.state import AgentState
from app.graph.status import append_status_message
from app.models.schemas import VideoPlan
from app.services import groq

logger = logging.getLogger(__name__)


async def apply_direction_node(state: AgentState) -> AgentState:
    if not state.get("user_directions"):
        return append_status_message(state, "plan", "No direction provided; plan unchanged")

    direction = state["user_directions"][-1]
    state = append_status_message(state, "plan", f"Applying direction: '{direction[:60]}...'")
    logger.info(f"[apply_direction_node] Applying direction: {direction}")

    plan = state.get("plan")
    if plan is None:
        state["error"] = "Cannot apply direction without an existing plan"
        return append_status_message(state, "error", state["error"])

    start_time = time.time()
    try:
        revised_plan = await groq.apply_direction(plan, direction)

        duration = time.time() - start_time
        logger.info(f"[apply_direction_node] Plan revised in {duration:.2f}s")

        # If shot count changed, re-initialize shots to match revised plan
        existing_shots = state.get("shots", []) or []
        if len(revised_plan.shots) != len(existing_shots):
            shots = []
            for shot in revised_plan.shots:
                shots.append(
                    {
                        "index": shot.index,
                        "description": shot.description,
                        "duration_seconds": shot.duration_seconds,
                        "image_prompt": shot.image_prompt,
                        "motion_prompt": shot.motion_prompt,
                        "image_url": None,
                        "video_url": None,
                        "status": "pending",
                        "critique": None,
                        "retry_count": 0,
                    }
                )
            state["shots"] = shots
        else:
            # Update existing shots in place
            updated: list[dict] = []
            for i, shot in enumerate(revised_plan.shots):
                prev = existing_shots[i]
                updated.append(
                    {
                        "index": shot.index,
                        "description": shot.description,
                        "duration_seconds": shot.duration_seconds,
                        "image_prompt": shot.image_prompt,
                        "motion_prompt": shot.motion_prompt,
                        "image_url": prev.get("image_url"),
                        "video_url": prev.get("video_url"),
                        "status": prev.get("status", "pending"),
                        "critique": prev.get("critique"),
                        "retry_count": prev.get("retry_count", 0),
                    }
                )
            state["shots"] = updated

        state["plan"] = revised_plan
        state = append_status_message(state, "plan", "Plan revised")
        return state

    except Exception as e:
        duration = time.time() - start_time
        error_msg = f"Apply direction failed after {duration:.2f}s: {str(e)}"
        logger.error(f"[apply_direction_node] {error_msg}")
        state["error"] = error_msg
        state = append_status_message(state, "error", error_msg)
        return state