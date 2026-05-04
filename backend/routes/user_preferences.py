"""User Preferences — dock customization and other per-user settings."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from config import db
from utils import get_current_user

router = APIRouter()


class DockPreferences(BaseModel):
    items: list[str]  # ordered list of route paths, max 5
    role: str = "benefactor"  # role key for per-role storage


class MenuOrderPreferences(BaseModel):
    items: list[str]  # ordered list of route paths (no max — full feature menu)
    role: str = "benefactor"  # role key for per-role storage


class ChatAutoscrollPreferences(BaseModel):
    # Minutes since the user last opened a specific chat channel after which
    # the chat should auto-scroll to the latest message on re-open. Under this
    # threshold, the last scroll position is restored (iMessage-like). Range
    # 1-1440 minutes (1 min to 24 hours). Default 240 (4 hours).
    threshold_minutes: int = 240


@router.get("/user-preferences/menu-order")
async def get_menu_order_preferences(
    role: str = "benefactor",
    current_user: dict = Depends(get_current_user),
):
    """Get the user's saved menu-order configuration for a specific role.

    This is a cosmetic reorder overlay applied on top of the tier-gated
    feature list shown in the sidebar / hamburger menu. Gating itself
    remains owned by admin/tier config — this endpoint only persists
    the user's preferred order.
    """
    doc = await db.user_preferences.find_one(
        {"user_id": current_user["id"], "key": f"menu_order_{role}"},
        {"_id": 0},
    )
    if not doc:
        return {"items": []}
    return {"items": doc.get("items", [])}


@router.put("/user-preferences/menu-order")
async def save_menu_order_preferences(
    data: MenuOrderPreferences,
    current_user: dict = Depends(get_current_user),
):
    """Save the user's menu-order configuration for a specific role."""
    # Sanity cap — no single user should have >64 menu items; this
    # also blocks accidental payload blow-ups from a broken client.
    items = data.items[:64]
    await db.user_preferences.update_one(
        {"user_id": current_user["id"], "key": f"menu_order_{data.role}"},
        {"$set": {"items": items}},
        upsert=True,
    )
    return {"items": items}


@router.get("/user-preferences/dock")
async def get_dock_preferences(
    role: str = "benefactor",
    current_user: dict = Depends(get_current_user),
):
    """Get the user's saved dock configuration for a specific role."""
    doc = await db.user_preferences.find_one(
        {"user_id": current_user["id"], "key": f"dock_{role}"},
        {"_id": 0},
    )
    # Fall back to legacy key (no role suffix) for backwards compatibility
    if not doc:
        doc = await db.user_preferences.find_one(
            {"user_id": current_user["id"], "key": "dock"},
            {"_id": 0},
        )
    if not doc:
        return {"items": []}
    return {"items": doc.get("items", [])}


@router.put("/user-preferences/dock")
async def save_dock_preferences(
    data: DockPreferences,
    current_user: dict = Depends(get_current_user),
):
    """Save the user's dock configuration for a specific role (max 5 items)."""
    items = data.items[:5]
    await db.user_preferences.update_one(
        {"user_id": current_user["id"], "key": f"dock_{data.role}"},
        {"$set": {"items": items}},
        upsert=True,
    )
    return {"items": items}


@router.get("/user-preferences/chat-autoscroll")
async def get_chat_autoscroll_preferences(
    current_user: dict = Depends(get_current_user),
):
    """Return the user's chat auto-scroll-to-latest threshold (minutes).

    When re-opening a chat channel, the client checks the age of the
    locally-tracked last-visit timestamp: if older than this threshold
    we jump to the most recent message, otherwise we restore the
    previous scroll position.
    """
    doc = await db.user_preferences.find_one(
        {"user_id": current_user["id"], "key": "chat_autoscroll"},
        {"_id": 0},
    )
    return {"threshold_minutes": int((doc or {}).get("threshold_minutes", 240))}


