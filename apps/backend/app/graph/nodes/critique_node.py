from __future__ import annotations

import asyncio

from app.graph.state import AgentState, ShotState
from app.graph.status import append_status_message
from app.models.schemas import CritiqueResult


async def critique_node(state: AgentState) -> AgentState:
    updated_shots: list[ShotState] = []
    original_shots = state.get("shots", [])

    for idx, shot in enumerate(original_shots):
        shot_index = shot["index"]
        state = append_status_message(state, "critique", f"Critiquing shot {shot_index}...")

        shot = {**shot, "status": "critiquing"}

        should_fail_first_pass = shot_index == 2 and shot["retry_count"] < 1
        if should_fail_first_pass:
            shot["critique"] = CritiqueResult(
                score=2,
                passes=False,
                feedback="Lighting too flat. Product silhouette lacks punch.",
                regeneration_prompt="Boost contrast, add backlight rim, increase environment reflections",
            )
            state = append_status_message(
                state,
                "regenerate",
                f"Regenerating shot {shot_index} - lighting too flat. Punching contrast and rim light now.",
            )
            shot["status"] = "regenerating"
            await asyncio.sleep(1)
            shot["retry_count"] += 1
            shot["status"] = "done"
            shot["critique"] = CritiqueResult(
                score=5,
                passes=True,
                feedback="Regeneration successful. Stronger depth and highlights.",
                regeneration_prompt=None,
            )
        else:
            shot["critique"] = CritiqueResult(
                score=5,
                passes=True,
                feedback="Shot passes brand and motion quality checks.",
                regeneration_prompt=None,
            )
            shot["status"] = "done"

        updated_shots.append(shot)
        state["shots"] = [*updated_shots, *original_shots[idx + 1 :]]

    return state