#!/usr/bin/env python3
"""Cross-platform system doctor — diagnose and repair the environment.

Checks every dependency, only fixes what is broken, never reinstalls
what already works. Safe to run repeatedly.

Usage:
    python scripts/doctor.py           # check and fix
    python scripts/doctor.py --check   # check only, don't fix anything
"""

from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

# Resolve project root (parent of scripts/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
REQUIREMENTS = PROJECT_ROOT / "requirements.txt"
ENV_EXAMPLE = PROJECT_ROOT / ".env.example"
ENV_FILE = PROJECT_ROOT / ".env"
VENV_DIR = PROJECT_ROOT / ".venv"

IS_WINDOWS = platform.system() == "Windows"
PYTHON_BIN = VENV_DIR / ("Scripts" if IS_WINDOWS else "bin") / "python"
PIP_BIN = VENV_DIR / ("Scripts" if IS_WINDOWS else "bin") / "pip"

# ANSI colours (disabled on Windows cmd without VT support)
_COLOR = not IS_WINDOWS or os.environ.get("WT_SESSION")  # Windows Terminal
GREEN = "\033[0;32m" if _COLOR else ""
YELLOW = "\033[1;33m" if _COLOR else ""
RED = "\033[0;31m" if _COLOR else ""
CYAN = "\033[0;36m" if _COLOR else ""
NC = "\033[0m" if _COLOR else ""


def ok(msg: str) -> None:
    print(f"  {GREEN}OK{NC}      {msg}")


def fixed(msg: str) -> None:
    print(f"  {CYAN}FIXED{NC}   {msg}")


def warn(msg: str) -> None:
    print(f"  {YELLOW}WARN{NC}    {msg}")


def fail(msg: str) -> None:
    print(f"  {RED}FAIL{NC}    {msg}")


