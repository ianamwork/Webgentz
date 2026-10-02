"""Claude Code hook that reports what an agent is doing to the Webgentz jungle.

Claude Code runs this script on each hook event and passes a JSON description
of the event on stdin. We forward it to the local server and exit straight
away. If the jungle server is not running, we stay silent so Claude Code is
never slowed down or interrupted.
"""

import json
import os
import subprocess
import sys
import urllib.request

URL = os.environ.get("WEBGENTZ_URL", "http://127.0.0.1:8765") + "/event"


# The app Claude Code is running in, so clicking the agent can bring it back.
APPS_BY_BUNDLE = {
    "com.apple.Terminal": "Terminal",
    "com.googlecode.iterm2": "iTerm2",
    "com.microsoft.VSCode": "Visual Studio Code",
    "com.todesktop.230313mzl4w4u92": "Cursor",
    "com.exafunction.windsurf": "Windsurf",
    "dev.zed.Zed": "Zed",
    "dev.warp.Warp-Stable": "Warp",
    "com.mitchellh.ghostty": "Ghostty",
    "com.github.wez.wezterm": "WezTerm",
    "org.alacritty": "Alacritty",
    "net.kovidgoyal.kitty": "kitty",
    "com.anthropic.claudefordesktop": "Claude",
}
APPS_BY_TERM_PROGRAM = {
    "Apple_Terminal": "Terminal",
    "iTerm.app": "iTerm2",
    "vscode": "Visual Studio Code",
    "WarpTerminal": "Warp",
    "ghostty": "Ghostty",
    "WezTerm": "WezTerm",
}


def find_tty():
    """The terminal tab Claude Code runs in, found by walking up to the parent processes."""
    pid = os.getppid()
    for _ in range(4):
        out = subprocess.run(["ps", "-o", "tty=,ppid=", "-p", str(pid)],
                             capture_output=True, text=True, timeout=1).stdout.split()
        if len(out) != 2:
            return None
        tty, parent = out
        if tty not in ("?", "??", "-"):
            return tty if tty.startswith("/dev/") else f"/dev/{tty}"
        pid = int(parent)
    return None


def where_am_i(env=os.environ):
    where = {}
    app = APPS_BY_BUNDLE.get(env.get("__CFBundleIdentifier", "")) or APPS_BY_TERM_PROGRAM.get(env.get("TERM_PROGRAM", ""))
    if app:
        where["app"] = app
    if app in ("Terminal", "iTerm2"):
        try:
            tty = find_tty()
        except (OSError, ValueError, subprocess.SubprocessError):
            tty = None
        if tty:
            where["tty"] = tty
    return where


def transform(payload):
    """Turn a Claude Code hook payload into a Webgentz event."""
    # Claude Code uses `agent_type` for the kind of helper agent (for example
    # "general-purpose"). In Webgentz that field picks the animal, so keep
    # Claude Code's value under another name.
    if "agent_type" in payload:
        payload["helper_type"] = payload.pop("agent_type")
    payload["agent_type"] = "claude-code"
    # Only look this up when a session starts or gets new orders; it rarely changes.
    if payload.get("hook_event_name") in ("SessionStart", "UserPromptSubmit"):
        where = where_am_i()
        if where:
            payload["open"] = where
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
