"""Estate Chat — shared router, models, and helpers (ECT).
Secure private messaging between estate members. No route handlers here.
Sub-modules: contacts, channels, messages, media, search.
"""

from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from config import db
from services.photo_urls import resolve_photo_url

router = APIRouter()


async def _deliver_to_ffn(channel: dict, sender_name: str, content: str, estate_name: str = ""):
    """Send email/SMS to FFN contacts in a channel."""
    import asyncio

    ffn_ids = [m.replace("ffn_", "") for m in channel.get("members", []) if m.startswith("ffn_")]
    if not ffn_ids:
        return
    ffn_contacts = await db.ffn_contacts.find(
        {"id": {"$in": ffn_ids}, "deleted_at": None},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1},
    ).to_list(50)
    # Build member list for context
    platform_ids = [m for m in channel.get("members", []) if not m.startswith("ffn_")]
    platform_names = []
    if platform_ids:
        users = await db.users.find({"id": {"$in": platform_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(50)
        platform_names = [u["name"] for u in users]
    others_text = ""
    if len(platform_names) > 1:
        other_names = [n for n in platform_names if n != sender_name]
        if other_names:
            others_text = f" (also in this conversation: {', '.join(other_names[:5])})"
    ch_type = channel.get("type", "group")
    ch_label = channel.get("name", "Group Chat") if ch_type == "group" else "Estate Chat"
    for fc in ffn_contacts:
        # Email delivery
        if fc.get("email"):
            asyncio.create_task(
                _send_ffn_email(
                    fc["email"],
                    fc["name"],
                    sender_name,
                    content,
                    estate_name,
                    ch_label,
                    others_text,
                )
            )
        # SMS delivery
        if fc.get("phone"):
            asyncio.create_task(
                _send_ffn_sms(
                    fc["phone"],
                    sender_name,
                    content,
                    estate_name,
                )
            )


async def _send_ffn_email(
    to_email: str,
    to_name: str,
    sender_name: str,
    content: str,
    estate_name: str,
    channel_name: str,
    others_text: str,
):
    """Send a chat message notification email to an FFN contact."""
    import asyncio

    import resend

    from config import RESEND_API_KEY, SENDER_EMAIL, logger

    if not RESEND_API_KEY or not SENDER_EMAIL:
        return
    subject = f"{sender_name} from {estate_name or 'CarryOn'} sent you a message"
    html = f"""<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px;background:#0F1629;color:#F1F3F8;border-radius:12px;">
<div style="text-align:center;margin-bottom:16px;">
<strong style="color:#d4af37;font-size:18px;">CarryOn™ Estate Chat</strong>
</div>
<div style="background:rgba(255,255,255,0.05);padding:16px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);">
<p style="margin:0 0 8px;color:#d4af37;font-size:13px;font-weight:600;">{sender_name} · {estate_name or "Estate"}{others_text}</p>
<p style="margin:0;font-size:15px;color:#F1F3F8;">{content}</p>
</div>
<p style="margin:16px 0 0;font-size:12px;color:#7B879E;text-align:center;">
This message was sent via {channel_name} on CarryOn™. You are receiving this because you are a trusted contact of the {estate_name or ""} estate.
</p>
</div>"""
    try:
        await asyncio.to_thread(
            resend.Emails.send,
            {
                "from": SENDER_EMAIL,
                "to": [to_email],
                "subject": subject,
                "html": html,
            },
        )
    except Exception as e:
        logger.warning(f"FFN email delivery failed to {to_email}: {e}")


async def _send_ffn_sms(phone: str, sender_name: str, content: str, estate_name: str):
    """Send a chat message SMS to an FFN contact."""
    import asyncio

    from config import TWILIO_PHONE_NUMBER, logger, twilio_client

    if not twilio_client or not TWILIO_PHONE_NUMBER:
        return
    body = f"[CarryOn {estate_name or 'Estate'}] {sender_name}: {content[:140]}"
    try:
        await asyncio.to_thread(
            twilio_client.messages.create,
            body=body,
            from_=TWILIO_PHONE_NUMBER,
            to=phone,
        )
    except Exception as e:
        logger.warning(f"FFN SMS delivery failed to {phone}: {e}")


class CreateChannelRequest(BaseModel):
    estate_id: str
    name: Optional[str] = None
    member_ids: list[str] = []
    channel_type: str = "group"  # "group" or "direct"


class SendMessageRequest(BaseModel):
    content: str
    reply_to: str | None = None  # message ID being replied to


class EditMessageRequest(BaseModel):
    content: str


class ReactRequest(BaseModel):
    emoji: str  # any unicode emoji or legacy key (thumbs_up, heart, etc.)


VALID_REACTIONS = ["thumbs_up", "heart", "laugh", "sad", "fire", "check"]


class UpdateMembersRequest(BaseModel):
    member_ids: list[str]


async def _get_user_estate_ids(user_id: str) -> list[str]:
    """Get all estate IDs a user is connected to (as owner or beneficiary)."""
    estate_ids = set()
    async for e in db.estates.find({"owner_id": user_id}, {"_id": 0, "id": 1}):
        estate_ids.add(e["id"])
    async for e in db.estates.find({"beneficiaries": user_id}, {"_id": 0, "id": 1}):
        estate_ids.add(e["id"])
    return list(estate_ids)


async def _require_estate_chat_access(estate_id: str, current_user: dict) -> dict:
    """Resolve the canonical actor for an estate-chat estate and enforce BOTH
    membership and the Messages beneficiary-section gate. Estate Chat follows the
    existing 'messages' section permission, so a beneficiary whose Messages
    section is disabled cannot reach chat APIs directly even though the UI hides
    them (audit 18a9d44 F-18-05 / F-18-08). Owner/admin/operator bypass the gate.
    Returns the resolved actor."""
    from fastapi import HTTPException
    from services.access_control import resolve_estate_actor, require_beneficiary_section_access

    actor = await resolve_estate_actor(estate_id, current_user)
    if not actor.get("is_estate_member") and not actor.get("is_staff"):
        raise HTTPException(status_code=403, detail="Not a member of this estate")
    await require_beneficiary_section_access(actor, "messages")
    return actor


async def _estate_chat_section_enabled(estate_id: str, current_user: dict) -> bool:
    """Non-raising variant for list/directory endpoints that span estates."""
    from services.access_control import resolve_estate_actor, beneficiary_section_enabled

    actor = await resolve_estate_actor(estate_id, current_user)
    if not actor.get("is_estate_member") and not actor.get("is_staff"):
        return False
    return await beneficiary_section_enabled(actor, "messages")


async def _ensure_circle(estate_id: str) -> dict:
    """Ensure a Circle channel exists for this estate; create if not."""
    circle = await db.estate_channels.find_one({"estate_id": estate_id, "type": "circle"}, {"_id": 0})
    if circle:
        return circle
    estate = await db.estates.find_one(
        {"id": estate_id}, {"_id": 0, "id": 1, "owner_id": 1, "name": 1, "beneficiaries": 1}
    )
    if not estate:
        return None
    members = list({estate["owner_id"]} | set(estate.get("beneficiaries", [])))
    now = datetime.now(timezone.utc).isoformat()
    circle_doc = {
        "id": f"circle_{estate_id[:8]}",
        "estate_id": estate_id,
        "type": "circle",
        "name": f"{estate.get('name', 'Estate')} Circle",
        "members": members,
        "created_by": estate["owner_id"],
        "created_at": now,
    }
    await db.estate_channels.insert_one({k: v for k, v in circle_doc.items()})
    return circle_doc


async def _enrich_channel(channel: dict, current_user_id: str) -> dict:
    """Add unread count, last message preview, and member names."""
    ch_id = channel["id"]
    last_read = await db.estate_channel_reads.find_one({"channel_id": ch_id, "user_id": current_user_id}, {"_id": 0})
    last_read_at = last_read.get("last_read_at", "") if last_read else ""
    unread_query = {"channel_id": ch_id, "deleted_at": {"$exists": False}}
    if last_read_at:
        unread_query["created_at"] = {"$gt": last_read_at}
    unread = await db.estate_messages.count_documents(unread_query)
    last_msg = await db.estate_messages.find_one(
        {"channel_id": ch_id, "deleted_at": {"$exists": False}},
        {"_id": 0, "id": 1, "content": 1, "sender_name": 1, "created_at": 1},
        sort=[("created_at", -1)],
    )
    preview = None
    if last_msg:
        preview = {
            "content": last_msg["content"][:80],
            "sender_name": last_msg.get("sender_name", ""),
            "created_at": last_msg.get("created_at", ""),
        }
    # For direct channels, resolve the other person's name and photo
    display_name = channel.get("name", "")
    other_photo_url = ""
    if channel["type"] == "direct":
        other_ids = [m for m in channel.get("members", []) if m != current_user_id]
        if other_ids:
            other = await db.users.find_one({"id": other_ids[0]}, {"_id": 0, "id": 1, "name": 1, "photo_url": 1})
            if other:
                display_name = other["name"]
                photo = other.get("photo_url", "")
                # Fallback: check beneficiary record photo
                if not photo:
                    ben = await db.beneficiaries.find_one(
                        {
                            "user_id": other_ids[0],
                            "deleted_at": None,
                            "photo_url": {"$exists": True, "$nin": [None, ""]},
                        },
                        {"_id": 0, "id": 1, "photo_url": 1},
                    )
                    if ben:
                        photo = ben.get("photo_url", "")
                other_photo_url = resolve_photo_url(photo)
    # Get estate name and photo for the tag
    estate_name = ""
    estate_photo_url = ""
    estate = await db.estates.find_one(
        {"id": channel.get("estate_id", "")}, {"_id": 0, "id": 1, "name": 1, "estate_photo_url": 1}
    )
    if estate:
        estate_name = estate.get("name", "")
        raw_photo = estate.get("estate_photo_url", "")
        if raw_photo:
            estate_photo_url = resolve_photo_url(raw_photo)
    return {
        "id": ch_id,
        "estate_id": channel.get("estate_id", ""),
        "estate_name": estate_name,
        "estate_photo_url": estate_photo_url,
        "type": channel["type"],
        "name": display_name,
        "photo_url": other_photo_url,
        "members": channel.get("members", []),
        "created_by": channel.get("created_by", ""),
        "created_at": channel.get("created_at", ""),
        "unread_count": unread,
        "last_message": preview,
    }


# ── File type constants (shared by messages.py and media.py) ────────────────

ALLOWED_FILE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/mpeg",
    "audio/wav",
    "audio/x-m4a",
    "audio/aac",
    "audio/m4a",
    "audio/x-wav",
    "audio/webm;codecs=opus",
    "video/webm",
    "video/mp4",
    "video/quicktime",
    "video/mov",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB for non-video
MAX_VIDEO_SIZE = 25 * 1024 * 1024  # 25 MB for video
MAX_BATCH_FILES = 5
