"""CarryOn™ Backend — Push Notifications"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Optional
from datetime import datetime, timezone
from config import db, logger
from utils import get_current_user, vapid
import base64

router = APIRouter()


class PushSubscription(BaseModel):
    endpoint: str
    keys: Dict[str, str]


class PushNotificationRequest(BaseModel):
    user_id: Optional[str] = None
    title: str
    body: str
    url: Optional[str] = "/"
    tag: Optional[str] = "carryon-notification"
    type: Optional[str] = "general"


@router.post("/push/subscribe")
async def subscribe_push(
    subscription: PushSubscription, current_user: dict = Depends(get_current_user)
):
    """Subscribe to push notifications"""
    sub_data = {
        "user_id": current_user["id"],
        "endpoint": subscription.endpoint,
        "keys": subscription.keys,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "active": True,
    }

    # Upsert subscription (update if endpoint exists, else insert)
    await db.push_subscriptions.update_one(
        {"endpoint": subscription.endpoint}, {"$set": sub_data}, upsert=True
    )

    logger.info(f"Push subscription saved for user {current_user['id']}")
    return {"success": True, "message": "Subscribed to push notifications"}


@router.delete("/push/unsubscribe")
async def unsubscribe_push(
    subscription: PushSubscription, current_user: dict = Depends(get_current_user)
):
    """Unsubscribe from push notifications"""
    await db.push_subscriptions.delete_one({"endpoint": subscription.endpoint})
    return {"success": True, "message": "Unsubscribed from push notifications"}


@router.get("/push/vapid-public-key")
async def get_vapid_public_key():
    """Get the VAPID public key for push subscription"""
    try:
        if vapid:
            from cryptography.hazmat.primitives import serialization

            raw_bytes = vapid.public_key.public_bytes(
                encoding=serialization.Encoding.X962,
                format=serialization.PublicFormat.UncompressedPoint,
            )
            public_key_b64 = (
                base64.urlsafe_b64encode(raw_bytes).decode("utf-8").rstrip("=")
            )
            return {"public_key": public_key_b64}
        else:
            # VAPID not configured — push notifications unavailable
            raise HTTPException(
                status_code=503,
                detail="Push notifications not configured. Set VAPID_PRIVATE_KEY environment variable to enable.",
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting VAPID public key: {e}")
        raise HTTPException(status_code=503, detail="Push notifications not available")
