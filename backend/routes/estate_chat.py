"""CarryOn™ — Estate Communication Tool (ECT)

Secure, private messaging between estate members (benefactors + beneficiaries).
Three channel types:
  - circle: Auto-created per estate, all accepted members can see it
  - group: Benefactor-created with selected members
  - direct: 1:1 between any two connected estate members
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from typing import Optional

from config import db
from services.estate_auth import is_estate_member as _is_estate_member, is_estate_owner as _is_estate_owner
from services.photo_urls import resolve_photo_url
from utils import get_current_user, send_push_notification

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


@router.get("/estate-chat/contacts")
async def get_contacts(current_user: dict = Depends(get_current_user)):
    """Get all people connected to the user across all estates, grouped by estate."""
    estate_ids = await _get_user_estate_ids(current_user["id"])
    if not estate_ids:
        return []
    result = []
    for eid in estate_ids:
        estate = await db.estates.find_one(
            {"id": eid}, {"_id": 0, "id": 1, "name": 1, "owner_id": 1, "beneficiaries": 1}
        )
        if not estate:
            continue
        all_member_ids = list({estate["owner_id"]} | set(estate.get("beneficiaries", [])))
        all_member_ids = [m for m in all_member_ids if m != current_user["id"]]
        if not all_member_ids:
            continue
        users = await db.users.find(
            {"id": {"$in": all_member_ids}},
            {"_id": 0, "id": 1, "name": 1, "role": 1, "photo_url": 1},
        ).to_list(100)
        # Get relationship info from beneficiaries collection
        ben_records = await db.beneficiaries.find(
            {"estate_id": eid, "user_id": {"$in": all_member_ids}, "deleted_at": None},
            {"_id": 0, "id": 1, "user_id": 1, "relation": 1, "photo_url": 1},
        ).to_list(100)
        relation_map = {b["user_id"]: b.get("relation", "") for b in ben_records}
        ben_photo_map = {b["user_id"]: b["photo_url"] for b in ben_records if b.get("photo_url")}
        members = []
        for u in users:
            is_owner = u["id"] == estate["owner_id"]
            # Use user photo first, fall back to beneficiary record photo
            photo = u.get("photo_url", "") or ben_photo_map.get(u["id"], "")
            members.append(
                {
                    "id": u["id"],
                    "name": u.get("name", "Unknown"),
                    "photo_url": resolve_photo_url(photo),
                    "role_in_estate": "benefactor" if is_owner else "beneficiary",
                    "relation": relation_map.get(u["id"], "benefactor" if is_owner else ""),
                }
            )
        result.append(
            {
                "estate_id": eid,
                "estate_name": estate.get("name", "Estate"),
                "members": members,
            }
        )
        # Include FFN contacts as external members
        ffn_contacts = await db.ffn_contacts.find(
            {"estate_id": eid, "deleted_at": None},
            {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1, "relationship": 1},
        ).to_list(100)
        for fc in ffn_contacts:
            result[-1]["members"].append(
                {
                    "id": f"ffn_{fc['id']}",
                    "name": fc.get("name", "Unknown"),
                    "photo_url": "",
                    "role_in_estate": "ffn",
                    "relation": fc.get("relationship", "FFN Contact"),
                    "is_ffn": True,
                    "email": fc.get("email", ""),
                    "phone": fc.get("phone", ""),
                }
            )
    return result


@router.get("/estate-chat/channels")
async def get_channels(current_user: dict = Depends(get_current_user)):
    """Get all chat channels the current user belongs to, across all estates."""
    estate_ids = await _get_user_estate_ids(current_user["id"])
    if not estate_ids:
        return []
    # Ensure circles exist for each estate
    for eid in estate_ids:
        await _ensure_circle(eid)
    channels = await db.estate_channels.find(
        {"estate_id": {"$in": estate_ids}, "members": current_user["id"]},
        {"_id": 0},
    ).to_list(200)
    # Filter out channels this user has dismissed
    dismissed = await db.estate_channel_dismissals.find(
        {"user_id": current_user["id"]},
        {"_id": 0, "id": 1, "channel_id": 1},
    ).to_list(500)
    dismissed_ids = {d["channel_id"] for d in dismissed}
    channels = [ch for ch in channels if ch["id"] not in dismissed_ids]
    enriched = []
    for ch in channels:
        enriched.append(await _enrich_channel(ch, current_user["id"]))

    # Sort: circles first, then by last_message date descending
    def sort_key(c):
        type_order = {"circle": 0, "group": 1, "direct": 2}
        lm = c.get("last_message")
        ts = lm["created_at"] if lm else ""
        return (type_order.get(c["type"], 9), "" if ts else "z", ts)

    enriched.sort(
        key=lambda c: (
            {"circle": 0, "group": 1, "direct": 2}.get(c["type"], 9),
            -(len((c.get("last_message") or {}).get("created_at", "") or "0")),
        )
    )
    return enriched


@router.post("/estate-chat/channels")
async def create_channel(
    data: CreateChannelRequest,
    current_user: dict = Depends(get_current_user),
):
    """Create a group or direct message channel."""
    if not await _is_estate_member(current_user["id"], data.estate_id):
        raise HTTPException(status_code=403, detail="Not a member of this estate")
    if data.channel_type == "group":
        if not await _is_estate_owner(current_user["id"], data.estate_id):
            raise HTTPException(status_code=403, detail="Only the benefactor can create group channels")
        if not data.name or not data.name.strip():
            raise HTTPException(status_code=400, detail="Group name is required")
        members = list(set([current_user["id"]] + data.member_ids))
        for mid in data.member_ids:
            if not await _is_estate_member(mid, data.estate_id):
                raise HTTPException(status_code=400, detail=f"User {mid} is not a member of this estate")
        now = datetime.now(timezone.utc).isoformat()
        channel = {
            "id": f"grp_{str(uuid4())[:8]}",
            "estate_id": data.estate_id,
            "type": "group",
            "name": data.name.strip(),
            "members": members,
            "created_by": current_user["id"],
            "created_at": now,
        }
        await db.estate_channels.insert_one({k: v for k, v in channel.items()})
        return await _enrich_channel(channel, current_user["id"])
    elif data.channel_type == "direct":
        if len(data.member_ids) != 1:
            raise HTTPException(status_code=400, detail="Direct messages require exactly one other member")
        other_id = data.member_ids[0]
        if other_id == current_user["id"]:
            raise HTTPException(status_code=400, detail="Cannot create a DM with yourself")
        if not await _is_estate_member(other_id, data.estate_id):
            raise HTTPException(status_code=400, detail="Recipient is not a member of this estate")
        members = sorted([current_user["id"], other_id])
        existing = await db.estate_channels.find_one(
            {
                "type": "direct",
                "estate_id": data.estate_id,
                "members": {"$all": members, "$size": 2},
            },
            {"_id": 0},
        )
        if existing:
            return await _enrich_channel(existing, current_user["id"])
        now = datetime.now(timezone.utc).isoformat()
        channel = {
            "id": f"dm_{str(uuid4())[:8]}",
            "estate_id": data.estate_id,
            "type": "direct",
            "name": "",
            "members": members,
            "created_by": current_user["id"],
            "created_at": now,
        }
        await db.estate_channels.insert_one({k: v for k, v in channel.items()})
        return await _enrich_channel(channel, current_user["id"])
    else:
        raise HTTPException(status_code=400, detail="Invalid channel type")


@router.get("/estate-chat/channels/{channel_id}/messages")
async def get_messages(
    channel_id: str,
    limit: int = Query(50, le=200),
    before: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Get messages from a channel."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this channel")
    query = {"channel_id": channel_id, "deleted_at": {"$exists": False}}
    if before:
        query["created_at"] = {"$lt": before}
    messages = await db.estate_messages.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    messages.reverse()  # Reverse to chronological order for frontend display
    # Enrich messages with reactions
    msg_ids = [m["id"] for m in messages]
    if msg_ids:
        reactions = await db.estate_reactions.find({"message_id": {"$in": msg_ids}}, {"_id": 0}).to_list(500)
        react_map = {}
        for r in reactions:
            react_map.setdefault(r["message_id"], []).append(
                {"emoji": r["emoji"], "user_id": r["user_id"], "user_name": r.get("user_name", "")}
            )
        for m in messages:
            m["reactions"] = react_map.get(m["id"], [])
        # Mark messages as delivered to this user
        other_user_msgs = [mid for mid, m in zip(msg_ids, messages) if m.get("sender_id") != current_user["id"]]
        if other_user_msgs:
            await db.estate_messages.update_many(
                {"id": {"$in": other_user_msgs}, "delivered_to": {"$ne": current_user["id"]}},
                {"$addToSet": {"delivered_to": current_user["id"]}},
            )
    else:
        for m in messages:
            m["reactions"] = []
    now = datetime.now(timezone.utc).isoformat()
    await db.estate_channel_reads.update_one(
        {"channel_id": channel_id, "user_id": current_user["id"]},
        {"$set": {"last_read_at": now}},
        upsert=True,
    )
    return messages


@router.get("/estate-chat/channels/{channel_id}/read-status")
async def get_read_status(
    channel_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get read/delivered timestamps for all members of a channel (for receipts)."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this channel")
    reads = await db.estate_channel_reads.find({"channel_id": channel_id}, {"_id": 0}).to_list(100)
    read_map = {r["user_id"]: r.get("last_read_at", "") for r in reads}
    # Enrich with member names
    member_ids = [m for m in channel.get("members", []) if m != current_user["id"]]
    users = await db.users.find({"id": {"$in": member_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
    result = []
    for u in users:
        result.append(
            {
                "user_id": u["id"],
                "name": u.get("name", "Unknown"),
                "last_read_at": read_map.get(u["id"], ""),
            }
        )
    return result


@router.post("/estate-chat/channels/{channel_id}/typing")
async def send_typing(
    channel_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Signal that the user is typing in a channel. Heartbeat — call every ~3s."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0, "id": 1, "members": 1})
    if not channel or current_user["id"] not in channel.get("members", []):
        return {"ok": True}  # Silently ignore — no error for typing heartbeat
    now = datetime.now(timezone.utc).isoformat()
    await db.estate_typing.update_one(
        {"channel_id": channel_id, "user_id": current_user["id"]},
        {"$set": {"user_name": current_user.get("name", ""), "updated_at": now}},
        upsert=True,
    )
    return {"ok": True}


@router.get("/estate-chat/channels/{channel_id}/typing")
async def get_typing(
    channel_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get who is currently typing in a channel (active within last 5 seconds)."""
    from datetime import timedelta

    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()
    typers = await db.estate_typing.find(
        {"channel_id": channel_id, "updated_at": {"$gt": cutoff}, "user_id": {"$ne": current_user["id"]}},
        {"_id": 0, "id": 1, "user_id": 1, "user_name": 1},
    ).to_list(20)
    return typers


