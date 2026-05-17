"""OpenTelemetry tracing setup (Feb 2026, Task 4 of Commercial-Grade Audit).

What this adds
--------------
Per-request tracing for every FastAPI route + MongoDB query + httpx call.
Output: console exporter by default (greppable in supervisor logs). Designed
to be swapped to Sentry / Honeycomb / Datadog later by changing one env var.

Activation
----------
Set env var ENABLE_OTEL=1 to turn it on. Default = off so the live pitch and
dev iteration aren't slowed by trace overhead. When enabled:

  - Each `/api/...` route emits a `<verb> <path>` span with status_code,
    user agent, etc.
  - Each pymongo query emits a sub-span with collection + op-name.
  - Each outgoing httpx call (xAI, Stripe, Resend, etc.) emits a sub-span.

Exporters
---------
ENABLE_OTEL=1                       → ConsoleSpanExporter (stdout)
ENABLE_OTEL=1 OTEL_EXPORTER=otlp    → OTLPSpanExporter (Honeycomb/Tempo/etc.)
                                       Reads OTEL_EXPORTER_OTLP_ENDPOINT.
"""

from __future__ import annotations

import os

from config import logger


def setup_tracing(app) -> bool:
    """Install OpenTelemetry instrumentation. Returns True if enabled."""
    if os.environ.get("ENABLE_OTEL", "").strip() not in ("1", "true", "True", "yes"):
        return False

    try:
        from opentelemetry import trace
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
        from opentelemetry.instrumentation.pymongo import PymongoInstrumentor
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import (
            BatchSpanProcessor,
            ConsoleSpanExporter,
        )
        from opentelemetry.semconv.resource import ResourceAttributes
    except ImportError as e:
        logger.warning(f"OTel disabled: import failure ({e})")
        return False

    service_name = os.environ.get("OTEL_SERVICE_NAME", "carryon-backend")
    resource = Resource.create(
        {
            ResourceAttributes.SERVICE_NAME: service_name,
            ResourceAttributes.SERVICE_VERSION: "1.0.0",
            ResourceAttributes.DEPLOYMENT_ENVIRONMENT: os.environ.get("DEPLOYMENT_ENV", "preview"),
        }
    )
    provider = TracerProvider(resource=resource)

    exporter_kind = os.environ.get("OTEL_EXPORTER", "console").lower()
    if exporter_kind == "otlp":
        try:
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
                OTLPSpanExporter,
            )

            provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
            logger.info(
                f"OTel OTLP exporter enabled → {os.environ.get('OTEL_EXPORTER_OTLP_ENDPOINT', 'default endpoint')}"
            )
        except ImportError:
            logger.warning("OTel OTLP exporter requested but package not installed; falling back to console.")
            provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
    else:
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
        logger.info("OTel console exporter enabled (set OTEL_EXPORTER=otlp for prod backend)")

    trace.set_tracer_provider(provider)

    # Instrument FastAPI (HTTP routes), pymongo (queries), httpx (outbound HTTP).
    # excluded_urls drops noisy probe endpoints from traces.
    FastAPIInstrumentor.instrument_app(app, excluded_urls="health,health/live,health/ready,docs,openapi.json,redoc")
    PymongoInstrumentor().instrument()
    HTTPXClientInstrumentor().instrument()

    logger.info(f"✅ OpenTelemetry tracing active (service={service_name}, exporter={exporter_kind})")
    return True
