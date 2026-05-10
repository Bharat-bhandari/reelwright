from __future__ import annotations

import io
import logging
import os
from typing import Any, Iterable, List, Optional, Sequence

import httpx
from PIL import Image

from app.models.schemas import ScrapeData


logger = logging.getLogger(__name__)

FIRECRAWL_SCRAPE_URL = "https://api.firecrawl.dev/v1/scrape"


async def scrape_product(url: str) -> ScrapeData:
	api_key = os.getenv("FIRECRAWL_API_KEY")
	if not api_key:
		raise RuntimeError("FIRECRAWL_API_KEY is not set")

	payload = {
		"url": url,
		"formats": ["markdown", "branding"],
		"onlyMainContent": True,
		"onlyCleanContent": False,
	}
	headers = {
		"Authorization": f"Bearer {api_key}",
		"Content-Type": "application/json",
	}

	async with httpx.AsyncClient(timeout=30.0) as client:
		response = await client.post(FIRECRAWL_SCRAPE_URL, json=payload, headers=headers)
		response.raise_for_status()
		body = response.json()

	if body.get("success") is False:
		raise RuntimeError(f"Firecrawl scrape failed: {body}")

	data = body.get("data", {})
	markdown = _as_str(data.get("markdown"))
	metadata = _as_dict(data.get("metadata"))
	branding = _as_dict(data.get("branding"))
	images = _as_list(data.get("images"))

	logo_url = _pick_logo_url(metadata, branding, images)
	brand_name = _pick_brand_name(metadata)
	product_images = _pick_product_images(images)
	copy_blocks = _extract_copy_blocks(markdown)

	dominant_colors: List[str] = []
	if logo_url:
		dominant_colors = await _extract_dominant_colors(logo_url)

	return ScrapeData(
		logo_url=logo_url,
		brand_name=brand_name,
		product_images=product_images,
		copy_blocks=copy_blocks,
		dominant_colors=dominant_colors,
		source_url=url,
	)


def _as_str(value: Any) -> str:
	if isinstance(value, str):
		return value
	return ""


def _as_dict(value: Any) -> dict[str, Any]:
	if isinstance(value, dict):
		return value
	return {}


def _as_list(value: Any) -> list[Any]:
	if isinstance(value, list):
		return value
	return []


def _pick_logo_url(
	metadata: dict[str, Any],
	branding: dict[str, Any],
	images: Sequence[Any],
) -> Optional[str]:
	for key in ("og:logo", "og:image", "og:image:url", "ogImage"):
		candidate = _as_str(metadata.get(key))
		if candidate:
			return candidate

	branding_images = _as_dict(branding.get("images"))
	for key in ("logo", "ogImage"):
		candidate = _as_str(branding_images.get(key))
		if candidate:
			return candidate

	for image in images:
		url, alt_text = _extract_image_fields(image)
		if not url:
			continue
		if _looks_like_logo(url, alt_text):
			return url

	return None


def _pick_brand_name(metadata: dict[str, Any]) -> Optional[str]:
	for key in ("og:site_name", "og:site_name", "ogSiteName", "site_name"):
		candidate = _as_str(metadata.get(key))
		if candidate:
			return candidate

	title = _as_str(metadata.get("title"))
	return title or None


def _looks_like_logo(url: str, alt_text: Optional[str]) -> bool:
	haystack = " ".join([url, alt_text or ""]).lower()
	return "logo" in haystack


def _extract_image_fields(image: Any) -> tuple[Optional[str], Optional[str]]:
	if isinstance(image, str):
		return image, None
	if isinstance(image, dict):
		url = _as_str(image.get("url") or image.get("src"))
		alt_text = _as_str(image.get("alt"))
		return url or None, alt_text or None
	return None, None


def _pick_product_images(images: Sequence[Any]) -> list[str]:
	results: list[str] = []
	seen: set[str] = set()
	for image in images:
		url, _ = _extract_image_fields(image)
		if not url or url in seen:
			continue
		width, height = _extract_image_dimensions(image)
		if width is not None and height is not None:
			if width < 400 or height < 400:
				continue
		results.append(url)
		seen.add(url)
		if len(results) >= 8:
			break
	return results


def _extract_image_dimensions(image: Any) -> tuple[Optional[int], Optional[int]]:
	if not isinstance(image, dict):
		return None, None
	width = image.get("width") or image.get("w")
	height = image.get("height") or image.get("h")
	if isinstance(width, int) and isinstance(height, int):
		return width, height
	return None, None


def _extract_copy_blocks(markdown: str) -> list[str]:
	if not markdown:
		return []

	lines = [line.strip() for line in markdown.splitlines()]
	lines = [line for line in lines if line]

	blocks: list[str] = []

	for line in lines:
		if line.startswith("#") and len(line) > 2:
			blocks.append(line.lstrip("# "))
			break

	for line in lines:
		if line.startswith(("- ", "* ", "• ")):
			cleaned = line.lstrip("-*• ").strip()
			if cleaned and cleaned not in blocks:
				blocks.append(cleaned)

	for line in lines:
		if line.startswith("#") or line.startswith(("- ", "* ", "• ", "![")):
			continue
		if len(line) < 30:
			continue
		if line not in blocks:
			blocks.append(line)
		if len(blocks) >= 8:
			break

	return blocks[:8]


async def _extract_dominant_colors(logo_url: str) -> list[str]:
	try:
		async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
			response = await client.get(logo_url)
			response.raise_for_status()
			image_bytes = response.content
	except Exception as exc:
		logger.exception("Failed to download logo for color extraction: %s", exc)
		return []

	try:
		image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
		image = image.resize((100, 100))
		quantized = image.quantize(colors=5)
		palette = quantized.getpalette() or []
		colors = quantized.getcolors() or []
		hex_colors: list[str] = []
		for _, color_index in sorted(colors, reverse=True):
			rgb = _palette_index_to_rgb(palette, color_index)
			if rgb is None:
				continue
			if _is_near_white(rgb) or _is_near_black(rgb):
				continue
			hex_colors.append(_rgb_to_hex(rgb))
		return hex_colors[:4]
	except Exception as exc:
		logger.exception("Failed to extract dominant colors: %s", exc)
		return []


def _palette_index_to_rgb(palette: Sequence[int], index: int) -> Optional[tuple[int, int, int]]:
	start = index * 3
	if start + 2 >= len(palette):
		return None
	return palette[start], palette[start + 1], palette[start + 2]


def _is_near_white(rgb: tuple[int, int, int]) -> bool:
	return all(channel > 240 for channel in rgb)


def _is_near_black(rgb: tuple[int, int, int]) -> bool:
	return all(channel < 20 for channel in rgb)


def _rgb_to_hex(rgb: Iterable[int]) -> str:
	return "#{:02X}{:02X}{:02X}".format(*rgb)
