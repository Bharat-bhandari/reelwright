from __future__ import annotations

import logging
import time

from app.graph.state import AgentState
from app.graph.status import append_status_message
from app.models.schemas import ScrapeData
from app.services import firecrawl

logger = logging.getLogger(__name__)


async def scrape_node(state: AgentState) -> AgentState:
    """Scrape product data from the given URL using Firecrawl."""
    url = state["url"]
    
    state = append_status_message(state, "scrape", "Scraping product page...")
    logger.info(f"[scrape_node] Starting scrape for URL: {url}")
    
    start_time = time.time()
    
    try:
        scrape_data = await firecrawl.scrape_product(url)
        
        duration = time.time() - start_time
        logger.info(f"[scrape_node] Scrape completed in {duration:.2f}s. Brand: {scrape_data.brand_name}, "
                   f"Images: {len(scrape_data.product_images)}, Colors: {len(scrape_data.dominant_colors)}")
        
        state["scrape"] = scrape_data
        
        status_msg = (f"Found {len(scrape_data.product_images)} product images, "
                     f"extracted {len(scrape_data.dominant_colors)} brand colors. Brand: {scrape_data.brand_name}")
        state = append_status_message(state, "scrape", status_msg)
        
        return state
        
    except Exception as e:
        duration = time.time() - start_time
        error_msg = f"Scrape failed after {duration:.2f}s: {str(e)}"
        logger.error(f"[scrape_node] {error_msg}")
        
        state["error"] = error_msg
        state = append_status_message(state, "error", error_msg)
        
        return state