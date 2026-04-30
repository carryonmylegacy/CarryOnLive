"""CarryOn™ — Photo Storage Service

Handles uploading, serving, and deleting profile/estate photos
via the unified storage backend (LocalStorage or S3).
"""

import io
import uuid

from PIL import Image

from config import logger
from services.storage import storage


def _process_image(raw_bytes: bytes, max_size: int = 400, quality: int = 85) -> bytes:
    """Resize and optimize an image. Returns JPEG bytes."""
    img = Image.open(io.BytesIO(raw_bytes))

    # Convert to RGB if necessary
    if img.mode in ("RGBA", "P", "LA"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if "A" in img.mode else None)
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    # Square-crop with face-aware bias.
    # ─ For landscape (w >= h): center-crop horizontally, take full height.
    # ─ For portrait (h > w): take a square from the TOP of the image
    #   (faces are almost always in the upper half of a portrait photo).
    #   A pure center-crop on a tall portrait routinely cuts the face off
    #   and leaves only the chin/torso inside the avatar — flagged by the
    #   founder during a B2B pitch (Lanna Mitchell's avatar rendered as
    #   a near-empty white circle because her face was above the
    #   center-crop rectangle).
    w, h = img.size
    side = min(w, h)
    if w >= h:
        # Landscape — center-crop horizontally
        left = (w - side) // 2
        top = 0
    else:
        # Portrait — bias top so the face is preserved. Drop ~10% of
        # the very top to avoid cropping eyebrows when the photographer
        # left a tiny strip of headroom; this matches what social-media
        # avatar pipelines (LinkedIn, Slack) do.
        left = 0
        top = max(0, int((h - side) * 0.1))
    img = img.crop((left, top, left + side, top + side))

    # Resize
    img = img.resize((max_size, max_size), Image.LANCZOS)

    # Save as optimized JPEG
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()


async def upload_photo(
    raw_bytes: bytes,
    category: str,
    entity_id: str,
    max_size: int = 400,
) -> str:
    """Process and upload a photo. Returns the storage key.

    Args:
        raw_bytes: Raw image bytes
        category: "users", "beneficiaries", or "estates"
        entity_id: The user/beneficiary/estate ID
        max_size: Max dimension in pixels (square crop)

    Returns:
        Storage key like "photos/users/{id}/{uuid}.jpg"
    """
    processed = _process_image(raw_bytes, max_size=max_size)
    filename = f"{uuid.uuid4().hex[:12]}.jpg"
    key = f"photos/{category}/{entity_id}/{filename}"

    await storage.upload_raw(processed, key, content_type="image/jpeg")
    logger.info(f"Photo uploaded: {key} ({len(processed)} bytes)")
    # Return the served URL path (not the storage key)
    return f"/api/photos/{category}/{entity_id}/{filename}"


async def delete_photo(photo_url: str) -> bool:
    """Delete a photo from storage. Accepts a stored photo URL or storage key."""
    if not photo_url or photo_url.startswith("data:"):
        return False
    # Convert URL path back to storage key
    key = photo_url
    if key.startswith("/api/photos/"):
        key = "photos/" + key[len("/api/photos/") :]
    try:
        return await storage.delete(key)
    except Exception as e:
        logger.warning(f"Failed to delete photo {key}: {e}")
        return False


async def download_photo(photo_key: str) -> bytes:
    """Download photo bytes from storage."""
    return await storage.download_raw(photo_key)
