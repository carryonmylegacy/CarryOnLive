"""SOC2 Hardening — Batch B regression tests (audit 5391e8b #2/#6/#7).

Credential-free, no live HTTP. Pure-function + LocalStorage filesystem checks.
Run: cd /app/backend && python -m pytest tests/regression/test_soc2_batch_b.py -q
(No pytest-asyncio in this project — async paths use asyncio.run manually.)
"""

import asyncio
import os
import tempfile


# ── #7 environment detection ────────────────────────────────────────────────


def test_is_production_inert_on_preview(monkeypatch):
    from services.environment import is_production

    for k in ("ENVIRONMENT", "APP_ENV", "CARRYON_ENV", "DEPLOY_ENV", "NODE_ENV", "RAILWAY_ENVIRONMENT", "VERCEL_ENV"):
        monkeypatch.delenv(k, raising=False)
    assert is_production() is False


def test_is_production_detects_prod_values(monkeypatch):
    from services.environment import is_production

    monkeypatch.setenv("ENVIRONMENT", "production")
    assert is_production() is True
    monkeypatch.setenv("ENVIRONMENT", "prod-us-east")
    assert is_production() is True


# ── #7 production readiness violations ───────────────────────────────────────


def test_readiness_flags_missing_logging_and_middleware(monkeypatch):
    from services.production_readiness import evaluate_production_readiness

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("REDACT_PII", raising=False)
    monkeypatch.delenv("LOG_FORMAT", raising=False)

    class FakeApp:
        user_middleware = []

    r = evaluate_production_readiness(FakeApp())
    assert r["ok"] is False
    joined = " ".join(r["violations"])
    assert "REDACT_PII" in joined
    assert "LOG_FORMAT" in joined
    assert "SecurityHeadersMiddleware" in joined
    assert "TrusteeAuditMiddleware" in joined


def test_readiness_ok_when_logging_and_middleware_present(monkeypatch):
    from services.production_readiness import evaluate_production_readiness, REQUIRED_MIDDLEWARE

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("REDACT_PII", "1")
    monkeypatch.setenv("LOG_FORMAT", "json")

    class MW:
        def __init__(self, name):
            self.cls = type(name, (), {})

    class FakeApp:
        user_middleware = [MW(n) for n in REQUIRED_MIDDLEWARE]

    r = evaluate_production_readiness(FakeApp())
    assert r["ok"] is True
    assert r["violations"] == []


def test_readiness_inert_on_preview(monkeypatch):
    from services.production_readiness import evaluate_production_readiness, scheduler_violations

    for k in ("ENVIRONMENT", "APP_ENV", "CARRYON_ENV", "DEPLOY_ENV", "NODE_ENV", "RAILWAY_ENVIRONMENT", "VERCEL_ENV"):
        monkeypatch.delenv(k, raising=False)

    class FakeApp:
        user_middleware = []

    r = evaluate_production_readiness(FakeApp())
    assert r["ok"] is True
    assert r["violations"] == []
    assert scheduler_violations() == []


# ── #2 operator least-privilege scope mapping ────────────────────────────────


def test_derive_operator_scopes_mapping():
    from guards import derive_operator_scopes

    assert derive_operator_scopes({"role": "operator", "operator_role": "manager"}) == ["ops_manager"]
    assert derive_operator_scopes({"role": "operator", "operator_role": "worker"}) == ["ops_team"]
    assert derive_operator_scopes({"role": "operator"}) == ["ops_team"]
    assert derive_operator_scopes({"role": "admin"}) == []
    assert derive_operator_scopes({"role": "benefactor"}) == []


# ── #6 deletion finality — LocalStorage prefix purge ─────────────────────────


def test_local_storage_purge_prefix():
    from services.storage import LocalStorage

    with tempfile.TemporaryDirectory() as tmp:
        st = LocalStorage(base_path=tmp)

        async def _run():
            eid = "estate-xyz"
            await st.upload(b"doc-blob", eid, "doc1")
            await st.upload(b"vid-blob", eid, "vid1")
            await st.upload_raw(b"photo", f"photos/estates/{eid}/p.jpg")
            # An unrelated estate must survive.
            await st.upload(b"other", "estate-other", "doc2")

            removed = await st.purge_prefix(f"estates/{eid}/")
            assert removed == 2
            assert await st.exists(f"estates/{eid}/doc1") is False
            assert await st.exists(f"estates/{eid}/vid1") is False
            # Unrelated estate untouched.
            assert await st.exists("estates/estate-other/doc2") is True
            # Photos prefix purges independently.
            removed_photos = await st.purge_prefix(f"photos/estates/{eid}/")
            assert removed_photos == 1
            # Purging a non-existent prefix is a safe no-op.
            assert await st.purge_prefix("estates/does-not-exist/") == 0

        asyncio.run(_run())


# ── #7 ffmpeg-check is admin-gated + prod-disabled (static source guard) ──────


def test_ffmpeg_check_guarded_in_source():
    path = os.path.join(os.path.dirname(__file__), "..", "..", "routes", "downloads.py")
    with open(os.path.abspath(path)) as f:
        src = f.read()
    # admin dependency on the diagnostic endpoint
    assert "async def ffmpeg_check(current_user: dict = Depends(require_admin))" in src
    # 404 in production
    assert "if is_production():" in src
    # operator bypass removed from CCP/readiness/card download handlers
    assert '("admin", "operator")' not in src
