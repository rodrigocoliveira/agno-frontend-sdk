"""JWT setup: HS256 with a shared dev secret and three token profiles. Per-user isolation is on in server.py."""

import time

import jwt
from agno.os.authz import Authorization

import settings

THIRTY_DAYS = 30 * 24 * 60 * 60

# /dev/tokens (server.py) hands out these same profile tokens over plain HTTP with no auth of its
# own — fine for a local demo with a well-known default JWT_SECRET, never do this in a real app.
# Token verification only: no managed roles, so no /authz routes and no role tables -- the token's
# `scopes` claim alone decides what a caller may do.
AUTHORIZATION = Authorization(
    verification_keys=[settings.JWT_SECRET],
    algorithm="HS256",
    excluded_route_paths=["/dev/tokens"],
)

# Enough to use every page of demo-react except resolving approvals (admin only).
USER_SCOPES = [
    "config:read",
    "agents:read", "agents:run",
    "teams:read", "teams:run",
    "workflows:read", "workflows:run",
    "sessions:read", "sessions:write",
    "approvals:read",
]

PROFILES = {
    "admin": {"sub": "admin", "scopes": ["agent_os:admin"]},
    "user-1": {"sub": "user-1", "scopes": USER_SCOPES},
    "user-2": {"sub": "user-2", "scopes": USER_SCOPES},
}


def make_token(claims: dict) -> str:
    now = int(time.time())
    return jwt.encode({**claims, "iat": now, "exp": now + THIRTY_DAYS}, settings.JWT_SECRET, algorithm="HS256")


def all_tokens() -> dict[str, str]:
    return {label: make_token(claims) for label, claims in PROFILES.items()}
