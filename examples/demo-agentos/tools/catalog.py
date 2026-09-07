"""Server-side tools rendered in the chat: a product lookup and a deliberately slow task."""

import json
import time

from agno.tools import tool

PRODUCTS = {
    "SKU-1": {"name": "Trail running shoes", "price": 129.9, "stock": 12},
    "SKU-2": {"name": "Road running shoes", "price": 149.9, "stock": 0},
    "SKU-3": {"name": "Hydration vest", "price": 89.0, "stock": 4},
}


@tool
def lookup_product(sku: str) -> str:
    """Look up a product by SKU (SKU-1, SKU-2, SKU-3). Returns name, price and stock as JSON."""
    return json.dumps(PRODUCTS.get(sku.upper(), {"error": f"unknown sku {sku}"}))


@tool
def slow_task(seconds: int = 20) -> str:
    """Run a long job that takes `seconds` seconds. Use it when asked to run the slow task."""
    time.sleep(seconds)
    return f"slow task finished after {seconds}s"
