"""CarryOn™ — Shift Scheduling

Manager/Founder-controlled shift assignment system for operators.
Supports day, evening, night, and on-call shift types.
"""

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

from config import db
from guards import require_staff

router = APIRouter()

SHIFT_TYPES = ["day", "evening", "night", "on_call"]

SHIFT_LABELS = {
    "day": "Day (6AM-2PM)",
    "evening": "Evening (2PM-10PM)",
    "night": "Night (10PM-6AM)",
    "on_call": "On-Call",
}


class CreateShiftRequest(BaseModel):
    operator_id: str
    shift_type: str
    date: str  # YYYY-MM-DD
    notes: Optional[str] = None


class UpdateShiftRequest(BaseModel):
    shift_type: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None  # scheduled, confirmed, completed, cancelled


@router.get("/ops/shifts")
async def get_shifts(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    operator_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_staff),
):
    """Get shifts. Workers see their own, managers/admins see all."""
    query = {}

    is_manager_or_admin = current_user.get("role") == "admin" or current_user.get("operator_role") == "manager"

    if not is_manager_or_admin:
        query["operator_id"] = current_user["id"]
    elif operator_id:
        query["operator_id"] = operator_id

    if start_date:
        query.setdefault("date", {})["$gte"] = start_date
    if end_date:
        query.setdefault("date", {})["$lte"] = end_date

    shifts = await db.shift_schedules.find(query, {"_id": 0}).sort("date", 1).to_list(500)

    # Enrich with operator names
    operator_ids = list({s["operator_id"] for s in shifts})
    operators = {}
    if operator_ids:
        async for op in db.users.find(
            {"id": {"$in": operator_ids}},
            {"_id": 0, "id": 1, "name": 1, "operator_role": 1},
        ):
            operators[op["id"]] = op

    for shift in shifts:
        op = operators.get(shift["operator_id"], {})
        shift["operator_name"] = op.get("name", "Unknown")
        shift["operator_role"] = op.get("operator_role", "")

    return shifts


@router.post("/ops/shifts")
async def create_shift(
    data: CreateShiftRequest,
    current_user: dict = Depends(require_staff),
):
    """Create a shift assignment. Managers and admins only."""
    is_manager_or_admin = current_user.get("role") == "admin" or current_user.get("operator_role") == "manager"
    if not is_manager_or_admin:
        raise HTTPException(status_code=403, detail="Only managers can create shifts")

    if data.shift_type not in SHIFT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid shift type. Must be one of: {', '.join(SHIFT_TYPES)}")

    operator = await db.users.find_one(
        {"id": data.operator_id, "role": {"$in": ["admin", "operator"]}},
        {"_id": 0, "id": 1, "name": 1},
    )
    if not operator:
        raise HTTPException(status_code=404, detail="Operator not found")

    existing = await db.shift_schedules.find_one(
        {
            "operator_id": data.operator_id,
            "date": data.date,
            "shift_type": data.shift_type,
            "status": {"$ne": "cancelled"},
        },
        {"_id": 0},
    )
    if existing:
        raise HTTPException(status_code=409, detail="Shift already exists for this operator on this date/type")

    now = datetime.now(timezone.utc).isoformat()
    shift = {
        "id": str(uuid4()),
        "operator_id": data.operator_id,
        "operator_name": operator["name"],
        "shift_type": data.shift_type,
        "shift_label": SHIFT_LABELS.get(data.shift_type, data.shift_type),
        "date": data.date,
        "notes": data.notes or "",
        "status": "scheduled",
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
    }

    await db.shift_schedules.insert_one({k: v for k, v in shift.items()})
    return shift


