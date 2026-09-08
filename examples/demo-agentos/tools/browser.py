"""Tools the browser executes (external_execution=True): the server only declares them."""

from agno.tools import tool


@tool(external_execution=True)
def get_location() -> str:
    """Return the user's current location as {lat, lng}. Executed by the frontend."""
    return ""


@tool(external_execution=True)
def get_local_time() -> str:
    """Return the user's local time and timezone. Executed by the frontend."""
    return ""
