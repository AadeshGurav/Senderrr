"""Structured JSON log formatter for production observability."""

from __future__ import annotations

import json
import logging
import traceback
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """Emit log records as single-line JSON for Docker log aggregation.

    Each line contains: timestamp, level, logger, message, and optional
    exception info. Easy to parse with ``jq``, Loki, or CloudWatch.
    """

    def format(self, record: logging.LogRecord) -> str:
        """Format the log record as a JSON string."""
        entry: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }

        if record.exc_info and record.exc_info[1] is not None:
            entry["exception"] = traceback.format_exception(*record.exc_info)

        if hasattr(record, "task_id"):
            entry["task_id"] = record.task_id

        return json.dumps(entry, default=str, ensure_ascii=False)
