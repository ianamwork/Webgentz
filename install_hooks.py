"""Connect Claude Code to the Webgentz jungle.

Adds the Webgentz hook to your Claude Code settings so every session reports
to the jungle. Your existing settings are kept, and a backup copy is saved
next to the file before anything changes.

    python3 install_hooks.py              # add the hook to ~/.claude/settings.json
    python3 install_hooks.py --dry-run    # show what would change, change nothing
    python3 install_hooks.py --uninstall  # remove the Webgentz hook again
"""

import argparse
import json
import shlex
import shutil
import sys
import time
from pathlib import Path

EVENTS_WITH_TOOLS = ["PreToolUse", "PostToolUse"]
EVENTS_WITHOUT_TOOLS = [
    "SessionStart", "UserPromptSubmit", "Notification", "Stop", "SubagentStop", "SessionEnd",
]
MARKER = "webgentz_hook.py"


def hook_command():
    hook = Path(__file__).resolve().parent / "webgentz_hook.py"
    return f"{shlex.quote(sys.executable)} {shlex.quote(str(hook))}"


def is_ours(entry):
    return any(MARKER in str(h.get("command", "")).lower() for h in entry.get("hooks", []))


def remove_ours(settings):
    hooks = settings.get("hooks", {})
    for event in list(hooks):
        hooks[event] = [e for e in hooks[event] if not is_ours(e)]
        if not hooks[event]:
            del hooks[event]
    if not hooks:
        settings.pop("hooks", None)


def add_ours(settings):
    remove_ours(settings)  # never add twice
    hooks = settings.setdefault("hooks", {})
    command = {"type": "command", "command": hook_command(), "timeout": 5}
    for event in EVENTS_WITH_TOOLS:
        hooks.setdefault(event, []).append({"matcher": "*", "hooks": [command]})
    for event in EVENTS_WITHOUT_TOOLS:
        hooks.setdefault(event, []).append({"hooks": [command]})


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--settings", default=str(Path.home() / ".claude" / "settings.json"),
                        help="settings file to edit (default: ~/.claude/settings.json)")
    parser.add_argument("--dry-run", action="store_true", help="print the result without saving")
    parser.add_argument("--uninstall", action="store_true", help="remove the Webgentz hook")
    args = parser.parse_args()

    path = Path(args.settings).expanduser()
    settings = {}
    if path.exists():
        try:
            settings = json.loads(path.read_text() or "{}")
        except json.JSONDecodeError:
            sys.exit(f"{path} is not valid JSON, so I left it alone. Fix it and run this again.")

    if args.uninstall:
        remove_ours(settings)
    else:
        add_ours(settings)

    result = json.dumps(settings, indent=2) + "\n"
    if args.dry_run:
        print(result)
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        backup = path.with_name(f"{path.name}.backup-{time.strftime('%Y%m%d-%H%M%S')}")
        shutil.copy2(path, backup)
        print(f"Backed up your old settings to {backup}")
    path.write_text(result)
    if args.uninstall:
        print(f"Removed the Webgentz hook from {path}")
    else:
        print(f"Added the Webgentz hook to {path}")
        print("New Claude Code sessions will now show up in the jungle.")


if __name__ == "__main__":
    main()
