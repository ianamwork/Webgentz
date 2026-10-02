"""Claude Code hook that reports what an agent is doing to the Webgentz village.

Claude Code runs this script on each hook event and passes a JSON description
of the event on stdin. We forward it to the local server and exit straight
away. If the village is not running, we stay silent so Claude Code is never
slowed down or interrupted.
"""

import json
import os
import sys
import urllib.request

URL = os.environ.get("WEBGENTZ_URL", "http://127.0.0.1:8765") + "/event"


def main():
    try:
        payload = sys.stdin.read()
        json.loads(payload)  # only forward valid JSON
        request = urllib.request.Request(
            URL, data=payload.encode(), headers={"Content-Type": "application/json"}
        )
        urllib.request.urlopen(request, timeout=1).close()
    except Exception:
        pass
    sys.exit(0)


if __name__ == "__main__":
    main()
