"""User Preferences — dock customization and other per-user settings."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from config import db
from utils import get_current_user

router = APIRouter()


class DockPreferences(BaseModel):
    items: list[str]  # ordered list of route paths, max 5


@router.get("/user-preferences/dock")
async def get_dock_preferences(current_user: dict = Depends(get_current_user)):
    """Get the user's saved dock configuration."""
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
    """Save the user's dock configuration (max 5 items)."""
    items = data.items[:5]
    await db.user_preferences.update_one(
        {"user_id": current_user["id"], "key": "dock"},
        {"$set": {"items": items}},
        upsert=True,
    )
    return {"items": items}
