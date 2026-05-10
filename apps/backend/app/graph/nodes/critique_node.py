from __future__ import annotations

import hashlib
import logging
import os
import time
from pathlib import Path

from app.graph.state import AgentState, ShotState
from app.graph.status import append_status_message
from app.services import groq, runway

logger = logging.getLogger(__name__)


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _video_cache_path(key: str) -> Path:
    videos_dir = Path("scratch") / "cache" / "videos"
    videos_dir.mkdir(parents=True, exist_ok=True)
    return videos_dir / f"{key}.mp4"


async def critique_node(state: AgentState) -> AgentState:
    updated_shots: list[ShotState] = []
    original_shots = state.get("shots", [])
    use_cache = os.getenv("REELWRIGHT_USE_CACHE", "false").lower() in ("1", "true", "yes")

    for idx, shot in enumerate(original_shots):
        shot_index = shot["index"]
        video_url = shot.get("video_url")
        if not video_url:
            updated_shots.append(shot)
            state["shots"] = [*updated_shots, *original_shots[idx + 1 :]]
            continue

        state = append_status_message(state, "critique", f"Critiquing shot {shot_index}...")
        shot = {**shot, "status": "critiquing"}
        updated_shots.append(shot)
        state["shots"] = [*updated_shots, *original_shots[idx + 1 :]]

        start_time = time.time()
        try:
            result = await groq.critique_shot(shot, video_url)
            shot = {**shot, "critique": result}

            if result.passes:
                shot = {**shot, "status": "done"}
                state = append_status_message(
                    state,
                    "critique",
                    f"Shot {shot_index} approved (score {result.score}/5)",
                )
            else:
                if shot.get("retry_count", 0) < 1:
                    state = append_status_message(
                        state,
                        "regenerate",
                        f"Regenerating shot {shot_index} — {result.feedback[:80]}",
                    )
                    shot = {**shot, "status": "regenerating", "retry_count": shot.get("retry_count", 0) + 1}

                    regen_prompt = result.regeneration_prompt or shot.get("motion_prompt") or ""
                    duration = shot.get("duration_seconds", 4)
                    cache_key = _hash_text(f"{shot.get('image_url')}::{regen_prompt}::{duration}")
                    cached_video_path = _video_cache_path(cache_key)

                    if use_cache and cached_video_path.exists():
                        new_video_url = f"file://{cached_video_path.resolve()}"
                        logger.info(
                            "[critique_node] Using cached regeneration video for shot %s: %s",
                            shot_index,
                            cached_video_path,
                        )
                    else:
                        start = time.time()
                        urls = await runway.image_to_video(
                            shot.get("image_url", ""),
                            prompt_text=regen_prompt,
                            duration=duration,
                            ratio="720:1280",
                        )
                        new_video_url = urls[0]
                        logger.info(
                            "[critique_node] Regenerated video for shot %s in %.2fs",
                            shot_index,
                            time.time() - start,
                        )

                        if use_cache:
                            try:
                                from httpx import AsyncClient

                                async with AsyncClient(timeout=120.0) as client:
                                    resp = await client.get(new_video_url)
                                    resp.raise_for_status()
                                    cached_video_path.write_bytes(resp.content)
                                    new_video_url = f"file://{cached_video_path.resolve()}"
                            except Exception as exc:
                                logger.warning("[critique_node] Failed to cache regenerated video: %s", exc)

                    shot = {**shot, "video_url": new_video_url, "status": "done"}
                else:
                    logger.warning("[critique_node] Shot %s failed critique after retry; accepting.", shot_index)
                    shot = {**shot, "status": "done"}
                    state = append_status_message(
                        state,
                        "critique",
                        f"Shot {shot_index} retained despite low critique score",
                    )

            duration = time.time() - start_time
            logger.info("[critique_node] Shot %s critique completed in %.2fs", shot_index, duration)

        except Exception as exc:
            duration = time.time() - start_time
            logger.exception("[critique_node] Shot %s critique failed after %.2fs: %s", shot_index, duration, exc)
            state["error"] = f"Critique failed for shot {shot_index}: {exc}"
            state = append_status_message(state, "error", state["error"])
            shot = {**shot, "status": "done"}

        updated_shots[-1] = shot
        state["shots"] = [*updated_shots, *original_shots[idx + 1 :]]

    return state