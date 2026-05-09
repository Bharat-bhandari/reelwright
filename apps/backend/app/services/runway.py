from __future__ import annotations

import logging
import os
from typing import Optional, Sequence

from runwayml import AsyncRunwayML
from runwayml.lib.polling import TaskFailedError, TaskTimeoutError
from runwayml.types.task_retrieve_response import TaskRetrieveResponse


logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_S = 60 * 10


def _get_api_key() -> str:
	api_key = os.getenv("RUNWAYML_API_KEY") or os.getenv("RUNWAY_API_KEY")
	if not api_key:
		raise RuntimeError("RUNWAYML_API_KEY is not set")
	return api_key


def _build_reference_images(urls: Sequence[str]) -> list[dict[str, str]]:
	return [{"uri": url} for url in urls if url]


def _extract_output_urls(task: TaskRetrieveResponse) -> list[str]:
	if task.status != "SUCCEEDED":
		raise RuntimeError(f"Task did not succeed (status={task.status})")
	return list(task.output)


async def _wait_for_task_output(
	task_response: object,
	timeout_s: Optional[float],
) -> TaskRetrieveResponse:
	try:
		return await task_response.wait_for_task_output(timeout=timeout_s)
	except TaskFailedError as exc:
		logger.error("Runway task failed")
		raise RuntimeError("Runway task failed") from exc
	except TaskTimeoutError as exc:
		logger.error("Runway task timed out")
		raise RuntimeError("Runway task timed out") from exc


async def generate_image(
	prompt_text: str,
	*,
	model: str = "gen4_image",
	ratio: str = "1024:1024",
	seed: Optional[int] = None,
	reference_images: Optional[Sequence[str]] = None,
	timeout_s: Optional[float] = DEFAULT_TIMEOUT_S,
) -> list[str]:
	if not prompt_text:
		raise ValueError("prompt_text is required")
	if model == "gen4_image_turbo" and not reference_images:
		raise ValueError("gen4_image_turbo requires reference_images")

	client = AsyncRunwayML(api_key=_get_api_key())
	payload: dict[str, object] = {
		"model": model,
		"prompt_text": prompt_text,
		"ratio": ratio,
	}
	if seed is not None:
		payload["seed"] = seed
	if reference_images:
		payload["reference_images"] = _build_reference_images(reference_images)

	task_response = await client.text_to_image.create(**payload)
	task = await _wait_for_task_output(task_response, timeout_s)
	return _extract_output_urls(task)


async def image_to_video(
	prompt_image_url: str,
	*,
	model: str = "gen4_turbo",
	ratio: str = "1280:720",
	prompt_text: Optional[str] = None,
	duration: Optional[int] = None,
	seed: Optional[int] = None,
	timeout_s: Optional[float] = DEFAULT_TIMEOUT_S,
) -> list[str]:
	if not prompt_image_url:
		raise ValueError("prompt_image_url is required")
	if model == "gen4.5" and (prompt_text is None or duration is None):
		raise ValueError("gen4.5 requires prompt_text and duration")

	client = AsyncRunwayML(api_key=_get_api_key())
	payload: dict[str, object] = {
		"model": model,
		"prompt_image": prompt_image_url,
		"ratio": ratio,
	}
	if prompt_text is not None:
		payload["prompt_text"] = prompt_text
	if duration is not None:
		payload["duration"] = duration
	if seed is not None:
		payload["seed"] = seed

	task_response = await client.image_to_video.create(**payload)
	task = await _wait_for_task_output(task_response, timeout_s)
	return _extract_output_urls(task)


async def retrieve_task(task_id: str) -> TaskRetrieveResponse:
	if not task_id:
		raise ValueError("task_id is required")

	client = AsyncRunwayML(api_key=_get_api_key())
	return await client.tasks.retrieve(task_id)
