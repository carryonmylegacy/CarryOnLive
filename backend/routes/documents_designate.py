"""CarryOn™ Backend — Document → Beneficiary Designation endpoint

Extracted from `routes/documents.py` on Feb 17, 2026 as part of the
monolith-reduction pass. Owns the designate-beneficiaries endpoint plus
the two helpers that compute pre-transition visibility transitions and
fire the share-notification ping.

Why extracted: this endpoint encapsulates a self-contained workflow
(designation diff → notification fan-out) that does NOT share state
with the rest of documents.py. The two private helpers
(`_ben_has_pre_visibility`, `_notify_newly_pre_shared`) are only ever
called from this single endpoint.

Mounted in `server.py` alongside the rest of the documents routers.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import db, logger
from guards import require_benefactor_role
from services.audit import audit_log
from utils import get_current_user

router = APIRouter()


# ESSENTIAL_OFFLINE — categories that are always pre-transition-visible
# to designated beneficiaries (these mirror the rule used by the BEC
# pre-transition gate in routes/beneficiary_concierge.py and the
# document pre-transition listing in routes/documents.py). Kept in one
# place so share-notification + access-control stay in lockstep.
_ESSENTIAL_OFFLINE_CATEGORIES = {
    "living_will",
    "healthcare_directive",
    "general_poa",
    "financial_poa",
    "poa",
}


class DesignateBeneficiariesRequest(BaseModel):
    beneficiary_ids: list[str]
    visibility_timing: Optional[dict] = None  # {ben_id: {"pre": bool, "post": bool}}


def _ben_has_pre_visibility(ben_id: str, designation: list, category: str, timing: dict) -> bool:
    """True iff this beneficiary record can see this doc pre-transition
    under the current designation + visibility_timing snapshot.
    Mirrors the rule in routes/beneficiary_concierge.py exactly so the
    notification fires on the same edge that unlocks BEC access."""
    is_designated = "all" in (designation or []) or (ben_id and ben_id in (designation or []))
    if not is_designated:
        return False
    if (category or "") in _ESSENTIAL_OFFLINE_CATEGORIES:
        return True
    t = (timing or {}).get(ben_id) or {}
    return bool(t.get("pre", False))


async def _notify_newly_pre_shared(
    doc: dict,
    estate: dict,
    benefactor: dict,
    prev_designation: list,
    prev_timing: dict,
    new_designation: list,
    new_timing: dict,
) -> None:
    """Fire an in-app notification to each beneficiary who JUST gained
    pre-transition visibility on this document. Idempotent — beneficiaries
    who already had pre-visibility, or who don't have pre-visibility yet
    after this update, are skipped. The copy mentions BEC only when the
    benefactor's tier has BEC enabled; otherwise we keep the message
    accurate ('available in your Vault') so we don't promise a feature
    the beneficiary can't actually use yet."""
    from routes.feature_gates import get_feature_gates
    from services.notifications import notify

    category = doc.get("category") or ""
    estate_id = doc.get("estate_id")
    doc_label = doc.get("name") or (category.replace("_", " ").title() if category else "a document")
    benefactor_first = (benefactor.get("name") or "").split()[0] if benefactor.get("name") else "Your benefactor"

    # Resolve BEC tier-gate once for messaging copy.
    try:
        tier = benefactor.get("subscription_tier") or benefactor.get("plan") or "base"
        gates = await get_feature_gates()
        bec_enabled = bool((gates.get("bec") or {}).get(tier, False))
    except Exception:
        bec_enabled = False

    # Walk every beneficiary record on this estate and figure out if
    # this update transitioned them from "no pre-visibility" to "yes
    # pre-visibility". Only those get pinged.
    cursor = db.beneficiaries.find(
        {"estate_id": estate_id},
        {"_id": 0, "id": 1, "user_id": 1, "name": 1},
    )
    async for ben in cursor:
        ben_id = ben.get("id")
        ben_user_id = ben.get("user_id")
        # Anonymous beneficiaries (no claimed account) can't receive
        # in-app notifications — skip silently. They'll see the doc
        # the next time they sign in.
        if not ben_id or not ben_user_id:
            continue
        was = _ben_has_pre_visibility(ben_id, prev_designation, category, prev_timing)
        now = _ben_has_pre_visibility(ben_id, new_designation, category, new_timing)
        if was or not now:
            continue
        if bec_enabled:
            title = f"{benefactor_first} just shared a document with you"
            body = (
                f"{benefactor_first} shared {doc_label} with you. "
                f"Your Beneficiary Estate Concierge can now answer questions about it."
            )
            url = f"/beneficiary/concierge?estate_id={estate_id}"
        else:
            title = f"{benefactor_first} just shared a document with you"
            body = f"{benefactor_first} shared {doc_label} with you. It's available in your Vault."
            url = f"/beneficiary/vault?estate_id={estate_id}"
        try:
            await notify.beneficiary(
                ben_user_id,
                title,
                body,
                url=url,
                priority="normal",
                metadata={
                    "type": "bec_doc_shared" if bec_enabled else "vault_doc_shared",
                    "doc_id": doc.get("id"),
                    "doc_category": category,
                    "estate_id": estate_id,
                },
            )
        except Exception as e:  # pragma: no cover — log and continue
            logger.warning(f"_notify_newly_pre_shared: notify.beneficiary failed for ben {ben_id}: {e}")


