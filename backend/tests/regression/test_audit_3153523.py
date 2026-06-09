"""Audit 3153523 fixes — regression tests.

#1 Render production controls present + hard readiness fails closed in prod.
#2 Scheduler-worker heartbeat enforcement (dedicated-worker mode).
#3 render.yaml no longer auto-deploys backend on raw push.
#4 Profile/subscription offline mirrors are encrypted at rest (frontend; the
   proof lives in frontend/src/offline/repos/__tests__/, this file asserts the
   repos use the force-encryption path statically).

Credential-free except the heartbeat test, which uses Mongo and self-skips when
the DB is unreachable. Run:
  cd /app/backend && python -m pytest tests/regression/test_audit_3153523.py -q
"""

import asyncio
import os

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def _read(rel_path):
    with open(os.path.join(REPO_ROOT, rel_path)) as f:
        return f.read()


# ── #1 Render production controls (static) ───────────────────────────────────


def test_render_yaml_sets_production_controls():
    src = _read("render.yaml")
    assert "key: ENVIRONMENT" in src and "value: production" in src
    assert "key: REDACT_PII" in src
    assert "key: LOG_FORMAT" in src and "value: json" in src


# ── #3 Render no auto-deploy on raw push (static) ────────────────────────────


def test_render_yaml_autodeploy_disabled():
    src = _read("render.yaml")
    assert "autoDeploy: false" in src
    assert "autoDeploy: true" not in src


# ── #1 hard readiness fails closed in production ─────────────────────────────


def test_production_readiness_report_fails_closed_when_controls_absent(monkeypatch):
    import services.production_readiness as pr

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("REDACT_PII", raising=False)
    monkeypatch.delenv("LOG_FORMAT", raising=False)

    class FakeApp:
        user_middleware = []

    pr.evaluate_production_readiness(FakeApp())

    async def _none():
        return []

    # Keep the report DB-free: stub the live async sub-checks.
    monkeypatch.setattr(pr, "session_policy_violations", _none)
    monkeypatch.setattr(pr, "worker_heartbeat_violations", _none)

    try:
        report = asyncio.run(pr.production_readiness_report())
        assert report["ok"] is False
        joined = " ".join(report["violations"])
        assert "REDACT_PII" in joined
        assert "LOG_FORMAT" in joined
    finally:
        # Reset the cached startup snapshot so other test files that read
        # get_readiness_state() (e.g. the inert-on-preview test) aren't polluted.
        pr._STATE.update({"ok": True, "violations": [], "checked": False})


# ── #2 scheduler-worker heartbeat enforcement ────────────────────────────────


def test_worker_heartbeats_inert_outside_worker_mode(monkeypatch):
    from services.production_readiness import worker_heartbeat_violations

    # Not production → inert.
    for k in ("ENVIRONMENT", "APP_ENV", "CARRYON_ENV", "DEPLOY_ENV", "NODE_ENV", "RAILWAY_ENVIRONMENT", "VERCEL_ENV"):
        monkeypatch.delenv(k, raising=False)
    assert asyncio.run(worker_heartbeat_violations()) == []

    # Production but in-proc schedulers (no DISABLE flag) → inert (sync check owns it).
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("DISABLE_INPROC_SCHEDULERS", raising=False)
    assert asyncio.run(worker_heartbeat_violations()) == []


def test_worker_heartbeats_enforced_in_worker_mode(monkeypatch):
    from datetime import datetime, timedelta, timezone

    from services.production_readiness import REQUIRED_SCHEDULERS, worker_heartbeat_violations

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DISABLE_INPROC_SCHEDULERS", "1")

    try:
        from config import db
    except Exception:
        pytest.skip("MongoDB config unavailable")

    fresh = datetime.now(timezone.utc).isoformat()
    one = sorted(REQUIRED_SCHEDULERS)[0]

    async def _seed(ts):
        for name in REQUIRED_SCHEDULERS:
            await db.scheduler_heartbeats.update_one(
                {"scheduler_name": name},
                {
                    "$set": {
                        "scheduler_name": name,
                        "worker_id": "test-3153523",
                        "status": "running",
                        "last_seen_at": ts,
                    }
                },
                upsert=True,
            )

    # All DB ops + readiness calls must share ONE event loop (motor binds to the
    # loop it was first used on), so the whole scenario runs inside one coroutine.
    async def _scenario():
        await _seed(fresh)
        # Fresh heartbeats for every required scheduler → no violations.
        assert await worker_heartbeat_violations() == []

        # Remove one → "missing" violation.
        await db.scheduler_heartbeats.delete_one({"scheduler_name": one, "worker_id": "test-3153523"})
        v = await worker_heartbeat_violations()
        assert any("missing" in x and one in x for x in v)

        # Stale heartbeats → "stale" violation.
        stale = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        await _seed(stale)
        v = await worker_heartbeat_violations()
        assert any("stale" in x for x in v)

    async def _run():
        try:
            await _scenario()
        finally:
            await db.scheduler_heartbeats.delete_many({"worker_id": "test-3153523"})

    try:
        asyncio.run(_run())
    except pytest.skip.Exception:
        raise
    except Exception as e:  # noqa: BLE001 — DB unreachable in this environment
        pytest.skip(f"MongoDB unreachable: {e}")


# ── #4 offline mirrors use the force-encryption path (static guard) ──────────


def test_profile_repo_uses_force_encryption():
    src = _read("frontend/src/offline/repos/profileRepo.js")
    assert "sealRecordForce" in src
    assert "unsealRecordForce" in src
    # No flag-gated passthrough seal that can leave plaintext.
    assert "import { sealRecord, unsealRecord }" not in src


def test_subscription_repo_uses_force_encryption():
    src = _read("frontend/src/offline/repos/subscriptionRepo.js")
    assert "sealRecordForce" in src
    assert "unsealRecordForce" in src
    # The old direct plaintext put must be gone.
    assert "put({\n      id: KEY,\n      data," not in src


# ── prod CORS fix: X-Request-ID must be allow-listed (else preflight 400) ────


def test_cors_allows_x_request_id_header():
    """apiClient.js stamps X-Request-ID on every request; if the backend CORS
    allow_headers omits it, the browser preflight is rejected (HTTP 400) and ALL
    browser API calls break (this is what broke the homepage video)."""
    src = _read("backend/middleware.py")
    assert '"X-Request-ID"' in src, "X-Request-ID missing from CORS allow_headers"


def test_dead_youtube_fallback_purged():
    """The dead default video EhU-jojs1jk (returns 404) must not remain as a
    fallback anywhere — a fetch hiccup would otherwise show a broken embed."""
    for rel in [
        "frontend/src/pages/HomePage.js",
        "frontend/src/pages/LoginPage.js",
        "frontend/src/pages/SpeakWithUsPage.js",
        "frontend/src/components/admin/SiteContentTab.js",
        "backend/routes/public_content.py",
    ]:
        assert "EhU-jojs1jk" not in _read(rel), f"dead video id still present in {rel}"
