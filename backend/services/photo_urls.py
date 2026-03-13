"""CarryOn™ — Photo URL resolution utility.

Converts stored photo keys to served URLs in API responses.
Handles backward compatibility with legacy base64 data URLs.
"""


def resolve_photo_url(stored_value: str) -> str:
    """Convert a stored photo reference to a URL for API responses.

    - Empty/None → ""
    - "data:..." (legacy base64) → returned as-is
    - "http://..." or "https://..." → returned as-is
    - "photos/..." (storage key) → "/api/photos/{key}"
    """
    if not stored_value:
        return ""
    if stored_value.startswith("data:") or stored_value.startswith("http"):
        return stored_value
    if stored_value.startswith("/api/photos/"):
        return stored_value
    # It's a storage key
    return f"/api/photos/{stored_value}"