@router.post("/estate-chat/channels/{channel_id}/messages")
async def send_message(
    channel_id: str,
    data: SendMessageRequest,
    current_user: dict = Depends(get_current_user),
):
    """Send a message to a channel."""
    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="Message too long (max 2000 chars)")
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this channel")
    now = datetime.now(timezone.utc).isoformat()
    msg_id = str(uuid4())
    message = {
        "id": msg_id,
        "channel_id": channel_id,
        "estate_id": channel.get("estate_id", ""),
        "sender_id": current_user["id"],
        "sender_name": current_user.get("name", "Unknown"),
        "content": content,
        "created_at": now,
    }
    # Add reply reference if replying to a specific message
    if data.reply_to:
        replied = await db.estate_messages.find_one(
            {"id": data.reply_to, "channel_id": channel_id}, {"_id": 0, "id": 1, "content": 1, "sender_name": 1}
        )
        if replied:
            message["reply_to"] = {
                "id": replied["id"],
                "content": (replied.get("content") or "")[:200],
                "sender_name": replied.get("sender_name", "Unknown"),
            }
    await db.estate_messages.insert_one({k: v for k, v in message.items()})
    await db.estate_channel_reads.update_one(
        {"channel_id": channel_id, "user_id": current_user["id"]},
        {"$set": {"last_read_at": now}},
        upsert=True,
    )
    # Clear typing indicator on send
    await db.estate_typing.delete_one(
        {"channel_id": channel_id, "user_id": current_user["id"]}
    )  # cleanup ephemeral typing indicator
    # Un-dismiss channel for all members so they see new activity
    await db.estate_channel_dismissals.delete_many({"channel_id": channel_id})  # cleanup: un-dismiss on new message

    # Push notifications to all channel members except sender
    other_members = [m for m in channel.get("members", []) if m != current_user["id"] and not m.startswith("ffn_")]
    if other_members:
        import asyncio

        sender_name = current_user.get("name", "Unknown")
        channel_name = channel.get("name", "Chat")
        preview = content[:100] + ("..." if len(content) > 100 else "")
        for member_id in other_members:
            asyncio.create_task(
                send_push_notification(
                    user_id=member_id,
                    title=f"{sender_name} in {channel_name}",
                    body=preview,
                    url="/estate-chat",
                    tag=f"ect-{channel_id}",
                    notification_type="ect_message",
                )
            )

    # Deliver to FFN contacts via email/SMS
    ffn_members = [m for m in channel.get("members", []) if m.startswith("ffn_")]
    if ffn_members:
        import asyncio

        estate = await db.estates.find_one({"id": channel.get("estate_id", "")}, {"_id": 0, "id": 1, "name": 1})
        asyncio.create_task(
            _deliver_to_ffn(
                channel,
                current_user.get("name", "Unknown"),
                content,
                estate.get("name", "") if estate else "",
            )
        )
    return message


