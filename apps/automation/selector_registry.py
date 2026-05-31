"""Selector registry — DB-backed, self-healing, self-learning CSS selector store.

Four-layer resilience for WhatsApp Web DOM rotation:
  1. Process-local cache — zero DB round-trips within the same worker process.
  2. DB-persisted best-known selector — shared across all workers instantly.
  3. Hardcoded defaults — multi-version fallback list, no DB required.
  4. Structural DOM probe — discovers new selectors from the live page,
     persists the result, so every subsequent call benefits immediately.

Self-learning:
  - Every success records ``last_verified_at``, resetting the staleness clock.
  - Every timeout increments ``failed_count``; after ``_PROBE_THRESHOLD``
    consecutive failures the next call probes FIRST (skips the broken selector
    entirely rather than burning ``timeout`` ms on it).
  - Selectors not verified in ``_STALE_DAYS`` days are also probed first.
  - ``validate_all_selectors`` runs full probes and logs drift so selector
    rot is visible before it causes send failures.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import TYPE_CHECKING

from playwright.sync_api import TimeoutError as PlaywrightTimeout

from apps.automation.selector_defaults import (
    SELECTOR_DEFAULTS,
)  # noqa: F401 — re-exported

if TYPE_CHECKING:
    from playwright.sync_api import Page

logger = logging.getLogger(__name__)

# Probe before trying the stored selector when it has failed this many times.
_PROBE_THRESHOLD = 3
# Probe first if the selector hasn't been verified in this many days.
_STALE_DAYS = 8

# Process-local selector cache — keyed by name, holds the CSS string.
# Populated on first DB read; invalidated when update_selector() writes a new value.
_cache: dict[str, str] = {}


def get_selector(name: str) -> str:
    """Return the current best CSS selector for *name*.

    Checks the process-local cache first, then DB, then hardcoded defaults.
    """
    if name in _cache:
        return _cache[name]
    from apps.automation.models import SelectorRecord

    try:
        record = SelectorRecord.objects.filter(name=name).first()
        if record:
            _cache[name] = record.css_selector
            return record.css_selector
    except Exception as exc:
        logger.debug("SelectorRecord read failed (%s): %s", name, exc)
    result = SELECTOR_DEFAULTS.get(name, "")
    _cache[name] = result
    return result


def update_selector(name: str, css_selector: str) -> None:
    """Persist a newly discovered CSS selector, reset failure count, update cache."""
    from django.utils import timezone as tz

    from apps.automation.models import SelectorRecord

    old = _cache.get(name, "")
    if old and old != css_selector:
        logger.warning(
            "Selector drift detected for '%s': %r → %r",
            name,
            old[:60],
            css_selector[:60],
        )
    try:
        record, _ = SelectorRecord.objects.get_or_create(
            name=name, defaults={"css_selector": css_selector}
        )
        record.css_selector = css_selector
        record.failed_count = 0
        record.last_verified_at = tz.now()
        record.save(update_fields=["css_selector", "failed_count", "last_verified_at"])
        _cache[name] = css_selector
        logger.info("Selector updated: %s → %r", name, css_selector[:80])
    except Exception as exc:
        logger.warning("Could not persist selector '%s': %s", name, exc)


def mark_verified(name: str) -> None:
    """Record that the stored selector for *name* worked — reset staleness clock."""
    from django.utils import timezone as tz

    from apps.automation.models import SelectorRecord

    try:
        SelectorRecord.objects.filter(name=name).update(
            last_verified_at=tz.now(),
            failed_count=0,
        )
    except Exception:
        pass


def mark_failed(name: str) -> None:
    """Increment the consecutive-failure counter for *name*.

    Once ``failed_count`` reaches ``_PROBE_THRESHOLD``, the next call to
    ``find_element_resilient`` will probe first instead of waiting on a
    selector that has repeatedly timed out.
    """
    from django.db.models import F

    from apps.automation.models import SelectorRecord

    try:
        updated = SelectorRecord.objects.filter(name=name).update(
            failed_count=F("failed_count") + 1
        )
        if not updated:
            # No record yet — create one with the default selector so we have
            # a row to increment next time.
            SelectorRecord.objects.get_or_create(
                name=name,
                defaults={"css_selector": SELECTOR_DEFAULTS.get(name, "")},
            )
    except Exception as exc:
        logger.debug("mark_failed DB write skipped (%s): %s", name, exc)


def _should_probe_first(name: str) -> bool:
    """Return ``True`` if the selector should be probed before being tried.

    Conditions: ``failed_count >= _PROBE_THRESHOLD`` OR selector not
    verified in more than ``_STALE_DAYS`` days.
    """
    from django.utils import timezone as tz

    from apps.automation.models import SelectorRecord

    try:
        record = (
            SelectorRecord.objects.filter(name=name)
            .only("failed_count", "last_verified_at")
            .first()
        )
        if record is None:
            return False
        if record.failed_count >= _PROBE_THRESHOLD:
            logger.info(
                "Selector '%s' has %d failures — probing first.",
                name,
                record.failed_count,
            )
            return True
        if record.last_verified_at:
            age = tz.now() - record.last_verified_at
            if age > timedelta(days=_STALE_DAYS):
                logger.info(
                    "Selector '%s' is %d days stale — probing first.", name, age.days
                )
                return True
    except Exception as exc:
        logger.debug("_should_probe_first check failed for '%s': %s", name, exc)
    return False


def _probe_and_persist(name: str, page: "Page") -> str | None:
    """Run a structural DOM probe and persist the result to the DB."""
    from apps.automation.selector_probes import run_probe

    discovered = run_probe(name, page)
    if discovered:
        update_selector(name, discovered)
    return discovered


def find_element_resilient(
    page: "Page",
    name: str,
    *,
    timeout: int = 8_000,
):
    """Locate a WhatsApp Web UI element by name with automatic DOM healing.

    Self-learning flow:
      1. If failed recently or stale → probe the DOM first (skip broken selector).
      2. Try the current best selector from cache/DB/defaults.
      3. On success → ``mark_verified`` to keep the staleness clock fresh.
      4. On timeout → ``mark_failed`` (increments counter) then probe DOM.
      5. Probe success → persist new selector; retry once.
      6. All strategies exhausted → dump DOM diagnostic; return ``None``.
    """
    from apps.automation.safety_guards import dump_main_dom

    # Fast-path: if selector is known-broken or stale, probe the live DOM first.
    if _should_probe_first(name):
        new_selector = _probe_and_persist(name, page)
        if new_selector:
            try:
                el = page.wait_for_selector(new_selector, timeout=timeout)
                if el:
                    mark_verified(name)
                    return el
            except PlaywrightTimeout:
                pass  # fall through to stored-selector path

    selector = get_selector(name)
    try:
        el = page.wait_for_selector(selector, timeout=timeout)
        if el:
            mark_verified(name)
            return el
    except PlaywrightTimeout:
        mark_failed(name)
        logger.warning(
            "Selector miss: '%s' (%r) — probing DOM for replacement.",
            name,
            selector[:60],
        )

    new_selector = _probe_and_persist(name, page)
    if not new_selector:
        logger.error(
            "DOM probe found nothing for '%s' — element absent or session expired.",
            name,
        )
        dump_main_dom(page)
        return None

    try:
        el = page.wait_for_selector(new_selector, timeout=timeout)
        logger.info("Healed '%s' with probed selector: %r", name, new_selector)
        mark_verified(name)
        return el
    except PlaywrightTimeout:
        logger.error(
            "Healed selector for '%s' → %r also timed out.", name, new_selector
        )
        dump_main_dom(page)
        return None


def validate_all_selectors(page: "Page") -> dict[str, bool]:
    """Proactively probe all selectors against the live DOM and persist results.

    Runs every Sunday at 3am via celery-beat. Forces a structural probe for
    every selector — regardless of current stored value — so drift is caught
    before it causes send failures during the week. Logs any selector that
    changed since last validation.

    Returns:
        ``{name: found}`` dict indicating which elements were located.
    """
    results: dict[str, bool] = {}
    for name in SELECTOR_DEFAULTS:
        new_selector = _probe_and_persist(name, page)
        if new_selector:
            try:
                el = page.wait_for_selector(new_selector, timeout=5_000)
                results[name] = el is not None
                if el:
                    mark_verified(name)
            except PlaywrightTimeout:
                results[name] = False
        else:
            results[name] = False
    return results
