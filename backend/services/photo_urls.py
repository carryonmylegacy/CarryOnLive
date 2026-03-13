"""CarryOn™ — Photo URL resolution utility.

Converts stored photo keys to absolute served URLs in API responses.
Handles backward compatibility with legacy base64 data URLs.

Auto-detects the backend's public URL from:
1. BACKEND_URL (explicit override)
2. RAILWAY_PUBLIC_DOMAIN (auto-set by Railway in production)
3. FRONTEND_URL (works in preview/ingress setups where frontend=backend URL)
"""

import os

from config import logger


def _detect_backend_url() -> str:
    """Detect the backend's public URL from environment variables."""
    # 1. Explicit override
    explicit = os.environ.get("BACKEND_URL", "").strip().rstrip("/")
    if explicit:
        if not explicit.startswith("http"):
            explicit = f"https://{explicit}"
        return explicit

    # 2. Railway auto-sets this for every deployed service
    railway_domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN", "").strip().rstrip("/")
    if railway_domain:
        url = f"https://{railway_domain}" if not railway_domain.startswith("http") else railway_domain
        return url.rstrip("/")

    # 3. Fallback: FRONTEND_URL (works when frontend and backend share a domain)
    frontend = os.environ.get("FRONTEND_URL", "").strip().rstrip("/")
    if frontend:
        return frontend

    return ""


_BACKEND_URL = _detect_backend_url()
logger.info(f"Photo URL base: {_BACKEND_URL or '(relative — no base URL detected)'}")


def resolve_photo_url(stored_value: str) -> str:
    """Convert a stored photo reference to an absolute URL for API responses.

    - Empty/None → ""
    - "data:..." (legacy base64) → returned as-is
    - "http://..." or "https://..." → returned as-is
    - "/api/photos/..." → absolute URL with backend base
    - "photos/..." (raw storage key) → absolute URL
    """
    if not stored_value:
        return ""
    if stored_value.startswith("data:") or stored_value.startswith("http"):
        return stored_value
    if stored_value.startswith("/api/photos/"):
        return f"{_BACKEND_URL}{stored_value}" if _BACKEND_URL else stored_value
    # Raw storage key like "photos/users/..."
    return (
        f"{_BACKEND_URL}/api/photos/{stored_value}"
        if _BACKEND_URL
        else f"/api/photos/{stored_value}"
    )
