"""A tool whose arguments are filled by the user through a form (requires_user_input)."""

from agno.tools import tool


@tool(requires_user_input=True, user_input_fields=["street", "city", "zip"])
def collect_shipping_address(street: str, city: str, zip: str) -> str:
    """Collect the shipping address from the user. Call it when an address is needed."""
    return f"shipping to {street}, {city} {zip}"