@router.put("/documents/{document_id}/designate-beneficiaries")
async def designate_beneficiaries(
    document_id: str,
    data: DesignateBeneficiariesRequest,
    current_user: dict = Depends(get_current_user),
):
    """Set which beneficiaries should receive this document and when.

    beneficiary_ids: ["all"] means every beneficiary sees it (default).
    Otherwise provide specific beneficiary record IDs.
    visibility_timing: optional dict mapping ben_id -> {"pre": bool, "post": bool}
    """
    require_benefactor_role(current_user, "designate document beneficiaries")

    doc = await db.documents.find_one({"id": document_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    estate = await db.estates.find_one(
        {"id": doc["estate_id"], "owner_id": current_user["id"]},
        {"_id": 0, "id": 1, "name": 1},
    )
    if not estate:
        raise HTTPException(status_code=403, detail="Access denied")

    # Snapshot pre-state for the share-notification diff before we
    # mutate so we can fire a "[Benefactor] just shared … with you"
    # ping to any beneficiary who gains pre-transition visibility on
    # this document. See _notify_newly_pre_shared above.
    prev_designation = doc.get("designated_beneficiaries") or ["all"]
    prev_timing = doc.get("visibility_timing") or {}

    update_fields = {
        "designated_beneficiaries": data.beneficiary_ids,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if data.visibility_timing is not None:
        update_fields["visibility_timing"] = data.visibility_timing

    await db.documents.update_one(
        {"id": document_id},
        {"$set": update_fields},
    )

    await audit_log(
        action="document.designate_beneficiaries",
        user_id=current_user["id"],
        resource_type="document",
        resource_id=document_id,
        estate_id=doc["estate_id"],
    )

    # Fire-and-forget pre-share notifications to beneficiaries who
    # gained pre-transition visibility on this update. Errors are
    # logged but never block the designation response.
    try:
        await _notify_newly_pre_shared(
            doc=doc,
            estate=estate,
            benefactor=current_user,
            prev_designation=prev_designation,
            prev_timing=prev_timing,
            new_designation=data.beneficiary_ids,
            new_timing=(data.visibility_timing if data.visibility_timing is not None else prev_timing),
        )
    except Exception as e:  # pragma: no cover — notification failures are non-fatal
        logger.warning(f"designate_beneficiaries: pre-share notify failed for doc {document_id}: {e}")

    return {
        "document_id": document_id,
        "designated_beneficiaries": data.beneficiary_ids,
        "visibility_timing": data.visibility_timing,
    }