@router.put("/user-preferences/chat-autoscroll")
async def save_chat_autoscroll_preferences(
    data: ChatAutoscrollPreferences,
    current_user: dict = Depends(get_current_user),
):
    """Persist the user's chat auto-scroll threshold (1-1440 minutes)."""
    minutes = max(1, min(1440, int(data.threshold_minutes)))
    await db.user_preferences.update_one(
        {"user_id": current_user["id"], "key": "chat_autoscroll"},
        {"$set": {"threshold_minutes": minutes}},
        upsert=True,
    )
    return {"threshold_minutes": minutes}


# --- Onboarding email drip opt-out -------------------------------------------------


class OnboardingEmailsPreferences(BaseModel):
    enabled: bool = True


@router.get("/user-preferences/onboarding-emails")
async def get_onboarding_emails_pref(
    current_user: dict = Depends(get_current_user),
):
    """Whether the user is opted-in to the onboarding email drip (default: True)."""
    doc = await db.user_preferences.find_one(
        {"user_id": current_user["id"]}, {"_id": 0, "id": 1, "onboarding_emails": 1}
    )
    val = (doc or {}).get("onboarding_emails")
    return {"enabled": True if val is None else bool(val)}


@router.put("/user-preferences/onboarding-emails")
async def set_onboarding_emails_pref(
    data: OnboardingEmailsPreferences,
    current_user: dict = Depends(get_current_user),
):
    """Persist the user's onboarding-email opt-in/opt-out."""
    await db.user_preferences.update_one(
        {"user_id": current_user["id"]},
        {"$set": {"onboarding_emails": bool(data.enabled)}},
        upsert=True,
    )
    return {"enabled": bool(data.enabled)}


# --- Scroll position restoration (cross-device) ------------------------------------


class ScrollRestorationPref(BaseModel):
    enabled: bool = False
    # Optional: caller may also push the local positions map at the
    # same time so the toggle flip + positions land in one round-trip.
    positions: dict | None = None


@router.get("/user-preferences/scroll-restoration")
async def get_scroll_restoration_pref(
    current_user: dict = Depends(get_current_user),
):
    """Return the user's scroll-restoration toggle + saved positions.

    Frontend uses this to seed local state on a fresh device so that
    "scroll halfway down Beneficiaries on phone, switch to laptop,
    open Beneficiaries → land at the same spot" works end-to-end.
    Positions are stored as `{ "/path": offsetY }` and capped at 80
    server-side to bound storage per user.
    """
    doc = await db.user_preferences.find_one(
        {"user_id": current_user["id"], "key": "scroll_restoration"},
        {"_id": 0, "id": 1, "enabled": 1, "positions": 1},
    )
    return {
        "enabled": bool((doc or {}).get("enabled", False)),
        "positions": (doc or {}).get("positions") or {},
    }


@router.put("/user-preferences/scroll-restoration")
async def set_scroll_restoration_pref(
    data: ScrollRestorationPref,
    current_user: dict = Depends(get_current_user),
):
    """Persist the toggle, and optionally the latest positions map.

    When `enabled` flips to False, the server-side positions map is
    cleared too — same semantics as the local pref. Positions are
    coerced to integer Y offsets (defensive against malformed clients)
    and the dict is hard-capped at 80 entries (oldest dropped first
    via insertion order).
    """
    update = {"enabled": bool(data.enabled)}
    if not data.enabled:
        update["positions"] = {}
    elif isinstance(data.positions, dict):
        clean: dict[str, int] = {}
        for k, v in data.positions.items():
            if not isinstance(k, str) or not k.startswith("/"):
                continue
            try:
                clean[k] = max(0, int(v))
            except (TypeError, ValueError):
                continue
            if len(clean) >= 80:
                break
        update["positions"] = clean
    await db.user_preferences.update_one(
        {"user_id": current_user["id"], "key": "scroll_restoration"},
        {"$set": update},
        upsert=True,
    )
    return {
        "enabled": update["enabled"],
        "positions": update.get("positions", {}),
    }
