from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class ScrapeData(BaseModel):
    logo_url: Optional[str]
    brand_name: Optional[str]
    product_images: List[str]
    copy_blocks: List[str]
    dominant_colors: List[str]
    source_url: str


class Shot(BaseModel):
    index: int
    description: str
    duration_seconds: int
    image_prompt: str
    motion_prompt: str


class VideoPlan(BaseModel):
    hook: str
    shots: List[Shot]
    voiceover_script: str
    voiceover_tone: str
    music_feel: str


class CritiqueResult(BaseModel):
    score: int
    passes: bool
    feedback: str
    regeneration_prompt: Optional[str]
