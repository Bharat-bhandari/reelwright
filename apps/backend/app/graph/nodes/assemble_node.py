from __future__ import annotations

import asyncio

from app.graph.state import AgentState
from app.graph.status import append_status_message


async def assemble_node(state: AgentState) -> AgentState:
    state = append_status_message(state, "assemble", "Assembling final video...")
    await asyncio.sleep(2)

    state["final_video_url"] = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
    state = append_status_message(state, "done", "Done. Final video ready.")
    return state