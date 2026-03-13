"""CarryOn™ Backend — Photo Serving Routes"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from config import logger
from services.photo_storage import download_photo

router = APIRouter()


@router.get("/photos/{key:path}")
async def serve_photo(key: str):
    """Serve a photo from storage by its key.
    URL path: /api/photos/users/{id}/{filename}.jpg
    Storage key: photos/users/{id}/{filename}.jpg
    """
    if not key or ".." in key:
        raise HTTPException(status_code=400, detail="Invalid photo key")

    # The storage key includes a "photos/" prefix
    storage_key = f"photos/{key}"

    try:
        data = await download_photo(storage_key)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Photo not found")
    except Exception as e:
        logger.error(f"Error serving photo {storage_key}: {e}")
        raise HTTPException(status_code=404, detail="Photo not found")

    # Determine content type from extension
    content_type = "image/jpeg"
    if key.endswith(".png"):
        content_type = "image/png"
    elif key.endswith(".webp"):
        content_type = "image/webp"

    return Response(
        content=data,
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=86400, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
