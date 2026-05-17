"""CarryOn™ — Structured JSON log formatter + PII redaction (Feb 2026).

Two opt-in capabilities:

1. **PII REDACTION** (env: REDACT_PII=1, default ON in production).
   Every log line is filtered through `_redact()` before serialization. The
   redactor catches the most common SOC2/GDPR mistakes:
     * email addresses    → `<redacted:email>`
     * US SSN (\\d{3}-\\d{2}-\\d{4})     → `<redacted:ssn>`
     * phone numbers (E.164 + US 10-digit)  → `<redacted:phone>`
     * credit-card-ish 13-19 digit runs    → `<redacted:cc>`
     * JWT tokens (eyJ…)  → `<redacted:jwt>`
     * Bearer tokens in raw strings → `<redacted:bearer>`

   Caller can opt-out a particular log line by setting `extra={"_skip_pii_redact": True}`.

2. **STRUCTURED JSON OUTPUT** (env: LOG_FORMAT=json).
   See JsonFormatter — Datadog/Honeycomb/CloudWatch-ingestible JSON.

DEFAULT
-------
Without any env var set, logging falls back to the pre-existing
human-readable format AND skips PII redaction (so local dev sees full
values). Production MUST set `REDACT_PII=1` and `LOG_FORMAT=json`.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any


# ── PII redactor ────────────────────────────────────────────────────────────

_PII_PATTERNS = [
    (re.compile(r"\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b"), "<redacted:jwt>"),
    (re.compile(r"Bearer\s+[A-Za-z0-9._\-]{20,}", re.IGNORECASE), "Bearer <redacted:bearer>"),
    (re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"), "<redacted:email>"),
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "<redacted:ssn>"),
    (re.compile(r"\b(?:\d[ -]?){13,19}\b"), "<redacted:cc>"),
    (re.compile(r"\+[1-9]\d{6,14}\b"), "<redacted:phone>"),
    (re.compile(r"\(\d{3}\)\s?\d{3}[-\s]?\d{4}"), "<redacted:phone>"),
    (re.compile(r"(?<!\d)\d{3}[-\s]\d{3}[-\s]\d{4}(?!\d)"), "<redacted:phone>"),
]


def _redact_str(text: str) -> str:
    if not text:
        return text
    for pattern, repl in _PII_PATTERNS:
        text = pattern.sub(repl, text)
    return text


def _redact_obj(obj: Any) -> Any:
    if isinstance(obj, str):
        return _redact_str(obj)
    if isinstance(obj, dict):
        return {k: _redact_obj(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return type(obj)(_redact_obj(v) for v in obj)
    return obj


def _redact_enabled() -> bool:
    val = os.environ.get("REDACT_PII", "").strip().lower()
    return val in ("1", "true", "yes")


class _PIIRedactFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if getattr(record, "_skip_pii_redact", False):
            return True
        try:
            rendered = record.getMessage()
            redacted = _redact_str(rendered)
            if redacted != rendered:
                record.msg = redacted
                record.args = ()
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
            for key in list(record.__dict__.keys()):
                if key in skip or key.startswith("_"):
                    continue
                val = record.__dict__[key]
                if isinstance(val, (str, dict, list, tuple)):
                    record.__dict__[key] = _redact_obj(val)
        except Exception:
            pass
        return True


# ── JSON formatter ──────────────────────────────────────────────────────────


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)) + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for field in ("user_id", "request_id", "estate_id", "trace_id"):
            val = getattr(record, field, None)
            if val:
                payload[field] = val
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
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
    root = logging.getLogger()

    if _redact_enabled():
        pii_filter = _PIIRedactFilter()
        for handler in root.handlers:
            handler.addFilter(pii_filter)
        if not root.handlers:
            h = logging.StreamHandler()
            h.addFilter(pii_filter)
            root.addHandler(h)
        root.addFilter(pii_filter)
        root.info("PII redaction filter installed (REDACT_PII=1)")

    if os.environ.get("LOG_FORMAT", "").strip().lower() == "json":
        fmt = JsonFormatter()
        for handler in root.handlers:
            handler.setFormatter(fmt)
        if not root.handlers:
            h = logging.StreamHandler()
            h.setFormatter(fmt)
            root.addHandler(h)
        root.info("Structured JSON logging enabled (LOG_FORMAT=json)")
