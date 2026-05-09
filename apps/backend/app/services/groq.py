from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

import httpx

from app.models.schemas import CritiqueResult, ScrapeData, VideoPlan


logger = logging.getLogger(__name__)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "llama-3.1-8b-instant"


def _get_api_key() -> str:
	api_key = os.getenv("GROQ_API_KEY")
	if not api_key:
		raise RuntimeError("GROQ_API_KEY is not set")
	return api_key


def _get_model(override: Optional[str]) -> str:
	if override:
		return override
	return os.getenv("GROQ_MODEL", DEFAULT_MODEL)


def _extract_json_object(text: str) -> dict[str, Any]:
	start = text.find("{")
	end = text.rfind("}")
	if start == -1 or end == -1 or end <= start:
		raise ValueError("No JSON object found in Groq response")
	return json.loads(text[start : end + 1])


async def _chat_completion(
	*,
	model: str,
	messages: list[dict[str, str]],
	temperature: float,
	max_tokens: int,
) -> str:
	api_key = _get_api_key()
	payload = {
		"model": model,
		"messages": messages,
		"temperature": temperature,
		"max_tokens": max_tokens,
	}
	headers = {
		"Authorization": f"Bearer {api_key}",
		"Content-Type": "application/json",
	}

	async with httpx.AsyncClient(timeout=60.0) as client:
		response = await client.post(GROQ_API_URL, json=payload, headers=headers)
		response.raise_for_status()
		body = response.json()

	content = body["choices"][0]["message"]["content"]
	if not isinstance(content, str) or not content.strip():
		raise RuntimeError("Groq returned empty content")
	return content.strip()


async def generate_video_plan(
	scrape_data: ScrapeData,
	*,
	model: Optional[str] = None,
) -> VideoPlan:
	plan_schema = {
		"hook": "string",
		"shots": [
			{
				"index": 1,
				"description": "string",
				"duration_seconds": 3,
				"image_prompt": "string",
				"motion_prompt": "string",
			}
		],
		"voiceover_script": "string",
		"voiceover_tone": "string",
		"music_feel": "string",
	}

	system = (
		"You are a creative director. Return only valid JSON that matches the schema. "
		"No markdown, no extra keys."
	)
	user = (
		"Generate a short video ad plan from the product scrape data. "
		"Use 4-6 shots. Keep durations realistic for a 15-20s ad.\n\n"
		f"Scrape data:\n{scrape_data.model_dump_json(indent=2)}\n\n"
		f"Schema:\n{json.dumps(plan_schema, indent=2)}"
	)

	content = await _chat_completion(
		model=_get_model(model),
		messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
		temperature=0.5,
		max_tokens=1200,
	)
	data = _extract_json_object(content)
	return VideoPlan.model_validate(data)


async def critique_video_plan(
	plan: VideoPlan,
	*,
	model: Optional[str] = None,
) -> CritiqueResult:
	critique_schema = {
		"score": 1,
		"passes": True,
		"feedback": "string",
		"regeneration_prompt": "string or null",
	}

	system = (
		"You are a strict creative QA. Return only valid JSON that matches the schema. "
		"No markdown, no extra keys."
	)
	user = (
		"Critique the video plan for clarity, pacing, and creative impact. "
		"Return a score (1-10), pass/fail, and feedback. If it fails, include a "
		"regeneration_prompt to improve it.\n\n"
		f"Plan:\n{plan.model_dump_json(indent=2)}\n\n"
		f"Schema:\n{json.dumps(critique_schema, indent=2)}"
	)

	content = await _chat_completion(
		model=_get_model(model),
		messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
		temperature=0.3,
		max_tokens=800,
	)
	data = _extract_json_object(content)
	return CritiqueResult.model_validate(data)
