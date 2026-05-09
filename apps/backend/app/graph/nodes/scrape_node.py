from __future__ import annotations

import asyncio

from app.graph.state import AgentState
from app.graph.status import append_status_message
from app.models.schemas import ScrapeData


async def scrape_node(state: AgentState) -> AgentState:
    state = append_status_message(state, "scrape", "Scraping product page...")
    await asyncio.sleep(2)

    state["scrape"] = ScrapeData(
        logo_url="https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80",
        brand_name="AIRWAVE",
        product_images=[
            "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1514989940723-e8e51635b782?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1556048219-bb6978360b84?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=1200&q=80",
        ],
        copy_blocks=[
            "Engineered foam cushioning for all-day comfort.",
            "Featherlight knit upper with breathable support.",
            "Street-ready style built for movement.",
        ],
        dominant_colors=["#111827", "#F97316", "#22C55E", "#E5E7EB"],
        source_url=state["url"],
    )

    state = append_status_message(state, "scrape", "Found 5 product images, extracted brand colors")
    return state