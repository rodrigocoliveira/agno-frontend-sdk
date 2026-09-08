"""Prints one JWT per profile as JSON. Paste the output into demo-react → Settings → Import.

The same tokens are also available with no terminal step at all: with the server running, open
demo-react's Settings page and use "Quick demo login" (GET /dev/tokens under the hood).
"""

import json

import auth

if __name__ == "__main__":
    print(json.dumps(auth.all_tokens(), indent=2))
