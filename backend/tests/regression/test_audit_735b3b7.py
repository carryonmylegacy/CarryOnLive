"""Audit 735b3b7 fixes — regression tests (#1 operator least-privilege,
#2 deleted-doc designation finality, #4 latest-pdfs purge, #5 hard readiness).

Credential-free. require_scope is exercised directly (its inner dependency is a
plain async callable). Run:
  cd /app/backend && python -m pytest tests/regression/test_audit_735b3b7.py -q
"""

import asyncio
import os
import tempfile

import pytest
from fastapi import HTTPException


# ── #1 operator least-privilege via require_scope ────────────────────────────


def _call_scope(allowed, user):
    from guards import require_scope

    dep = require_scope(*allowed)
    return asyncio.run(dep(current_user=user))


def test_ops_team_denied_from_finance_compliance_founder():
    ops_team = {"role": "operator", "operator_role": "worker"}
    for allowed in (("finance",), ("compliance",), ("founder",), ("platform_health",), ("finance", "ops_manager")):
        with pytest.raises(HTTPException) as exc:
            _call_scope(allowed, ops_team)
        assert exc.value.status_code == 403


def test_ops_manager_allowed_only_on_ops_manager_scope():
    ops_mgr = {"role": "operator", "operator_role": "manager"}
    # Allowed where ops_manager is in the scope list.
    assert _call_scope(("finance", "ops_manager"), ops_mgr) is ops_mgr
    assert _call_scope(("compliance", "ops_manager"), ops_mgr) is ops_mgr
    # Denied on scopes that don't include ops_manager.
    for allowed in (("finance",), ("compliance",), ("founder",)):
        with pytest.raises(HTTPException):
            _call_scope(allowed, ops_mgr)


def test_founder_admin_passes_everything_and_scoped_admin_is_restricted():
    founder = {"role": "admin", "admin_scope": ["founder"]}
    assert _call_scope(("finance",), founder) is founder
    assert _call_scope(("compliance",), founder) is founder

    finance_admin = {"role": "admin", "admin_scope": ["finance"]}
    assert _call_scope(("finance", "ops_manager"), finance_admin) is finance_admin
    with pytest.raises(HTTPException):
        _call_scope(("compliance",), finance_admin)

    # Legacy admin with no scope is treated as founder.
    legacy = {"role": "admin"}
    assert _call_scope(("compliance",), legacy) is legacy


def test_non_staff_denied():
    for user in ({"role": "benefactor"}, {"role": "beneficiary"}, {}):
        with pytest.raises(HTTPException):
            _call_scope(("ops_team",), user)


def test_grace_periods_and_estate_health_routers_include_ops_manager():
    path = os.path.join(os.path.dirname(__file__), "..", "..", "routes", "admin", "__init__.py")
    with open(os.path.abspath(path)) as f:
        src = f.read()
    assert 'grace_periods_router, dependencies=[Depends(require_scope("finance", "ops_manager"))]' in src
    assert 'estate_health_router, dependencies=[Depends(require_scope("compliance", "ops_manager"))]' in src


# ── #2 deleted-document designation finality (static guard) ───────────────────


def test_designate_loads_and_mutates_only_non_deleted():
    path = os.path.join(os.path.dirname(__file__), "..", "..", "routes", "documents_designate.py")
    with open(os.path.abspath(path)) as f:
        src = f.read()
    assert 'find_one({"id": document_id, "deleted_at": None}' in src
    assert 'update_one(\n        {"id": document_id, "deleted_at": None}' in src


# ── #4 latest-pdfs purge on user deletion ────────────────────────────────────


def test_purge_user_storage_includes_latest_pdfs():
    from services.storage import LocalStorage

    with tempfile.TemporaryDirectory() as tmp:
        st = LocalStorage(base_path=tmp)
        import services.estate_purge as ep

        ep.storage = st  # redirect module singleton to the temp backend

        async def _run():
            uid = "user-123"
            await st.upload_raw(b"photo", f"photos/users/{uid}/avatar.jpg")
            await st.upload_raw(b"qs-pdf", f"latest-pdfs/{uid}/quickstart_guide.pdf")
            await st.upload_raw(b"binder", f"latest-pdfs/{uid}/binder.pdf")
            # Unrelated user survives.
            await st.upload_raw(b"other", "latest-pdfs/user-999/quickstart_guide.pdf")

            removed = await ep.purge_user_storage(uid)
            assert removed == 3
            assert await st.exists(f"latest-pdfs/{uid}/quickstart_guide.pdf") is False
            assert await st.exists(f"latest-pdfs/{uid}/binder.pdf") is False
            assert await st.exists(f"photos/users/{uid}/avatar.jpg") is False
            assert await st.exists("latest-pdfs/user-999/quickstart_guide.pdf") is True

        asyncio.run(_run())


# ── #5 hard readiness report shape ───────────────────────────────────────────


def test_production_readiness_report_inert_on_preview(monkeypatch):
    for k in ("ENVIRONMENT", "APP_ENV", "CARRYON_ENV", "DEPLOY_ENV", "NODE_ENV", "RAILWAY_ENVIRONMENT", "VERCEL_ENV"):
        monkeypatch.delenv(k, raising=False)
    from services.production_readiness import production_readiness_report

    report = asyncio.run(production_readiness_report())
    assert report["ok"] is True
    assert report["production"] is False
    assert report["violations"] == []
    assert "session_policy_roles" in report["required_controls"]
