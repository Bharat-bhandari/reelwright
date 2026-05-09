from __future__ import annotations

import asyncio

from app.graph.state import AgentState, ShotState
from app.graph.status import append_status_message
from app.models.schemas import Shot, VideoPlan


async def plan_node(state: AgentState) -> AgentState:
    state = append_status_message(state, "plan", "Planning video - 3 shots, 12s total")
    await asyncio.sleep(2)

    plan = VideoPlan(
        hook="Move faster. Feel lighter. AIRWAVE lands in 12 seconds.",
        shots=[
            Shot(
                index=1,
                description="Low-angle hero reveal of sneaker spinning on pedestal",
                duration_seconds=4,
                image_prompt="Studio-lit sneaker hero shot, dramatic rim light, black seamless background",
                motion_prompt="Slow clockwise orbit, shallow depth of field, subtle lens flare",
            ),
            Shot(
                index=2,
                description="Runner launches forward through neon city crosswalk",
                duration_seconds=4,
                image_prompt="Athletic runner in AIRWAVE shoes, wet street reflections, neon signage",
                motion_prompt="Fast forward push-in with motion blur and energetic camera shake",
            ),
            Shot(
                index=3,
                description="Close-up outsole compression with logo lockup",
                duration_seconds=4,
                image_prompt="Macro sneaker sole compression, particles, premium product texture",
                motion_prompt="Cinematic rack focus to brand logo, end on crisp lockup",
            ),
        ],
        voiceover_script="Meet AIRWAVE. Built to absorb impact, return energy, and keep you moving from first light to last call.",
        voiceover_tone="confident, modern, premium",
        music_feel="high-energy electronic with punchy percussion",
    )
    state["plan"] = plan

    shots: list[ShotState] = []
    for shot in plan.shots:
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

    return state