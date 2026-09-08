"""Prints one JWT per profile as JSON. Paste the output into demo-react → Settings → Import."""

import json
import time

import jwt

import auth
import settings

THIRTY_DAYS = 30 * 24 * 60 * 60


def make_token(claims: dict) -> str:
    now = int(time.time())
    return jwt.encode({**claims, "iat": now, "exp": now + THIRTY_DAYS}, settings.JWT_SECRET, algorithm="HS256")


if __name__ == "__main__":
    print(json.dumps({label: make_token(claims) for label, claims in auth.PROFILES.items()}, indent=2))
