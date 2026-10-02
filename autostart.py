"""Keep Webgentz running in the background on a Mac.

Sets up macOS "launch agents", which start Webgentz programs when you log in
and restart them if they ever crash. You never have to remember to launch them.

    python3 autostart.py install                 # the jungle server
    python3 autostart.py install proxy codex     # also the API proxy and the Codex watcher
    python3 autostart.py status                  # what is installed and running
    python3 autostart.py uninstall               # remove everything Webgentz installed
    python3 autostart.py install --dry-run       # show the files without changing anything
"""

import argparse
import os
import plistlib
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
AGENTS_DIR = Path.home() / "Library" / "LaunchAgents"
LOG_DIR = Path.home() / "Library" / "Logs"
PORT = os.environ.get("WEBGENTZ_PORT", "8765")
PROXY_PORT = os.environ.get("WEBGENTZ_PROXY_PORT", "8766")

# name -> (script, how to check it is running)
SERVICES = {
    "server": ("server.py", f"http://127.0.0.1:{PORT}/api/state"),
    "proxy": ("proxy.py", f"http://127.0.0.1:{PROXY_PORT}/"),
    "codex": ("codex_watch.py", None),
}


def label(name):
    return f"com.webgentz.{name}"


def plist_path(name):
    return AGENTS_DIR / f"{label(name)}.plist"


def log_path(name):
    return LOG_DIR / ("webgentz.log" if name == "server" else f"webgentz-{name}.log")


def launch_agent(name):
    """The settings macOS uses to run one Webgentz program."""
    script, _ = SERVICES[name]
    return {
        "Label": label(name),
        "ProgramArguments": [sys.executable, str(ROOT / script)],
        "WorkingDirectory": str(ROOT),
        "RunAtLoad": True,       # start at login
        "KeepAlive": True,       # restart if it stops
        "ThrottleInterval": 10,  # wait 10s between restarts if it keeps crashing
        "StandardOutPath": str(log_path(name)),
        "StandardErrorPath": str(log_path(name)),
        "EnvironmentVariables": {"WEBGENTZ_PORT": PORT, "WEBGENTZ_PROXY_PORT": PROXY_PORT,
                                 "PYTHONUNBUFFERED": "1"},
    }


def launchctl(*args):
    return subprocess.run(["launchctl", *args], capture_output=True, text=True)


def domain():
    return f"gui/{os.getuid()}"


def is_running(name):
    _, url = SERVICES[name]
    if url is None:  # no web address to check; ask macOS instead
        if sys.platform != "darwin":
            return False
        return launchctl("print", f"{domain()}/{label(name)}").returncode == 0
    try:
        urllib.request.urlopen(url, timeout=1).close()
        return True
    except urllib.error.HTTPError:
        return True  # it answered, so it is running
    except Exception:
        return False


def warn_about_protected_folders():
    """macOS blocks background programs from reading these folders without asking."""
    home = Path.home()
    for folder in ("Documents", "Desktop", "Downloads"):
        if (home / folder) in ROOT.parents:
            print(f"Heads up: Webgentz is inside ~/{folder}. macOS stops background programs from")
            print("reading that folder, so Webgentz may fail to start. If `status` says it is not")
            print("running, move the Webgentz folder somewhere like ~/code and run install again.\n")
            return


def install(names, dry_run):
    warn_about_protected_folders()
    for name in names:
        data = plistlib.dumps(launch_agent(name)).decode()
        if dry_run:
            print(f"Would write {plist_path(name)}:\n\n{data}")
            continue
        AGENTS_DIR.mkdir(parents=True, exist_ok=True)
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        launchctl("bootout", f"{domain()}/{label(name)}")  # stop an older copy, if any
        plist_path(name).write_text(data)
        result = launchctl("bootstrap", domain(), str(plist_path(name)))
        if result.returncode != 0:
            # older versions of macOS use the "load" command instead
            result = launchctl("load", "-w", str(plist_path(name)))
        if result.returncode != 0:
            sys.exit(f"macOS would not start {name}:\n{result.stderr.strip()}")
        print(f"{name}: now starts by itself whenever you log in (log: {log_path(name)})")
    if not dry_run and "server" in names:
        print(f"Open http://localhost:{PORT}")


def uninstall():
    removed = False
    for name in SERVICES:
        launchctl("bootout", f"{domain()}/{label(name)}")
        if plist_path(name).exists():
            launchctl("unload", "-w", str(plist_path(name)))
            plist_path(name).unlink()
            print(f"{name}: auto-start removed")
            removed = True
    if not removed:
        print("Nothing was installed.")


def status():
    for name in SERVICES:
        installed = "installed" if plist_path(name).exists() else "not installed"
        running = "running" if is_running(name) else "not running"
        print(f"{name:<7} auto-start {installed:<14} {running}")
        if plist_path(name).exists() and running == "not running":
            print(f"        check the log for errors: {log_path(name)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["install", "uninstall", "status"])
    parser.add_argument("services", nargs="*", help="with install: server (default), proxy, codex")
    parser.add_argument("--dry-run", action="store_true", help="with install: print the files, change nothing")
    args = parser.parse_args()

    unknown = [s for s in args.services if s not in SERVICES]
    if unknown:
        sys.exit(f"Unknown program: {', '.join(unknown)}. Choose from: {', '.join(SERVICES)}")
    if args.command == "status":
        return status()
    if sys.platform != "darwin" and not args.dry_run:
        sys.exit("Auto-start only works on a Mac for now. Run the scripts with python3 instead.")
    if args.command == "install":
        names = ["server"] + [s for s in args.services if s != "server"]
        install(names, args.dry_run)
    else:
        uninstall()


if __name__ == "__main__":
    main()
