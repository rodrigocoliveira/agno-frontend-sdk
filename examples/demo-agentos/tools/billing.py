"""Money-moving tools: one asks the user to confirm, one needs an admin approval."""

from agno.approval import approval
from agno.tools import tool


@tool(requires_confirmation=True)
def send_invoice(customer: str, amount: float) -> str:
    """Send an invoice of `amount` to `customer`. Asks the user to confirm first."""
    return f"invoice of {amount:.2f} sent to {customer}"


@approval
@tool
def issue_refund(order_id: str, amount: float) -> str:
    """Refund `amount` for `order_id`. Blocked until an admin approves it."""
    return f"refund of {amount:.2f} issued for order {order_id}"
