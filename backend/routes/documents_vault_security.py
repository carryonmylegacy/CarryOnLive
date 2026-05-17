"""CarryOn™ Backend — Vault Security Info endpoint

Extracted from `routes/documents.py` on Feb 17, 2026 as part of the
monolith-reduction pass. This module owns the single read-only endpoint
that surfaces encryption + storage compliance metadata for the vault to
the front-end "How CarryOn protects your data" surfaces.

Why extracted: this endpoint has no shared state with the rest of
documents.py, doesn't use any of the internal _helpers there, and is
likely to be referenced from B2B compliance / trust-page surfaces — so
keeping it isolated makes the auth boundary easier to audit.

Mounted in `server.py` alongside the rest of the documents routers.
"""

from fastapi import APIRouter, Depends, HTTPException

from config import db
from utils import get_current_user

router = APIRouter()


@router.get("/vault/security-info/{estate_id}")
async def get_vault_security_info(estate_id: str, current_user: dict = Depends(get_current_user)):
    """Get encryption and security metadata for the vault."""
    # Security audit (Feb 2026): previously this endpoint returned vault
    # metadata for ANY estate_id passed by a logged-in user. Now gated
    # to estate owner / beneficiary / admin to plug a SOC 2 CC6.1 leak.
    estate = await db.estates.find_one({"id": estate_id}, {"_id": 0, "id": 1, "owner_id": 1, "beneficiaries": 1})
    if not estate:
        raise HTTPException(status_code=404, detail="Estate not found")
    is_owner = estate.get("owner_id") == current_user["id"]
    is_beneficiary = current_user["id"] in estate.get("beneficiaries", [])
    is_admin = current_user.get("role") == "admin"
    if not (is_owner or is_beneficiary or is_admin):
        raise HTTPException(status_code=403, detail="Access denied")

    documents = await db.documents.find(
        {"estate_id": estate_id, "deleted_at": None},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "storage_key": 1,
            "encryption_version": 1,
            "is_encrypted": 1,
            "file_size": 1,
        },
    ).to_list(200)

    total_docs = len(documents)
    cloud_stored = sum(1 for d in documents if d.get("storage_key"))
    aes256_encrypted = sum(1 for d in documents if d.get("encryption_version") == "aes-256-gcm")
    legacy_encrypted = total_docs - aes256_encrypted
    total_size = sum(d.get("file_size", 0) for d in documents)

    # Count audit entries for this estate
    audit_count = await db.security_audit_log.count_documents({"estate_id": estate_id})

    return {
        "encryption": {
            "algorithm": "AES-256-GCM",
            "key_derivation": "PBKDF2-SHA256 (600,000 iterations)",
            "key_scope": "Per-estate derived keys",
            "nonce": "96-bit random per operation",
            "compliance": ["FIPS 197", "2FA"],
        },
        "storage": {
            "type": "Cloud Object Storage (S3-compatible)",
            "encryption_at_rest": "Application-layer AES-256-GCM + SSE-S3",
            "encryption_in_transit": "TLS 1.3",
        },
        "vault_stats": {
            "total_documents": total_docs,
            "cloud_stored": cloud_stored,
            "aes256_encrypted": aes256_encrypted,
            "legacy_pending_migration": legacy_encrypted,
            "total_size_bytes": total_size,
            "audit_entries": audit_count,
        },
        "zero_knowledge": {
            "description": "Per-estate derived encryption keys ensure data isolation between users",
            "server_access": "Server decrypts only during authorized user sessions",
            "data_at_rest": "All document content encrypted — plaintext never stored",
        },
    }