@router.put("/estate-chat/messages/{message_id}")
async def edit_message(
    message_id: str,
    data: EditMessageRequest,
    current_user: dict = Depends(get_current_user),
):
    """Edit a message's text content. Only the sender can edit."""
    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="Message too long (max 2000 chars)")
    msg = await db.estate_messages.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg["sender_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can only edit your own messages")
    now = datetime.now(timezone.utc).isoformat()
    await db.estate_messages.update_one(
        {"id": message_id},
        {"$set": {"content": content, "edited_at": now}},
    )
    return {"status": "ok", "content": content, "edited_at": now}


@router.delete("/estate-chat/messages/{message_id}")
async def delete_message(
    message_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a message. Sender can delete own; estate owner can delete any."""
    msg = await db.estate_messages.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    is_sender = msg["sender_id"] == current_user["id"]
    is_estate_owner = False
    if not is_sender and msg.get("estate_id"):
        estate = await db.estates.find_one(
            {"id": msg["estate_id"], "owner_id": current_user["id"]}, {"_id": 0, "id": 1}
        )
        is_estate_owner = estate is not None
    if not is_sender and not is_estate_owner:
        raise HTTPException(status_code=403, detail="You can only delete your own messages")
    # Soft-delete: retain the record for SOC 2 audit compliance
    now = datetime.now(timezone.utc).isoformat()
    await db.estate_messages.update_one(
        {"id": message_id},
        {"$set": {"deleted_at": now, "deleted_by": current_user["id"]}},
    )
    return {"status": "ok"}


@router.post("/estate-chat/messages/{message_id}/react")
async def toggle_reaction(
    message_id: str,
    data: ReactRequest,
    current_user: dict = Depends(get_current_user),
):
    """Toggle a reaction on a message. If already reacted with same emoji, removes it."""
    if not data.emoji or len(data.emoji) > 20:
        raise HTTPException(status_code=400, detail="Invalid emoji")
    msg = await db.estate_messages.find_one({"id": message_id}, {"_id": 0, "id": 1, "channel_id": 1})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    channel = await db.estate_channels.find_one({"id": msg["channel_id"]}, {"_id": 0, "id": 1, "members": 1})
    if not channel or current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this channel")
    # Check if already reacted with this emoji
    existing = await db.estate_reactions.find_one(
        {"message_id": message_id, "user_id": current_user["id"], "emoji": data.emoji},
        {"_id": 0},
    )
    if existing:
        await db.estate_reactions.delete_one(
            {"message_id": message_id, "user_id": current_user["id"], "emoji": data.emoji}
        )
        return {"action": "removed", "emoji": data.emoji}
    now = datetime.now(timezone.utc).isoformat()
    reaction = {
        "id": str(uuid4()),
        "message_id": message_id,
        "user_id": current_user["id"],
        "user_name": current_user.get("name", "Unknown"),
        "emoji": data.emoji,
        "created_at": now,
    }
    await db.estate_reactions.insert_one({k: v for k, v in reaction.items()})
    return {"action": "added", "emoji": data.emoji}


@router.post("/estate-chat/messages/{message_id}/pin")
async def toggle_pin(
    message_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Toggle pin on a message. Benefactor only."""
    msg = await db.estate_messages.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    channel = await db.estate_channels.find_one(
        {"id": msg["channel_id"]}, {"_id": 0, "id": 1, "members": 1, "estate_id": 1}
    )
    if not channel or current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this channel")
    if not await _is_estate_owner(current_user["id"], channel["estate_id"]):
        raise HTTPException(status_code=403, detail="Only the benefactor can pin messages")
    is_pinned = msg.get("pinned", False)
    now = datetime.now(timezone.utc).isoformat()
    await db.estate_messages.update_one(
        {"id": message_id},
        {
            "$set": {
                "pinned": not is_pinned,
                "pinned_at": now if not is_pinned else None,
                "pinned_by": current_user["id"] if not is_pinned else None,
            }
        },
    )
    return {"pinned": not is_pinned}


@router.get("/estate-chat/channels/{channel_id}/pinned")
async def get_pinned(
    channel_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get all pinned messages in a channel."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0, "id": 1, "members": 1})
    if not channel or current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this channel")
    pinned = (
        await db.estate_messages.find(
            {"channel_id": channel_id, "pinned": True, "deleted_at": {"$exists": False}}, {"_id": 0}
        )
        .sort("pinned_at", -1)
        .to_list(20)
    )
    return pinned


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


@router.post("/estate-chat/channels/{channel_id}/upload")
async def upload_attachment(
    channel_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a file/image and send it as a message attachment."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this channel")
    if file.content_type not in ALLOWED_FILE_TYPES:
        # Also allow by checking the base MIME type (e.g. "audio/mp4" from "audio/mp4;codecs=...")
        base_type = (file.content_type or "").split(";")[0].strip()
        if base_type not in ALLOWED_FILE_TYPES:
            raise HTTPException(status_code=400, detail=f"File type not allowed: {file.content_type}")
    data = await file.read()
    is_video = file.content_type and file.content_type.startswith("video/")
    size_limit = MAX_VIDEO_SIZE if is_video else MAX_FILE_SIZE
    if len(data) > size_limit:
        limit_mb = size_limit // (1024 * 1024)
        raise HTTPException(status_code=400, detail=f"File too large (max {limit_mb} MB)")
    file_id = str(uuid4())
    storage_key = f"chat/{channel.get('estate_id', 'unknown')}/{file_id}"
    try:
        from services.storage import storage

        await storage.upload_raw(data, storage_key, file.content_type or "application/octet-stream")
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to store file")
    now = datetime.now(timezone.utc).isoformat()
    is_image = file.content_type and file.content_type.startswith("image/")
    is_audio = file.content_type and (file.content_type.startswith("audio/") or file.content_type == "video/webm")
    msg_type = "image" if is_image else ("voice" if is_audio else "file")
    message = {
        "id": str(uuid4()),
        "channel_id": channel_id,
        "estate_id": channel.get("estate_id", ""),
        "sender_id": current_user["id"],
        "sender_name": current_user.get("name", "Unknown"),
        "content": file.filename or "Attachment",
        "message_type": msg_type,
        "attachment": {
            "file_id": file_id,
            "file_name": file.filename or "file",
            "file_type": file.content_type or "",
            "file_size": len(data),
            "storage_key": storage_key,
        },
        "reactions": [],
        "created_at": now,
    }
    await db.estate_messages.insert_one({k: v for k, v in message.items()})
    await db.estate_channel_reads.update_one(
        {"channel_id": channel_id, "user_id": current_user["id"]},
        {"$set": {"last_read_at": now}},
        upsert=True,
    )
    await db.estate_typing.delete_one(
        {"channel_id": channel_id, "user_id": current_user["id"]}
    )  # cleanup ephemeral typing indicator
    # Un-dismiss channel for all members so they see new activity
    await db.estate_channel_dismissals.delete_many({"channel_id": channel_id})  # cleanup: un-dismiss on new message

    # Push notifications to all channel members except sender
    other_members = [m for m in channel.get("members", []) if m != current_user["id"] and not m.startswith("ffn_")]
    if other_members:
        import asyncio

        sender_name = current_user.get("name", "Unknown")
        channel_name = channel.get("name", "Chat")
        body = f"Sent a {msg_type}" if msg_type in ("image", "video") else "Sent a file"
        for member_id in other_members:
            asyncio.create_task(
                send_push_notification(
                    user_id=member_id,
                    title=f"{sender_name} in {channel_name}",
                    body=body,
                    url="/estate-chat",
                    tag=f"ect-{channel_id}",
                    notification_type="ect_message",
                )
            )

    return message


@router.post("/estate-chat/channels/{channel_id}/upload-multi")
async def upload_multi_attachment(
    channel_id: str,
    files: list[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload multiple files and send as a single grouped message."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this channel")
    if len(files) > MAX_BATCH_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_BATCH_FILES} files at once")

    from services.storage import storage

    attachments = []
    for f in files:
        base_type = (f.content_type or "").split(";")[0].strip()
        if f.content_type not in ALLOWED_FILE_TYPES and base_type not in ALLOWED_FILE_TYPES:
            raise HTTPException(status_code=400, detail=f"File type not allowed: {f.content_type}")
        data = await f.read()
        is_video = f.content_type and f.content_type.startswith("video/")
        size_limit = MAX_VIDEO_SIZE if is_video else MAX_FILE_SIZE
        if len(data) > size_limit:
            limit_mb = size_limit // (1024 * 1024)
            raise HTTPException(
                status_code=400,
                detail=f"{f.filename} too large (max {limit_mb} MB for {'video' if is_video else 'files'})",
            )
        fid = str(uuid4())
        storage_key = f"chat/{channel.get('estate_id', 'unknown')}/{fid}"
        try:
            await storage.upload_raw(data, storage_key, f.content_type or "application/octet-stream")
        except Exception:
            raise HTTPException(status_code=500, detail=f"Failed to store {f.filename}")
        attachments.append(
            {
                "file_id": fid,
                "file_name": f.filename or "file",
                "file_type": f.content_type or "",
                "file_size": len(data),
                "storage_key": storage_key,
            }
        )

    now = datetime.now(timezone.utc).isoformat()
    # Determine message type from the first attachment
    first_type = attachments[0]["file_type"] if attachments else ""
    is_image = first_type.startswith("image/")
    is_video = first_type.startswith("video/")
    msg_type = "image" if is_image else ("video" if is_video else "file")
    if len(attachments) > 1:
        msg_type = "media_group"

    file_names = [a["file_name"] for a in attachments]
    message = {
        "id": str(uuid4()),
        "channel_id": channel_id,
        "estate_id": channel.get("estate_id", ""),
        "sender_id": current_user["id"],
        "sender_name": current_user.get("name", "Unknown"),
        "content": ", ".join(file_names),
        "message_type": msg_type,
        "attachment": attachments[0],  # backward compat
        "attachments": attachments,
        "reactions": [],
        "created_at": now,
    }
    await db.estate_messages.insert_one({k: v for k, v in message.items()})
    await db.estate_channel_reads.update_one(
        {"channel_id": channel_id, "user_id": current_user["id"]},
        {"$set": {"last_read_at": now}},
        upsert=True,
    )
    await db.estate_typing.delete_one({"channel_id": channel_id, "user_id": current_user["id"]})
    await db.estate_channel_dismissals.delete_many({"channel_id": channel_id})

    # Push notifications to all channel members except sender
    other_members = [m for m in channel.get("members", []) if m != current_user["id"] and not m.startswith("ffn_")]
    if other_members:
        import asyncio

        sender_name = current_user.get("name", "Unknown")
        channel_name = channel.get("name", "Chat")
        file_count = len(attachments)
        body = f"Sent {file_count} file{'s' if file_count > 1 else ''}"
        for member_id in other_members:
            asyncio.create_task(
                send_push_notification(
                    user_id=member_id,
                    title=f"{sender_name} in {channel_name}",
                    body=body,
                    url="/estate-chat",
                    tag=f"ect-{channel_id}",
                    notification_type="ect_message",
                )
            )

    return message


@router.get("/estate-chat/files/{file_id}")
async def serve_chat_file(
    file_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Serve a chat attachment file.

    Supports both Bearer header auth and ?token= query param (for img src / window.open).
    """
    from fastapi.responses import Response
    from services.storage import storage

    # Search both single 'attachment' and multi 'attachments' array
    msg = await db.estate_messages.find_one(
        {
            "$or": [
                {"attachment.file_id": file_id},
                {"attachments.file_id": file_id},
            ]
        },
        {"_id": 0, "id": 1, "channel_id": 1, "attachment": 1, "attachments": 1},
    )
    if not msg:
        raise HTTPException(status_code=404, detail="File not found")
    channel = await db.estate_channels.find_one({"id": msg["channel_id"]}, {"_id": 0, "id": 1, "members": 1})
    if not channel or current_user["id"] not in channel.get("members", []):
        raise HTTPException(status_code=403, detail="Access denied")
    # Find the matching attachment
    att = None
    if msg.get("attachment", {}).get("file_id") == file_id:
        att = msg["attachment"]
    else:
        for a in msg.get("attachments", []):
            if a.get("file_id") == file_id:
                att = a
                break
    if not att:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        data = await storage.download_raw(att["storage_key"])
    except Exception:
        raise HTTPException(status_code=404, detail="File not found in storage")
    return Response(
        content=data,
        media_type=att.get("file_type", "application/octet-stream"),
        headers={
            "Content-Disposition": f'inline; filename="{att.get("file_name", "file")}"',
            "Cache-Control": "private, max-age=3600",
        },
    )


@router.put("/estate-chat/channels/{channel_id}/members")
async def update_members(
    channel_id: str,
    data: UpdateMembersRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update members of a group channel. Benefactor only."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if channel["type"] != "group":
        raise HTTPException(status_code=400, detail="Can only update members of group channels")
    if not await _is_estate_owner(current_user["id"], channel["estate_id"]):
        raise HTTPException(status_code=403, detail="Only the benefactor can update group members")
    new_members = list(set([current_user["id"]] + data.member_ids))
    for mid in data.member_ids:
        if not await _is_estate_member(mid, channel["estate_id"]):
            raise HTTPException(status_code=400, detail=f"User {mid} is not a member of this estate")
    await db.estate_channels.update_one({"id": channel_id}, {"$set": {"members": new_members}})
    return {"success": True, "members": new_members}


@router.delete("/estate-chat/channels/{channel_id}")
async def delete_channel(
    channel_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a channel. Benefactors hard-delete for all members; others only dismiss (hide) for themselves."""
    channel = await db.estate_channels.find_one({"id": channel_id}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    user_id = current_user["id"]
    is_owner = await _is_estate_owner(user_id, channel["estate_id"])
    is_admin = current_user.get("role") == "admin"
    is_member = user_id in channel.get("members", [])
    if not (is_owner or is_admin or is_member):
        raise HTTPException(status_code=403, detail="Not authorized to delete this channel")
    now = datetime.now(timezone.utc).isoformat()
    if is_owner or is_admin:
        # Benefactor/admin: hard-delete channel and all messages for everyone
        if channel.get("type") != "circle":
            await db.estate_channels.delete_one({"id": channel_id})
            await db.estate_messages.delete_many({"channel_id": channel_id})
            await db.estate_reactions.delete_many(
                {
                    "message_id": {
                        "$in": [
                            m["id"]
                            async for m in db.estate_messages.find({"channel_id": channel_id}, {"id": 1, "_id": 0})
                        ]
                    }
                }
            )
        else:
            # Circle: dismiss for all members
            for mid in channel.get("members", []):
                await db.estate_channel_dismissals.update_one(
                    {"user_id": mid, "channel_id": channel_id},
                    {"$set": {"user_id": mid, "channel_id": channel_id, "dismissed_at": now}},
                    upsert=True,
                )
        await db.estate_channel_reads.delete_many({"channel_id": channel_id})
    else:
        # Non-benefactor: only hide for themselves
        await db.estate_channel_dismissals.update_one(
            {"user_id": user_id, "channel_id": channel_id},
            {"$set": {"user_id": user_id, "channel_id": channel_id, "dismissed_at": now}},
            upsert=True,
        )
    return {"success": True}


class BatchDeleteRequest(BaseModel):
    channel_ids: list[str]


@router.post("/estate-chat/channels/batch-delete")
async def batch_delete_channels(
    data: BatchDeleteRequest,
    current_user: dict = Depends(get_current_user),
):
    """Delete multiple channels at once. User must be a member of each channel."""
    if not data.channel_ids:
        raise HTTPException(status_code=400, detail="No channels specified")
    if len(data.channel_ids) > 50:
        raise HTTPException(status_code=400, detail="Cannot delete more than 50 channels at once")
    deleted = []
    failed = []
    now = datetime.now(timezone.utc).isoformat()
    for ch_id in data.channel_ids:
        channel = await db.estate_channels.find_one({"id": ch_id}, {"_id": 0})
        if not channel:
            failed.append({"id": ch_id, "reason": "Not found"})
            continue
        user_id = current_user["id"]
        is_owner = await _is_estate_owner(user_id, channel["estate_id"])
        is_admin = current_user.get("role") == "admin"
        is_member = user_id in channel.get("members", [])
        if not (is_owner or is_admin or is_member):
            failed.append({"id": ch_id, "reason": "Not authorized"})
            continue
        # Record dismissal so channel stays hidden for this user
        await db.estate_channel_dismissals.update_one(
            {"user_id": user_id, "channel_id": ch_id},
            {"$set": {"user_id": user_id, "channel_id": ch_id, "dismissed_at": now}},
            upsert=True,
        )
        # For non-circle channels, also hard-delete from DB
        if channel.get("type") != "circle":
            await db.estate_channels.delete_one({"id": ch_id})
            await db.estate_messages.delete_many({"channel_id": ch_id})
        await db.estate_channel_reads.delete_many({"channel_id": ch_id})
        deleted.append(ch_id)
    return {"deleted": deleted, "failed": failed}


@router.get("/estate-chat/unread-total")
async def get_unread_total(current_user: dict = Depends(get_current_user)):
    """Get total unread message count across all estate channels for badge display."""
    estate_ids = await _get_user_estate_ids(current_user["id"])
    if not estate_ids:
        return {"total": 0}
    channels = await db.estate_channels.find(
        {"estate_id": {"$in": estate_ids}, "members": current_user["id"]},
        {"_id": 0, "id": 1},
    ).to_list(200)
    # Exclude dismissed channels from unread count
    dismissed = await db.estate_channel_dismissals.find(
        {"user_id": current_user["id"]},
        {"_id": 0, "id": 1, "channel_id": 1},
    ).to_list(500)
    dismissed_ids = {d["channel_id"] for d in dismissed}
    total = 0
    for ch in channels:
        if ch["id"] in dismissed_ids:
            continue
        last_read = await db.estate_channel_reads.find_one(
            {"channel_id": ch["id"], "user_id": current_user["id"]},
            {"_id": 0, "id": 1, "last_read_at": 1},
        )
        last_read_at = last_read.get("last_read_at", "") if last_read else ""
        q = {"channel_id": ch["id"], "deleted_at": {"$exists": False}}
        if last_read_at:
            q["created_at"] = {"$gt": last_read_at}
        total += await db.estate_messages.count_documents(q)
    return {"total": total}


@router.get("/estate-chat/search")
async def search_messages(
    q: str = Query(..., min_length=1, max_length=200),
    current_user: dict = Depends(get_current_user),
):
    """Search messages across all user's estate channels by keyword."""
    estate_ids = await _get_user_estate_ids(current_user["id"])
    if not estate_ids:
        return []
    channels = await db.estate_channels.find(
        {"estate_id": {"$in": estate_ids}, "members": current_user["id"]},
        {"_id": 0, "id": 1, "name": 1, "type": 1, "estate_id": 1, "members": 1},
    ).to_list(200)
    if not channels:
        return []
    channel_ids = [c["id"] for c in channels]
    channel_map = {c["id"]: c for c in channels}
    results = (
        await db.estate_messages.find(
            {
                "channel_id": {"$in": channel_ids},
                "content": {"$regex": q, "$options": "i"},
                "deleted_at": {"$exists": False},
            },
            {"_id": 0},
        )
        .sort("created_at", -1)
        .limit(30)
        .to_list(30)
    )
    # Enrich with channel info
    for msg in results:
        ch = channel_map.get(msg.get("channel_id", ""), {})
        msg["channel_name"] = ch.get("name", "")
        msg["channel_type"] = ch.get("type", "")
        # For DMs, resolve the other person's name
        if ch.get("type") == "direct":
            other_ids = [m for m in ch.get("members", []) if m != current_user["id"]]
            if other_ids:
                other = await db.users.find_one({"id": other_ids[0]}, {"_id": 0, "id": 1, "name": 1})
                if other:
                    msg["channel_name"] = other["name"]
    return results
