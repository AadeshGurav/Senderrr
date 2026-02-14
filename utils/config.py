"""Runtime configuration — DB overrides with django.conf.settings fallback."""

from __future__ import annotations

import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def get_config(key: str, cast: type = str) -> object:
    """Return a config value, checking DB first then django.conf.settings.

    Args:
        key: The setting name (e.g. ``"SCRAPER_TARGET_URL"``).
        cast: Type to cast the DB string value to (e.g. ``int``, ``float``).

    Returns:
        The setting value, cast to the requested type.
    """
    from apps.dashboard.models import RuntimeSetting

    try:
        setting = RuntimeSetting.objects.filter(key=key).first()
        if setting is not None:
            return cast(setting.value)
    except Exception:
        logger.debug("Could not read RuntimeSetting for %s, using fallback.", key)

    return getattr(settings, key)
