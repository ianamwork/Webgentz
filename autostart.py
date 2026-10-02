"""Keep the Webgentz jungle running in the background on a Mac.

Sets up a macOS "launch agent", which starts server.py when you log in and
restarts it if it ever crashes. You never have to remember to launch it.

    python3 autostart.py install     # start now and at every login
    python3 autostart.py status      # is it running?
    python3 autostart.py uninstall   # stop it and remove the auto-start
    python3 autostart.py install --dry-run   # show the file without changing anything
"""

import argparse
import os
import plistlib
import subprocess
import sys
import urllib.request
from pathlib import Path

LABEL = "com.webgentz.server"
ROOT = Path(__file__).resolve().parent
PLIST_PATH = Path.home() / "Library" / "LaunchAgents" / f"{LABEL}.plist"
LOG_PATH = Path.home() / "Library" / "Logs" / "webgentz.log"
PORT = os.environ.get("WEBGENTZ_PORT", "8765")


def launch_agent():
    """The settings macOS uses to run the server."""
    return {
        "Label": LABEL,
        "ProgramArguments": [sys.executable, str(ROOT / "server.py")],
        "WorkingDirectory": str(ROOT),
        "RunAtLoad": True,       # start at login
        "KeepAlive": True,       # restart if it stops
        "ThrottleInterval": 10,  # wait 10s between restarts if it keeps crashing
        "StandardOutPath": str(LOG_PATH),
        "StandardErrorPath": str(LOG_PATH),
        "EnvironmentVariables": {"WEBGENTZ_PORT": PORT, "PYTHONUNBUFFERED": "1"},
    }


def launchctl(*args):
    return subprocess.run(["launchctl", *args], capture_output=True, text=True)


def domain():
    return f"gui/{os.getuid()}"


def is_running():
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/state", timeout=1).close()
        return True
    except Exception:
        return False


def warn_about_protected_folders():
    """macOS blocks background programs from reading these folders without asking."""
    home = Path.home()
    for name in ("Documents", "Desktop", "Downloads"):
        if (home / name) in ROOT.parents:
            print(f"Heads up: Webgentz is inside ~/{name}. macOS stops background programs from")
            print(f"reading that folder, so the jungle may fail to start. If `status` says it is not")
            print(f"running, move the Webgentz folder somewhere like ~/code and run install again.\n")
            return


def install(dry_run):
    warn_about_protected_folders()
    data = plistlib.dumps(launch_agent()).decode()
    if dry_run:
        print(f"Would write {PLIST_PATH}:\n")
        print(data)
        return
    PLIST_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    launchctl("bootout", f"{domain()}/{LABEL}")  # stop an older copy, if any
    PLIST_PATH.write_text(data)
    result = launchctl("bootstrap", domain(), str(PLIST_PATH))
    if result.returncode != 0:
        # older versions of macOS use the "load" command instead
        result = launchctl("load", "-w", str(PLIST_PATH))
    if result.returncode != 0:
        sys.exit(f"macOS would not start the jungle:\n{result.stderr.strip()}")
    print("The jungle now starts by itself whenever you log in.")
    print(f"Open http://localhost:{PORT}  ·  logs: {LOG_PATH}")


def uninstall():
    launchctl("bootout", f"{domain()}/{LABEL}")
    if PLIST_PATH.exists():
        launchctl("unload", "-w", str(PLIST_PATH))
        PLIST_PATH.unlink()
        print("Removed the auto-start. The jungle will not start at login anymore.")
    else:
        print("The auto-start was not installed.")


def status():
    installed = PLIST_PATH.exists()
    print(f"Auto-start: {'installed' if installed else 'not installed'}")
    print(f"Server:     {'running at http://localhost:' + PORT if is_running() else 'not running'}")
    if installed and not is_running():
        print(f"Check the log for errors: {LOG_PATH}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["install", "uninstall", "status"])
    parser.add_argument("--dry-run", action="store_true", help="with install: print the file, change nothing")
    args = parser.parse_args()

    if args.command == "status":
        return status()
    if sys.platform != "darwin" and not args.dry_run:
        sys.exit("Auto-start only works on a Mac for now. Run `python3 server.py` instead.")
    if args.command == "install":
        install(args.dry_run)
    else:
        uninstall()


if __name__ == "__main__":
    main()
