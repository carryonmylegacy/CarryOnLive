"""CarryOn™ — Photo URL resolution utility.

Converts stored photo keys to absolute served URLs in API responses.
Handles backward compatibility with legacy base64 data URLs.

Uses BACKEND_URL (or FRONTEND_URL as fallback) to construct absolute URLs
so photos resolve correctly regardless of which domain the frontend is on.
"""

import os

# The backend's own public URL, used to construct absolute photo URLs.
# In production (Railway), set BACKEND_URL to the Railway public URL.
# Falls back to FRONTEND_URL which works in preview/ingress setups.
_BACKEND_URL = (
    os.environ.get("BACKEND_URL")
    or os.environ.get("FRONTEND_URL")
    or ""
).rstrip("/")


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
    return f"{_BACKEND_URL}/api/photos/{stored_value}" if _BACKEND_URL else f"/api/photos/{stored_value}"
