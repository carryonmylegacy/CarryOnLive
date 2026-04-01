"""CarryOn™ — Training Completion Tracker

Tracks operator progress through SOPs/Knowledge Base articles.
Managers see team-wide compliance. Workers see their own progress.
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from config import db
from guards import require_staff

router = APIRouter()


class MarkCompletedRequest(BaseModel):
    article_id: str


class CreateTrainingModuleRequest(BaseModel):
    title: str
    description: Optional[str] = None
    category: str = "general"
    required: bool = True
    content_url: Optional[str] = None


@router.get("/ops/training/modules")
async def get_training_modules(current_user: dict = Depends(require_staff)):
    """Get all training modules/articles with completion status for current user."""
    modules = await db.training_modules.find({}, {"_id": 0}).sort("order", 1).to_list(200)

    if not modules:
        # Seed from knowledge base articles if no training modules exist
        kb_articles = await db.knowledge_base.find({}, {"_id": 0, "id": 1, "title": 1, "category": 1}).to_list(200)
        for article in kb_articles:
            modules.append(
                {
                    "id": article["id"],
                    "title": article["title"],
                    "category": article.get("category", "general"),
                    "required": True,
                    "source": "knowledge_base",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            )

    completions = {}
    async for comp in db.training_completions.find(
        {"user_id": current_user["id"]},
        {"_id": 0, "id": 1, "module_id": 1, "completed_at": 1},
    ):
        completions[comp["module_id"]] = comp["completed_at"]

    result = []
    for module in modules:
        result.append(
            {
                **module,
                "completed": module["id"] in completions,
                "completed_at": completions.get(module["id"], ""),
            }
        )

    return result


@router.post("/ops/training/complete")
async def mark_training_completed(
    data: MarkCompletedRequest,
    current_user: dict = Depends(require_staff),
):
    """Mark a training module as completed by the current user."""
    existing = await db.training_completions.find_one(
        {"user_id": current_user["id"], "module_id": data.article_id},
        {"_id": 0},
    )
    if existing:
        return {"already_completed": True}

    now = datetime.now(timezone.utc).isoformat()
    await db.training_completions.insert_one(
        {
            "id": str(uuid4()),
            "user_id": current_user["id"],
            "module_id": data.article_id,
            "completed_at": now,
        }
    )

    return {"success": True, "completed_at": now}


@router.delete("/ops/training/complete/{module_id}")
async def unmark_training(
    module_id: str,
    current_user: dict = Depends(require_staff),
):
    """Unmark a training module completion. Managers/admins can unmark for any user."""
    is_manager_or_admin = current_user.get("role") == "admin" or current_user.get("operator_role") == "manager"

    query = {"module_id": module_id}
    if not is_manager_or_admin:
        query["user_id"] = current_user["id"]

    result = await db.training_completions.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Completion record not found")

    return {"success": True}


@router.get("/ops/training/team-progress")
async def get_team_progress(
    current_user: dict = Depends(require_staff),
):
    """Get training progress for all operators. Managers and admins only."""
    is_manager_or_admin = current_user.get("role") == "admin" or current_user.get("operator_role") == "manager"
    if not is_manager_or_admin:
        raise HTTPException(status_code=403, detail="Manager access required")

    modules = await db.training_modules.find({}, {"_id": 0}).to_list(200)

    if not modules:
        kb_articles = await db.knowledge_base.find({}, {"_id": 0, "id": 1, "title": 1}).to_list(200)
        modules = [{"id": a["id"], "title": a["title"]} for a in kb_articles]

    total_modules = len(modules)
    if total_modules == 0:
        total_modules = 1  # Avoid division by zero

    operators = await db.users.find(
        {"role": {"$in": ["admin", "operator"]}},
        {"_id": 0, "id": 1, "name": 1, "role": 1, "operator_role": 1},
    ).to_list(100)

    progress = []
    for op in operators:
        completed_count = await db.training_completions.count_documents({"user_id": op["id"]})
        pct = round((completed_count / total_modules) * 100)
        progress.append(
            {
                "user_id": op["id"],
                "name": op["name"],
                "role": op.get("operator_role") or op["role"],
                "completed": completed_count,
                "total": total_modules,
                "percentage": min(pct, 100),
                "certified": pct >= 100,
            }
        )

    progress.sort(key=lambda x: x["percentage"], reverse=True)
    return {"progress": progress, "total_modules": total_modules}


@router.post("/ops/training/modules")
async def create_training_module(
    data: CreateTrainingModuleRequest,
    current_user: dict = Depends(require_staff),
):
    """Create a training module. Managers and admins only."""
    is_manager_or_admin = current_user.get("role") == "admin" or current_user.get("operator_role") == "manager"
    if not is_manager_or_admin:
        raise HTTPException(status_code=403, detail="Manager access required")

    now = datetime.now(timezone.utc).isoformat()
    count = await db.training_modules.count_documents({})

    module = {
        "id": str(uuid4()),
        "title": data.title,
        "description": data.description or "",
        "category": data.category,
        "required": data.required,
        "content_url": data.content_url or "",
        "order": count + 1,
        "created_by": current_user["id"],
        "created_at": now,
    }

    await db.training_modules.insert_one({k: v for k, v in module.items()})
    return module
