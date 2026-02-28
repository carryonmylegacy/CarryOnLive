"""CarryOn™ — Security Audit Trail (SOC 2)

Logs every sensitive operation: document access, decryption, AI analysis,
admin actions, and authentication events. Immutable audit entries.
"""

import uuid
from datetime import datetime, timezone

from config import db


async def audit_log(
    action: str,
    user_id: str,
    resource_type: str,
    resource_id: str = None,
    estate_id: str = None,
    details: dict = None,
    ip_address: str = None,
):
    """Write an immutable audit log entry.

    Actions:
        document.upload, document.download, document.decrypt, document.delete,
        document.preview, document.ai_analysis,
        message.create, message.encrypt, message.decrypt, message.deliver,
        wallet.create, wallet.decrypt, wallet.delete,
        auth.login, auth.logout, auth.otp_verify, auth.failed_login,
        admin.user_delete, admin.role_change, admin.config_change,
        guardian.chat, guardian.vault_analysis, guardian.checklist_generate,
        encryption.reencrypt, encryption.key_derive,
    """
    entry = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "user_id": user_id,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "estate_id": estate_id,
        "details": details or {},
        "ip_address": ip_address,
    }
    await db.security_audit_log.insert_one(entry)