def _run(cmd: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
    """Run a subprocess with sensible defaults."""
    return subprocess.run(
        cmd, capture_output=True, text=True, cwd=str(PROJECT_ROOT), **kwargs
    )


def _resolve_compose_cmd() -> str:
    """Return the available Docker Compose command (v2 plugin or v1 standalone)."""
    if shutil.which("docker"):
        result = _run(["docker", "compose", "version"])
        if result.returncode == 0:
            return "docker compose"
    if shutil.which("docker-compose"):
        return "docker-compose"
    return ""


# ── Checks ────────────────────────────────────────────────────────────


def check_python_version() -> bool:
    """Python 3.10+ is required."""
    major, minor = sys.version_info[:2]
    if (major, minor) >= (3, 10):
        ok(f"Python {major}.{minor}")
        return True
    fail(f"Python {major}.{minor} — need 3.10+")
    return False


def check_venv(*, fix: bool) -> bool:
    """Virtual environment exists with a working pip."""
    if VENV_DIR.is_dir() and PYTHON_BIN.is_file():
        if PIP_BIN.is_file():
            ok(f"Virtual environment at {VENV_DIR.name}/")
            return True
        if not fix:
            fail("Virtual environment exists but pip is missing (ensurepip absent)")
            return False
        return _bootstrap_pip()
    if not fix:
        fail("Virtual environment missing")
        return False
    _run([sys.executable, "-m", "venv", str(VENV_DIR)])
    if not PYTHON_BIN.is_file():
        fail("Could not create virtual environment")
        return False
    fixed("Created virtual environment")
    if PIP_BIN.is_file():
        return True
    return _bootstrap_pip()


def _bootstrap_pip() -> bool:
    """Download get-pip.py and bootstrap pip into the venv."""
    import urllib.request

    get_pip = Path("/tmp/get-pip.py")
    try:
        urllib.request.urlretrieve("https://bootstrap.pypa.io/get-pip.py", str(get_pip))
    except Exception as exc:
        fail(f"Failed to download get-pip.py: {exc}")
        return False
    result = _run([str(PYTHON_BIN), str(get_pip), "--quiet"])
    get_pip.unlink(missing_ok=True)
    if result.returncode == 0 and PIP_BIN.is_file():
        fixed("Bootstrapped pip via get-pip.py")
        return True
    fail(f"pip bootstrap failed: {result.stderr.strip()[:200]}")
    return False


def _parse_requirements() -> list[str]:
    """Return normalised package names from requirements.txt."""
    packages: list[str] = []
    for line in REQUIREMENTS.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name = line.split(">=")[0].split("==")[0].split("<")[0].strip()
        packages.append(name.lower().replace("-", "_"))
    return packages


def _installed_packages() -> set[str]:
    """Return set of installed package names in the venv."""
    result = _run([str(PIP_BIN), "list", "--format=columns"])
    installed: set[str] = set()
    for line in result.stdout.splitlines()[2:]:  # skip header
        parts = line.split()
        if parts:
            installed.add(parts[0].lower().replace("-", "_"))
    return installed


def check_pip_packages(*, fix: bool) -> bool:
    """All requirements.txt packages are installed."""
    if not PIP_BIN.is_file():
        fail("pip not found — venv may be broken")
        return False

    required = _parse_requirements()
    installed = _installed_packages()
    missing = [pkg for pkg in required if pkg not in installed]

    if not missing:
        ok(f"All {len(required)} pip packages installed")
        return True

    if not fix:
        fail(f"Missing packages: {', '.join(missing)}")
        return False

    print(f"  {CYAN}FIX{NC}     Installing {len(missing)} missing: {', '.join(missing)}")
    result = _run([str(PIP_BIN), "install", "-r", str(REQUIREMENTS), "--quiet"])
    if result.returncode == 0:
        fixed(f"Installed {len(missing)} missing packages")
        return True
    fail(f"pip install failed: {result.stderr.strip()[:200]}")
    return False


def check_playwright_browser(*, fix: bool) -> bool:
    """Playwright Chromium binary is downloaded."""
    result = _run([str(PYTHON_BIN), "-c", (
        "from playwright.sync_api import sync_playwright; "
        "pw = sync_playwright().start(); "
        "path = pw.chromium.executable_path; "
        "pw.stop(); "
        "print(path)"
    )])

    if result.returncode == 0 and result.stdout.strip():
        browser_path = Path(result.stdout.strip())
        if browser_path.exists():
            ok(f"Playwright Chromium at .../{browser_path.parent.name}/{browser_path.name}")
            return True

    if not fix:
        fail("Playwright Chromium not installed")
        return False

    playwright_bin = VENV_DIR / ("Scripts" if IS_WINDOWS else "bin") / "playwright"
    result = _run([str(playwright_bin), "install", "chromium"])
    if result.returncode == 0:
        fixed("Installed Playwright Chromium")
        return True
    fail(f"Playwright install failed: {result.stderr.strip()[:200]}")
    return False


def check_redis() -> bool:
    """Redis is reachable on the configured broker URL."""
    result = _run([str(PYTHON_BIN), "-c", (
        "import redis; "
        "r = redis.Redis(); "
        "assert r.ping(); "
        "print('ok')"
    )])
    if result.returncode == 0 and "ok" in result.stdout:
        ok("Redis responding on localhost:6379")
        return True

    compose_cmd = _resolve_compose_cmd()
    if compose_cmd:
        warn(f"Redis not responding — try: {compose_cmd} up -d redis")
    else:
        warn("Redis not responding — install Docker or Redis manually")
    return False


def check_env_file(*, fix: bool) -> bool:
    """.env file exists with a real target URL."""
    if not ENV_FILE.is_file():
        if not fix:
            fail(".env file missing")
            return False
        shutil.copy2(str(ENV_EXAMPLE), str(ENV_FILE))
        fixed("Created .env from .env.example")
        warn("Edit .env and set SCRAPER_TARGET_URL")
        return True

    content = ENV_FILE.read_text()
    if "example.com/articles" in content:
        warn(".env exists but SCRAPER_TARGET_URL is still the placeholder")
        return True  # file exists, just needs editing

    ok(".env configured")
    return True


def check_migrations(*, fix: bool) -> bool:
    """Django migrations are up to date."""
    result = _run([str(PYTHON_BIN), "manage.py", "showmigrations", "--plan"])
    if result.returncode != 0:
        fail(f"Cannot check migrations: {result.stderr.strip()[:200]}")
        return False

    unapplied = [
        line for line in result.stdout.splitlines()
        if line.strip().startswith("[ ]")
    ]

    if not unapplied:
        ok("All migrations applied")
        return True

    if not fix:
        fail(f"{len(unapplied)} unapplied migrations")
        return False

    result = _run([str(PYTHON_BIN), "manage.py", "migrate", "--no-input"])
    if result.returncode == 0:
        fixed(f"Applied {len(unapplied)} migrations")
        return True
    fail(f"migrate failed: {result.stderr.strip()[:200]}")
    return False


def check_docker() -> bool:
    """Docker is available (needed for Redis)."""
    if shutil.which("docker"):
        ok("Docker available")
        return True
    warn("Docker not found — needed for Redis container")
    return False


# ── Main ──────────────────────────────────────────────────────────────


def main() -> None:
    """Run all checks, optionally fixing issues."""
    parser = argparse.ArgumentParser(description="Diagnose and repair the environment.")
    parser.add_argument(
        "--check", action="store_true",
        help="Check only — don't fix anything.",
    )
    args = parser.parse_args()
    fix = not args.check

    os.chdir(PROJECT_ROOT)

    mode = "check-only" if not fix else "check & fix"
    print(f"\n{GREEN}WhatsApp Automation — Doctor ({mode}){NC}")
    print(f"  Platform: {platform.system()} {platform.machine()}")
    print(f"  Python:   {sys.version.split()[0]}")
    print(f"  Project:  {PROJECT_ROOT}\n")

    results: list[tuple[str, bool]] = []

    results.append(("Python version", check_python_version()))
    results.append(("Virtual environment", check_venv(fix=fix)))

    # Everything below needs the venv to exist
    if not PYTHON_BIN.is_file():
        fail("Cannot continue without a virtual environment.")
        sys.exit(1)

    results.append(("Pip packages", check_pip_packages(fix=fix)))
    results.append(("Playwright Chromium", check_playwright_browser(fix=fix)))
    results.append(("Docker", check_docker()))
    results.append(("Redis", check_redis()))
    results.append((".env file", check_env_file(fix=fix)))
    results.append(("Django migrations", check_migrations(fix=fix)))

    # Summary
    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    print(f"\n{'=' * 45}")

    if passed == total:
        print(f"  {GREEN}All {total} checks passed. Ready to go.{NC}")
        print("  Start with: honcho start\n")
    else:
        warnings = total - passed
        print(f"  {passed}/{total} passed, {warnings} need attention.")
        if not fix:
            print("  Run without --check to auto-fix: python scripts/doctor.py\n")
        else:
            print("  See warnings above for manual steps.\n")


if __name__ == "__main__":
    main()
