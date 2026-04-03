"""User Preferences — dock customization and other per-user settings."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from config import db
from utils import get_current_user

router = APIRouter()


class DockPreferences(BaseModel):
    items: list[str]  # ordered list of route paths, max 5
    role: str = "benefactor"  # role key for per-role storage


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