@router.put("/ops/shifts/{shift_id}")
async def update_shift(
    shift_id: str,
    data: UpdateShiftRequest,
    current_user: dict = Depends(require_staff),
):
    """Update a shift. Workers can confirm their own, managers can edit any."""
    shift = await db.shift_schedules.find_one({"id": shift_id}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    is_manager_or_admin = current_user.get("role") == "admin" or current_user.get("operator_role") == "manager"
    is_own_shift = shift["operator_id"] == current_user["id"]

    if not is_manager_or_admin and not is_own_shift:
        raise HTTPException(status_code=403, detail="Access denied")

    if not is_manager_or_admin and data.status and data.status not in ("confirmed",):
        raise HTTPException(status_code=403, detail="Workers can only confirm their shifts")

    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.shift_type and is_manager_or_admin:
        if data.shift_type not in SHIFT_TYPES:
            raise HTTPException(status_code=400, detail="Invalid shift type")
        update["shift_type"] = data.shift_type
        update["shift_label"] = SHIFT_LABELS.get(data.shift_type, data.shift_type)
    if data.notes is not None and is_manager_or_admin:
        update["notes"] = data.notes
    if data.status:
        update["status"] = data.status

    await db.shift_schedules.update_one({"id": shift_id}, {"$set": update})
    return {"success": True}


@router.delete("/ops/shifts/{shift_id}")
async def delete_shift(
    shift_id: str,
    current_user: dict = Depends(require_staff),
):
    """Cancel a shift. Managers and admins only."""
    is_manager_or_admin = current_user.get("role") == "admin" or current_user.get("operator_role") == "manager"
    if not is_manager_or_admin:
        raise HTTPException(status_code=403, detail="Only managers can cancel shifts")

    result = await db.shift_schedules.update_one(
        {"id": shift_id},
        {"$set": {"status": "cancelled", "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Shift not found")

    return {"success": True}


@router.get("/ops/shifts/summary")
async def get_shift_summary(
    week_start: Optional[str] = Query(None),
    current_user: dict = Depends(require_staff),
):
    """Get shift coverage summary for the week."""
    from datetime import timedelta

    if not week_start:
        today = datetime.now(timezone.utc).date()
        days_since_monday = today.weekday()
        week_start = (today - timedelta(days=days_since_monday)).isoformat()

    week_end_date = datetime.fromisoformat(week_start).date() + timedelta(days=6)
    week_end = week_end_date.isoformat()

    shifts = await db.shift_schedules.find(
        {"date": {"$gte": week_start, "$lte": week_end}, "status": {"$ne": "cancelled"}},
        {"_id": 0},
    ).to_list(200)

    by_date = {}
    for s in shifts:
        by_date.setdefault(s["date"], []).append(s)

    summary = []
    current = datetime.fromisoformat(week_start).date()
    for _ in range(7):
        date_str = current.isoformat()
        day_shifts = by_date.get(date_str, [])
        summary.append(
            {
                "date": date_str,
                "day_name": current.strftime("%a"),
                "total": len(day_shifts),
                "by_type": {t: len([s for s in day_shifts if s["shift_type"] == t]) for t in SHIFT_TYPES},
            }
        )
        current += timedelta(days=1)

    return {"week_start": week_start, "summary": summary}


# ── Shift Swap Requests ───────────────────────────────────


class SwapRequestCreate(BaseModel):
    shift_id: str
    target_operator_id: str
    target_shift_id: Optional[str] = None
    reason: Optional[str] = None


class SwapRequestAction(BaseModel):
    action: str  # approve or deny
    notes: Optional[str] = None


@router.get("/ops/shifts/swap-requests")
async def get_swap_requests(
    status_filter: Optional[str] = Query(None),
    current_user: dict = Depends(require_staff),
):
    """Get swap requests. Workers see their own, managers/admins see all."""
    is_manager_or_admin = current_user.get("role") == "admin" or current_user.get("operator_role") == "manager"

    query = {}
    if not is_manager_or_admin:
        query["$or"] = [
            {"requester_id": current_user["id"]},
            {"target_operator_id": current_user["id"]},
        ]
    if status_filter:
        query["status"] = status_filter

    requests = await db.shift_swap_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return requests


@router.post("/ops/shifts/swap-requests")
async def create_swap_request(
    data: SwapRequestCreate,
    current_user: dict = Depends(require_staff),
):
    """Request a shift swap with another operator."""
    # Verify the requesting shift exists and belongs to user
    my_shift = await db.shift_schedules.find_one(
        {"id": data.shift_id, "status": {"$nin": ["cancelled", "completed"]}},
        {"_id": 0},
    )
    if not my_shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    if my_shift["operator_id"] != current_user["id"]:
        is_manager_or_admin = current_user.get("role") == "admin" or current_user.get("operator_role") == "manager"
        if not is_manager_or_admin:
            raise HTTPException(status_code=403, detail="You can only request swaps for your own shifts")

    # Verify target operator exists
    target = await db.users.find_one(
        {"id": data.target_operator_id, "role": {"$in": ["admin", "operator"]}},
        {"_id": 0, "id": 1, "name": 1},
    )
    if not target:
        raise HTTPException(status_code=404, detail="Target operator not found")

    if data.target_operator_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Cannot swap with yourself")

    # Check for duplicate pending request
    existing = await db.shift_swap_requests.find_one(
        {"shift_id": data.shift_id, "target_operator_id": data.target_operator_id, "status": "pending"},
        {"_id": 0},
    )
    if existing:
        raise HTTPException(status_code=409, detail="A swap request already exists for this shift and operator")

    # Verify target shift if specified
    target_shift_info = ""
    if data.target_shift_id:
        target_shift = await db.shift_schedules.find_one(
            {"id": data.target_shift_id, "operator_id": data.target_operator_id, "status": {"$nin": ["cancelled", "completed"]}},
            {"_id": 0},
        )
        if not target_shift:
            raise HTTPException(status_code=404, detail="Target shift not found or doesn't belong to the target operator")
        target_shift_info = f"{SHIFT_LABELS.get(target_shift['shift_type'], target_shift['shift_type'])} on {target_shift['date']}"

    now = datetime.now(timezone.utc).isoformat()
    req_id = str(uuid4())

    swap_request = {
        "id": req_id,
        "shift_id": data.shift_id,
        "shift_date": my_shift["date"],
        "shift_type": my_shift["shift_type"],
        "shift_label": my_shift.get("shift_label", SHIFT_LABELS.get(my_shift["shift_type"], "")),
        "requester_id": current_user["id"],
        "requester_name": current_user.get("name", "Unknown"),
        "target_operator_id": data.target_operator_id,
        "target_operator_name": target["name"],
        "target_shift_id": data.target_shift_id or "",
        "target_shift_info": target_shift_info,
        "reason": data.reason or "",
        "status": "pending",
        "created_at": now,
        "updated_at": now,
    }

    await db.shift_swap_requests.insert_one({k: v for k, v in swap_request.items()})

    # Notify target operator and managers via WebSocket
    from routes.ws_notifications import send_to_user, broadcast_to_staff

    await send_to_user(
        data.target_operator_id,
        {
            "type": "swap_request",
            "message": f"{current_user.get('name', 'An operator')} wants to swap shifts with you",
            "swap_id": req_id,
        },
    )

    return swap_request


@router.put("/ops/shifts/swap-requests/{request_id}")
async def action_swap_request(
    request_id: str,
    data: SwapRequestAction,
    current_user: dict = Depends(require_staff),
):
    """Approve or deny a shift swap request. Managers/admins only."""
    is_manager_or_admin = current_user.get("role") == "admin" or current_user.get("operator_role") == "manager"
    if not is_manager_or_admin:
        raise HTTPException(status_code=403, detail="Only managers can approve/deny swap requests")

    if data.action not in ("approve", "deny"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'deny'")

    swap_req = await db.shift_swap_requests.find_one({"id": request_id, "status": "pending"}, {"_id": 0})
    if not swap_req:
        raise HTTPException(status_code=404, detail="Swap request not found or already actioned")

    now = datetime.now(timezone.utc).isoformat()

    if data.action == "approve":
        # Perform the swap — reassign the requester's shift to the target
        await db.shift_schedules.update_one(
            {"id": swap_req["shift_id"]},
            {
                "$set": {
                    "operator_id": swap_req["target_operator_id"],
                    "operator_name": swap_req["target_operator_name"],
                    "updated_at": now,
                    "notes": f"Swapped from {swap_req['requester_name']}",
                }
            },
        )

        # If a target shift was specified, swap it back to the requester
        if swap_req.get("target_shift_id"):
            await db.shift_schedules.update_one(
                {"id": swap_req["target_shift_id"]},
                {
                    "$set": {
                        "operator_id": swap_req["requester_id"],
                        "operator_name": swap_req["requester_name"],
                        "updated_at": now,
                        "notes": f"Swapped from {swap_req['target_operator_name']}",
                    }
                },
            )

    await db.shift_swap_requests.update_one(
        {"id": request_id},
        {
            "$set": {
                "status": "approved" if data.action == "approve" else "denied",
                "actioned_by": current_user["id"],
                "actioned_by_name": current_user.get("name", ""),
                "action_notes": data.notes or "",
                "updated_at": now,
            }
        },
    )

    # Notify requester
    from routes.ws_notifications import send_to_user

    status_label = "approved" if data.action == "approve" else "denied"
    await send_to_user(
        swap_req["requester_id"],
        {
            "type": "swap_result",
            "message": f"Your shift swap request has been {status_label}",
            "swap_id": request_id,
            "status": status_label,
        },
    )

    return {"success": True, "status": status_label}
