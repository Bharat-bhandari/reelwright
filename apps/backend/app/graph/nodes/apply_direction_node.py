from __future__ import annotations

from app.graph.state import AgentState
from app.graph.status import append_status_message
from app.models.schemas import VideoPlan


async def apply_direction_node(state: AgentState) -> AgentState:
    if not state.get("user_directions"):
        return append_status_message(state, "plan", "No direction provided; plan unchanged")

    direction = state["user_directions"][-1]
    state = append_status_message(state, "plan", f"Applying direction: '{direction}'")

    plan = state.get("plan")
    if plan is None:
        state["error"] = "Cannot apply direction without an existing plan"
        return append_status_message(state, "error", state["error"])

    revised_plan = VideoPlan(
        hook=f"{plan.hook} (revised)",
        shots=plan.shots,
        voiceover_script=plan.voiceover_script,
        voiceover_tone=plan.voiceover_tone,
        music_feel=plan.music_feel,
    )
    state["plan"] = revised_plan
    return state