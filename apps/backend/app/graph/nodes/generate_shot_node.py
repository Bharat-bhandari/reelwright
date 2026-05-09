from __future__ import annotations

import asyncio

from app.graph.state import AgentState, ShotState
from app.graph.status import append_status_message


async def generate_shot_node(state: AgentState) -> AgentState:
    updated_shots: list[ShotState] = []

    for shot in state.get("shots", []):
        shot_index = shot["index"]
        description = shot["description"]
        state = append_status_message(state, "generate", f"Generating shot {shot_index}: {description}")

        shot = {**shot, "status": "generating_image"}
        updated_shots.append(shot)
        state["shots"] = [*updated_shots, *state.get("shots", [])[len(updated_shots) :]]
        await asyncio.sleep(1)

        shot = {
            **shot,
            "image_url": f"https://cdn.example.com/reelwright/{state['thread_id']}/shot-{shot_index}.jpg",
            "status": "generating_video",
        }
        updated_shots[-1] = shot
        state["shots"] = [*updated_shots, *state.get("shots", [])[len(updated_shots) :]]
        await asyncio.sleep(1)

        shot = {
            **shot,
            "video_url": f"https://cdn.example.com/reelwright/{state['thread_id']}/shot-{shot_index}.mp4",
            "status": "done",
        }
        updated_shots[-1] = shot
        state["shots"] = [*updated_shots, *state.get("shots", [])[len(updated_shots) :]]

    return state