from __future__ import annotations

from typing import TypedDict

from app.models.schemas import CritiqueResult, ScrapeData, VideoPlan


class ShotState(TypedDict):
    index: int
    description: str
    duration_seconds: int
    image_prompt: str
    motion_prompt: str
    image_url: str | None
    video_url: str | None
    status: str
    critique: CritiqueResult | None
    retry_count: int


class StatusMessage(TypedDict):
    timestamp: str
    type: str
    message: str


class AgentState(TypedDict):
    thread_id: str
    url: str
    scrape: ScrapeData | None
    plan: VideoPlan | None
    user_directions: list[str]
    shots: list[ShotState]
    voiceover_url: str | None
    final_video_url: str | None
    status_messages: list[StatusMessage]
    error: str | None