from __future__ import annotations

import logging
import time

from app.graph.state import AgentState, ShotState
from app.graph.status import append_status_message
from app.models.schemas import Shot, VideoPlan
from app.services import groq

logger = logging.getLogger(__name__)


async def plan_node(state: AgentState) -> AgentState:
    """Generate a video plan from scraped product data using Groq."""
    scrape_data = state["scrape"]
    
    if not scrape_data:
        error_msg = "No scrape data available for planning"
        logger.error(f"[plan_node] {error_msg}")
        state["error"] = error_msg
        state = append_status_message(state, "error", error_msg)
        return state
    
    state = append_status_message(state, "plan", "Planning video...")
    logger.info(f"[plan_node] Starting plan generation for brand: {scrape_data.brand_name}")
    
    start_time = time.time()
    
    try:
        plan = await groq.generate_video_plan(scrape_data)
        
        duration = time.time() - start_time
        total_duration = sum(shot.duration_seconds for shot in plan.shots)
        logger.info(f"[plan_node] Plan generated in {duration:.2f}s. Hook: {plan.hook[:80]}..., "
                   f"Shots: {len(plan.shots)}, Total duration: {total_duration}s")
        
        state["plan"] = plan

        # Initialize shot state from plan
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
        
        status_msg = f"Planned {len(plan.shots)} shots, {total_duration}s total"
        state = append_status_message(state, "plan", status_msg)
        
        return state
        
    except Exception as e:
        duration = time.time() - start_time
        error_msg = f"Plan generation failed after {duration:.2f}s: {str(e)}"
        logger.error(f"[plan_node] {error_msg}")
        
        state["error"] = error_msg
        state = append_status_message(state, "error", error_msg)
        
        return state