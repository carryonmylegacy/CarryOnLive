"""CarryOn™ Backend — Designated Trustee Services"""
from fastapi import APIRouter, HTTPException, Depends, Response
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from config import db
from utils import get_current_user, log_activity, send_push_notification
import uuid
import asyncio
import base64

router = APIRouter()

# ===================== DTS (Designated Trustee Services) BACKEND =====================

class DTSTaskCreate(BaseModel):
    estate_id: str
    title: str
    description: str
    task_type: str  # delivery, account_closure, financial, communication, destruction
    confidential: str = "full"  # full, partial, timed
    disclose_to: List[str] = []
    timed_release: Optional[str] = None
    beneficiary: Optional[str] = None

class DTSLineItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    description: str
    cost: float
    approved: Optional[bool] = None

class DTSQuoteCreate(BaseModel):
    task_id: str
    line_items: List[Dict[str, Any]]
    notes: Optional[str] = None

@router.post("/dts/tasks")
async def create_dts_task(data: DTSTaskCreate, current_user: dict = Depends(get_current_user)):
    """Benefactor creates a DTS request"""
    if current_user["role"] != "benefactor":
        raise HTTPException(status_code=403, detail="Only benefactors can create DTS tasks")
    task = {
        "id": str(uuid.uuid4()),
        "estate_id": data.estate_id,
        "owner_id": current_user["id"],
        "title": data.title,
        "description": data.description,
        "task_type": data.task_type,
        "confidential": data.confidential,
        "disclose_to": data.disclose_to,
        "timed_release": data.timed_release,
        "beneficiary": data.beneficiary,
        "status": "submitted",  # submitted, quoted, approved, ready, executed, destroyed
        "line_items": [],
        "payment_method": None,
        "credentials": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.dts_tasks.insert_one(task)
    await log_activity(data.estate_id, current_user["id"], current_user["name"], "dts_request_created", f"DTS request: {data.title}")
    return {k: v for k, v in task.items() if k != "_id"}

@router.get("/dts/tasks/all")
async def get_all_dts_tasks(current_user: dict = Depends(get_current_user)):
    """Admin gets all DTS tasks across all estates"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    tasks = await db.dts_tasks.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return tasks

@router.get("/dts/tasks/{estate_id}")
async def get_dts_tasks(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get DTS tasks for an estate (benefactor) or all tasks (admin)"""
    if current_user["role"] == "admin":
        tasks = await db.dts_tasks.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    else:
        tasks = await db.dts_tasks.find({"estate_id": estate_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return tasks

@router.get("/dts/task/{task_id}")
async def get_dts_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single DTS task"""
    task = await db.dts_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@router.post("/dts/tasks/{task_id}/quote")
async def submit_dts_quote(task_id: str, data: DTSQuoteCreate, current_user: dict = Depends(get_current_user)):
    """Admin/DTS team submits a quote for a task"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only DTS team can submit quotes")
    
    task = await db.dts_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    line_items = []
    total_cost = 0
    for item in data.line_items:
        cost = float(item.get("cost", 0))
        total_cost += cost
        line_items.append({
            "id": str(uuid.uuid4()),
            "description": item.get("description", ""),
            "cost": cost,
            "approved": None,
        })
    await db.dts_tasks.update_one(
        {"id": task_id},
        {"$set": {"line_items": line_items, "status": "quoted", "quote_notes": data.notes, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Notify the task owner about the quote
    estate = await db.estates.find_one({"id": task["estate_id"]}, {"_id": 0, "user_id": 1})
    if estate:
        asyncio.create_task(send_push_notification(
            estate["user_id"],
            "DTS Quote Ready",
            f"Your DTS request '{task['title']}' has a quote: ${total_cost:,.2f}",
            "/trustee",
            "dts-quote",
            "dts"
        ))
    
    return {"message": "Quote submitted", "line_items": len(line_items)}

@router.post("/dts/tasks/{task_id}/approve-item")
async def approve_dts_line_item(task_id: str, item_id: str, approved: bool, current_user: dict = Depends(get_current_user)):
    """Benefactor approves/rejects a line item"""
    task = await db.dts_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    line_items = task.get("line_items", [])
    for li in line_items:
        if li["id"] == item_id:
            li["approved"] = approved
            break
    await db.dts_tasks.update_one({"id": task_id}, {"$set": {"line_items": line_items, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Item updated"}

@router.post("/dts/tasks/{task_id}/approve-all")
async def approve_dts_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Benefactor approves the entire task (all pending items default to approved)"""
    task = await db.dts_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    line_items = task.get("line_items", [])
    for li in line_items:
        if li["approved"] is None:
            li["approved"] = True
    await db.dts_tasks.update_one(
        {"id": task_id},
        {"$set": {"line_items": line_items, "status": "approved", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Task approved"}

@router.post("/dts/tasks/{task_id}/status")
async def update_dts_status(task_id: str, task_status: str, current_user: dict = Depends(get_current_user)):
    """Admin updates task status"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only DTS team can update status")
    valid = ["submitted", "quoted", "approved", "ready", "executed", "destroyed"]
    if task_status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid}")
    await db.dts_tasks.update_one({"id": task_id}, {"$set": {"status": task_status, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": f"Status updated to {task_status}"}

class DTSTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    task_type: Optional[str] = None
    confidential: Optional[str] = None
    disclose_to: Optional[List[str]] = None
    timed_release: Optional[str] = None
    beneficiary: Optional[str] = None

@router.put("/dts/tasks/{task_id}")
async def update_dts_task(task_id: str, data: DTSTaskUpdate, current_user: dict = Depends(get_current_user)):
    """Edit a DTS task - resets status to 'submitted' for re-quoting"""
    task = await db.dts_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Verify ownership - check estate ownership, task owner, or benefactor role with matching estate
    estate = await db.estates.find_one({"id": task["estate_id"], "user_id": current_user["id"]}, {"_id": 0})
    is_task_owner = task.get("owner_id") == current_user["id"]
    # Also allow if user is benefactor and has an estate matching the task's estate_id
    user_estates = await db.estates.find({"user_id": current_user["id"]}, {"_id": 0, "id": 1}).to_list(100)
    user_estate_ids = [e["id"] for e in user_estates]
    has_estate_access = task["estate_id"] in user_estate_ids
    
    if not estate and not is_task_owner and not has_estate_access and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to edit this task")
    
    # Build update dict from provided fields
    update_fields = {k: v for k, v in data.model_dump().items() if v is not None}
    update_fields["status"] = "submitted"  # Reset to submitted for re-quoting
    update_fields["line_items"] = []  # Clear previous quote
    update_fields["payment_method"] = None  # Clear payment method
    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.dts_tasks.update_one({"id": task_id}, {"$set": update_fields})
    
    await log_activity(task["estate_id"], current_user["id"], current_user.get("name", ""), "dts_task_edited", f"DTS task edited and sent for re-quoting: {data.title or task['title']}")
    
    return {"success": True, "message": "Task updated and sent back for re-quoting"}

@router.delete("/dts/tasks/{task_id}")
async def delete_dts_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a DTS task completely"""
    task = await db.dts_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Verify ownership - check estate ownership, task owner, or benefactor with estate access
    estate = await db.estates.find_one({"id": task["estate_id"], "user_id": current_user["id"]}, {"_id": 0})
    is_task_owner = task.get("owner_id") == current_user["id"]
    # Also allow if user has an estate matching the task's estate_id
    user_estates = await db.estates.find({"user_id": current_user["id"]}, {"_id": 0, "id": 1}).to_list(100)
    user_estate_ids = [e["id"] for e in user_estates]
    has_estate_access = task["estate_id"] in user_estate_ids
    
    if not estate and not is_task_owner and not has_estate_access and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to delete this task")
    
    await db.dts_tasks.delete_one({"id": task_id})
    
    await log_activity(task["estate_id"], current_user["id"], current_user.get("name", ""), "dts_task_deleted", f"DTS task deleted: {task['title']}")
    
    return {"success": True, "message": "Task deleted successfully"}

# ===================== ENHANCED TRANSITION VERIFICATION =====================

@router.get("/transition/certificates/all")
async def get_all_certificates(current_user: dict = Depends(get_current_user)):
    """Get all certificates with full details for verification team"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    certs = await db.death_certificates.find({}, {"_id": 0, "file_data": 0}).sort("created_at", -1).to_list(200)
    # Enrich with estate and uploader info
    for cert in certs:
        estate = await db.estates.find_one({"id": cert.get("estate_id")}, {"_id": 0, "name": 1, "owner_id": 1, "status": 1})
        if estate:
            cert["estate_name"] = estate.get("name", "Unknown")
            cert["estate_status"] = estate.get("status", "unknown")
        uploader = await db.users.find_one({"id": cert.get("uploaded_by")}, {"_id": 0, "name": 1, "email": 1})
        if uploader:
            cert["uploader_name"] = uploader.get("name", "Unknown")
            cert["uploader_email"] = uploader.get("email", "")
    return certs

@router.get("/transition/certificate/{cert_id}/document")
async def get_certificate_document(cert_id: str, current_user: dict = Depends(get_current_user)):
    """Download/view the actual death certificate document"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    cert = await db.death_certificates.find_one({"id": cert_id}, {"_id": 0})
    if not cert or not cert.get("file_data"):
        raise HTTPException(status_code=404, detail="Certificate not found")
    file_bytes = base64.b64decode(cert["file_data"])
    content_type = "application/pdf"
    if cert.get("file_name", "").lower().endswith((".jpg", ".jpeg")):
        content_type = "image/jpeg"
    elif cert.get("file_name", "").lower().endswith(".png"):
        content_type = "image/png"
    return Response(content=file_bytes, media_type=content_type, headers={"Content-Disposition": f'inline; filename="{cert["file_name"]}"'})

@router.post("/transition/reject/{certificate_id}")
async def reject_death_certificate(certificate_id: str, current_user: dict = Depends(get_current_user)):
    """Reject a death certificate"""
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admins can reject certificates")
    cert = await db.death_certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    await db.death_certificates.update_one(
        {"id": certificate_id},
        {"$set": {"status": "rejected", "reviewed_by": current_user["id"], "reviewed_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Certificate rejected"}



