"""JWT setup: HS256 with a shared dev secret, per-user isolation, three token profiles."""

from agno.os.config import AuthorizationConfig

import settings

CONFIG = AuthorizationConfig(
    verification_keys=[settings.JWT_SECRET],
    algorithm="HS256",
    user_isolation=True,
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
