"""CarryOn™ — Photo URL resolution utility.

Converts stored photo keys to S3 presigned URLs for direct browser access.
No backend proxy needed — photos load directly from S3.
Handles backward compatibility with legacy base64 data URLs.
"""

import os

from config import logger

# Initialize S3 client for presigned URL generation (CPU-only, no network calls)
_s3_client = None
_s3_bucket = os.environ.get("S3_BUCKET_NAME", "")

if _s3_bucket and os.environ.get("AWS_ACCESS_KEY_ID"):
    try:
        import boto3

        _s3_client = boto3.client(
            "s3",
            region_name=os.environ.get("S3_REGION", "us-east-1"),
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        )
        logger.info("Photo URL resolver: using S3 presigned URLs")
    except Exception as e:
        logger.warning(f"Photo URL resolver: S3 client init failed ({e}), using fallback")

# Fallback base URL for non-S3 environments
_FALLBACK_URL = (
    os.environ.get("BACKEND_URL")
    or os.environ.get("RAILWAY_PUBLIC_DOMAIN", "")
    or os.environ.get("FRONTEND_URL")
    or ""
).rstrip("/")
if _FALLBACK_URL and not _FALLBACK_URL.startswith("http"):
    _FALLBACK_URL = f"https://{_FALLBACK_URL}"

_PRESIGN_EXPIRY = 7 * 24 * 3600  # 7 days


def _to_s3_key(stored_value: str) -> str:
    """Convert a stored photo path to an S3 object key."""
    if stored_value.startswith("/api/photos/"):
        return "photos/" + stored_value[len("/api/photos/"):]
    if stored_value.startswith("photos/"):
        return stored_value
    return ""


def resolve_photo_url(stored_value: str) -> str:
    """Convert a stored photo reference to a browser-accessible URL.

    For S3-backed storage: generates a presigned URL (direct S3 access).
    For local/fallback: constructs a backend proxy URL.

    Handles:
    - Empty/None → ""
    - "data:..." (legacy base64) → returned as-is
    - "http(s)://..." → returned as-is
    - "/api/photos/..." or "photos/..." → S3 presigned URL or proxy URL
    """
    if not stored_value:
        return ""
    if stored_value.startswith("data:") or stored_value.startswith("http"):
        return stored_value

    s3_key = _to_s3_key(stored_value)

    # Try S3 presigned URL (works everywhere, no proxy needed)
    if _s3_client and s3_key:
        try:
            return _s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": _s3_bucket, "Key": s3_key},
                ExpiresIn=_PRESIGN_EXPIRY,
            )
        except Exception:
            pass  # Fall through to proxy URL

    # Fallback: proxy through backend
    if stored_value.startswith("/api/photos/"):
        return f"{_FALLBACK_URL}{stored_value}" if _FALLBACK_URL else stored_value
    return (
        f"{_FALLBACK_URL}/api/photos/{stored_value}"
        if _FALLBACK_URL
        else f"/api/photos/{stored_value}"
    )
