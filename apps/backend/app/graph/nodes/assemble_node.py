from __future__ import annotations

import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Iterable

import httpx

from app.graph.state import AgentState
from app.graph.status import append_status_message
from app.services import ffmpeg

logger = logging.getLogger(__name__)


def _normalize_video_urls(shots: Iterable[dict]) -> list[str]:
    urls: list[str] = []
    for shot in shots:
        url = shot.get("video_url")
        if url:
            urls.append(str(url))
    return urls


def _resolve_output_url() -> str:
    base_url = os.getenv("PUBLIC_BASE_URL") or os.getenv("NEXT_PUBLIC_API_BASE_URL")
    if not base_url:
        port = os.getenv("PORT", "8084")
        base_url = f"http://localhost:{port}"
    return base_url.rstrip("/")


async def _download_to_file(url: str, output_path: Path) -> None:
    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        output_path.write_bytes(response.content)


async def assemble_node(state: AgentState) -> AgentState:
    state = append_status_message(state, "assemble", "Assembling final video...")

    start_time = time.time()
    shots = state.get("shots", [])
    video_urls = _normalize_video_urls(shots)
    if len(video_urls) != len(shots):
        error_msg = "Missing video URLs for one or more shots"
        logger.error("[assemble_node] %s", error_msg)
        state["error"] = error_msg
        state = append_status_message(state, "error", error_msg)
        return state

    output_dir = Path("scratch") / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{state['thread_id']}.mp4"

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir_path = Path(temp_dir)
        local_paths: list[Path] = []

        for index, url in enumerate(video_urls):
            if url.startswith("file://"):
                local_paths.append(Path(url.replace("file://", "")))
                continue

            local_path = temp_dir_path / f"shot_{index:03d}.mp4"
            await _download_to_file(url, local_path)
            local_paths.append(local_path)

        ffmpeg.concat_videos(local_paths, output_path)

    base_url = _resolve_output_url()
    state["voiceover_url"] = None
    state["final_video_url"] = f"{base_url}/output/{state['thread_id']}.mp4"

    duration = time.time() - start_time
    logger.info("[assemble_node] Assembled final video in %.2fs: %s", duration, output_path)
    state = append_status_message(state, "done", "Done. Final video ready.")
    return state