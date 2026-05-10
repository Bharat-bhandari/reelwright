from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import time
from pathlib import Path

from app.graph.state import AgentState, ShotState
from app.graph.status import append_status_message
from app.services import runway

logger = logging.getLogger(__name__)


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _cache_paths(thread_id: str, key: str) -> tuple[Path, Path]:
    base = Path("scratch") / "cache"
    images_dir = base / "images"
    videos_dir = base / "videos"
    images_dir.mkdir(parents=True, exist_ok=True)
    videos_dir.mkdir(parents=True, exist_ok=True)
    return images_dir / f"{thread_id}-{key}.jpg", videos_dir / f"{thread_id}-{key}.mp4"


async def generate_shot_node(state: AgentState) -> AgentState:
    thread_id = state["thread_id"]
    use_cache = os.getenv("REELWRIGHT_USE_CACHE", "false").lower() in ("1", "true", "yes")

    # A2: Extract reference images from scrape data for product fidelity
    scrape_data = state.get("scrape")
    reference_images = None
    if scrape_data and scrape_data.product_images:
        reference_images = scrape_data.product_images[:2]
        logger.info("[generate_shot_node] Using %d reference images from scrape", len(reference_images))

    updated_shots: list[ShotState] = []

    for shot in state.get("shots", []):
        shot_index = shot["index"]
        description = shot.get("description", "")

        state = append_status_message(state, "generate", f"Generating shot {shot_index}: {description}")
        logger.info(f"[generate_shot_node] Start shot {shot_index}: {description}")
        shot_start = time.time()

        # mark generating image
        shot = {**shot, "status": "generating_image"}
        updated_shots.append(shot)
        state["shots"] = [*updated_shots, *state.get("shots", [])[len(updated_shots) :]]

        image_prompt = shot.get("image_prompt") or shot.get("description")
        # Include reference images in cache key so different references produce different cache entries
        cache_input = image_prompt + "::" + str(reference_images or [])
        image_key = _hash_text(cache_input)
        image_path, video_path = _cache_paths(thread_id, image_key)

        try:
            if use_cache and image_path.exists():
                image_url = f"file://{image_path.resolve()}"
                logger.info(f"[generate_shot_node] Using cached image for shot {shot_index}: {image_path}")
            else:
                start = time.time()
                urls = await runway.generate_image(image_prompt, ratio="720:1280", reference_images=reference_images)
                duration = time.time() - start
                image_url = urls[0]
                logger.info(f"[generate_shot_node] Image generated for shot {shot_index} in {duration:.2f}s: {image_url}")

                # Optionally download and cache the image
                if use_cache:
                    try:
                        from httpx import AsyncClient

                        async with AsyncClient(timeout=30.0) as client:
                            resp = await client.get(image_url)
                            resp.raise_for_status()
                            image_path.write_bytes(resp.content)
                            logger.info(f"[generate_shot_node] Cached image to {image_path}")
                            image_url = f"file://{image_path.resolve()}"
                    except Exception as exc:
                        logger.warning(f"[generate_shot_node] Failed to cache image: {exc}")

            # update state with image_url
            shot = {**shot, "image_url": image_url, "status": "generating_video"}
            updated_shots[-1] = shot
            state["shots"] = [*updated_shots, *state.get("shots", [])[len(updated_shots) :]]

            # Generate video from image
            motion_prompt = shot.get("motion_prompt") or ""
            video_key = _hash_text(image_prompt + "::" + motion_prompt + "::" + str(shot.get("duration_seconds", 4)))
            _, cached_video_path = _cache_paths(thread_id, video_key)

            if use_cache and cached_video_path.exists():
                video_url = f"file://{cached_video_path.resolve()}"
                logger.info(f"[generate_shot_node] Using cached video for shot {shot_index}: {cached_video_path}")
            else:
                start = time.time()
                urls = await runway.image_to_video(image_url, prompt_text=motion_prompt, duration=shot.get("duration_seconds", 4), ratio="720:1280")
                duration = time.time() - start
                video_url = urls[0]
                logger.info(f"[generate_shot_node] Video generated for shot {shot_index} in {duration:.2f}s: {video_url}")

                if use_cache:
                    try:
                        from httpx import AsyncClient

                        async with AsyncClient(timeout=120.0) as client:
                            resp = await client.get(video_url)
                            resp.raise_for_status()
                            cached_video_path.write_bytes(resp.content)
                            logger.info(f"[generate_shot_node] Cached video to {cached_video_path}")
                            video_url = f"file://{cached_video_path.resolve()}"
                    except Exception as exc:
                        logger.warning(f"[generate_shot_node] Failed to cache video: {exc}")

            shot = {**shot, "video_url": video_url, "status": "done"}
            updated_shots[-1] = shot
            state["shots"] = [*updated_shots, *state.get("shots", [])[len(updated_shots) :]]

        except Exception as exc:
            logger.exception("[generate_shot_node] Shot %s failed: %s", shot_index, exc)
            shot = {**shot, "status": "failed"}
            updated_shots[-1] = shot
            state["shots"] = [*updated_shots, *state.get("shots", [])[len(updated_shots) :]]
            state["error"] = f"Shot {shot_index} failed: {exc}"
            state = append_status_message(state, "error", state["error"])
            # continue to next shot

        shot_duration = time.time() - shot_start
        logger.info(f"[generate_shot_node] Shot {shot_index} total time: {shot_duration:.2f}s")

    return state