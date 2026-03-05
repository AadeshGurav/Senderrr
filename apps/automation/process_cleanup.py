"""Process cleanup — kill stale Django/Celery processes."""

from __future__ import annotations

import os
import subprocess


def kill_stale_services() -> None:
    """Kill leftover Django/Celery processes from a previous run."""
    for cmd in (
        ["lsof", "-ti", ":8000"],
        ["pgrep", "-f", "celery.*worker"],
        ["pgrep", "-f", "celery.*beat"],
    ):
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            for pid in result.stdout.strip().split():
                if pid.isdigit() and int(pid) != os.getpid():
                    subprocess.run(["kill", "-9", pid], capture_output=True, timeout=5)
        except Exception:
            continue
