"""CarryOn™ — Structured JSON log formatter (Feb 2026).

Opt-in via env var LOG_FORMAT=json. When set, every backend log line is
emitted as a JSON object instead of the human-readable format. Datadog,
Honeycomb, CloudWatch, Loki, and Sentry all auto-ingest JSON lines, so
flipping this in production gives free queryable logs.

Default (LOG_FORMAT unset) keeps the existing human-readable format so the
live pitch console output isn't disrupted.

Schema per log line:
{
  "ts": "2026-02-12T15:30:00.000Z",
  "level": "INFO",
  "logger": "config",
  "msg": "User logged in",
  "user_id": "...",       # if available
  "request_id": "...",    # if available
  "extra": { ... }        # any extra=... kwarg the caller passed
}
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)) + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        # Standard request-context fields if present
        for field in ("user_id", "request_id", "estate_id", "trace_id"):
            val = getattr(record, field, None)
            if val:
                payload[field] = val
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        # Stash anything the caller attached via extra={"foo": "bar"}
        skip = {
            "name",
            "msg",
            "args",
            "levelname",
            "levelno",
            "pathname",
            "filename",
            "module",
            "exc_info",
            "exc_text",
            "stack_info",
            "lineno",
            "funcName",
            "created",
            "msecs",
            "relativeCreated",
            "thread",
            "threadName",
            "processName",
            "process",
            "message",
            "asctime",
        }
        extras = {k: v for k, v in record.__dict__.items() if k not in skip and not k.startswith("_")}
        if extras:
            payload["extra"] = extras
        return json.dumps(payload, default=str)


def install() -> None:
    """Replace the default formatter on the root logger if LOG_FORMAT=json."""
    if os.environ.get("LOG_FORMAT", "").strip().lower() != "json":
        return
    root = logging.getLogger()
    fmt = JsonFormatter()
    for handler in root.handlers:
        handler.setFormatter(fmt)
    # Also add a fresh handler if root has none
    if not root.handlers:
        h = logging.StreamHandler()
        h.setFormatter(fmt)
        root.addHandler(h)
    root.info("Structured JSON logging enabled (LOG_FORMAT=json)")
