"""Claude Code hook that reports what an agent is doing to the Webgentz jungle.

Claude Code runs this script on each hook event and passes a JSON description
of the event on stdin. We forward it to the local server and exit straight
away. If the jungle server is not running, we stay silent so Claude Code is
never slowed down or interrupted.
"""

import json
import os
import sys
import urllib.request

URL = os.environ.get("WEBGENTZ_URL", "http://127.0.0.1:8765") + "/event"


def transform(payload):
    """Turn a Claude Code hook payload into a Webgentz event."""
    # Claude Code uses `agent_type` for the kind of helper agent (for example
    # "general-purpose"). In Webgentz that field picks the animal, so keep
    # Claude Code's value under another name.
    if "agent_type" in payload:
        payload["helper_type"] = payload.pop("agent_type")
    payload["agent_type"] = "claude-code"
    return payload


def main():
    try:
        payload = transform(json.loads(sys.stdin.read()))
        request = urllib.request.Request(
            URL, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}
        )
        urllib.request.urlopen(request, timeout=1).close()
    except Exception:
        pass
    sys.exit(0)


if __name__ == "__main__":
    main()
