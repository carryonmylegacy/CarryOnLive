"""Regression — Site Copy overrides (Admin → Marketing → Site Copy).

Founder-editable public-site text. Unit-tests the sanitiser/key rules and,
when the API is reachable (REACT_APP_BACKEND_URL), round-trips an override
through PUT /api/admin/site-copy → GET /api/public/site-copy → reset.
"""

import asyncio
import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
FOUNDER = {"email": "founder@carryon.us", "password": "CarryOntheWisdom!", "force_login": True}
BENEFACTOR = {"email": "info@carryon.us", "password": "Demo1234!", "force_login": True}
PROBE_KEY = "qa.site_copy.probe"


def _run(coro):
    """In-process motor client binds to one loop — share it across tests (asyncio.run would close it)."""
    if not hasattr(_run, "loop"):
        _run.loop = asyncio.new_event_loop()
    return _run.loop.run_until_complete(coro)


def test_clean_copy_value_is_plain_text():
    from routes.site_copy import clean_copy_value

    assert clean_copy_value("  Hello\r\nworld\r\n ") == "Hello\nworld"
    assert clean_copy_value("a\u200bb\x07c") == "abc"  # zero-width + BEL stripped
    assert clean_copy_value("tab\tkept") == "tab\tkept"
    assert clean_copy_value("<b>not html</b>") == "<b>not html</b>"  # stored verbatim, rendered as text


@pytest.mark.parametrize(
    "key", ["home.hero.h1a", "home.tools.mm.title", "nav.start", "footer.winddown", "home.faq.1.q"]
)
def test_validate_key_accepts_registry_shape(key):
    from routes.site_copy import validate_key

    assert validate_key(key) == key


@pytest.mark.parametrize("key", ["", "home", "Home.hero", "home..x", "home.hero x", "$ne", "a" * 130, "home/hero"])
def test_validate_key_rejects_garbage(key):
    from fastapi import HTTPException

    from routes.site_copy import validate_key

    with pytest.raises(HTTPException) as e:
        validate_key(key)
    assert e.value.status_code == 400


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, r.text
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def founder_headers():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    return _login(FOUNDER)


@pytest.fixture(scope="module", autouse=True)
def _cleanup_probe(founder_headers):
    yield
    requests.put(
        f"{BASE_URL}/api/admin/site-copy", json={"changes": {PROBE_KEY: None}}, headers=founder_headers, timeout=20
    )


def test_public_endpoint_is_open_and_shaped():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    r = requests.get(f"{BASE_URL}/api/public/site-copy", timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["overrides"], dict)
    assert "updated_at" in body


def test_override_round_trip_and_reset(founder_headers):
    r = requests.put(
        f"{BASE_URL}/api/admin/site-copy",
        json={"changes": {PROBE_KEY: "  Probe text\r\nline two  "}},
        headers=founder_headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    assert r.json()["overrides"][PROBE_KEY] == "Probe text\nline two"

    pub = requests.get(f"{BASE_URL}/api/public/site-copy", timeout=20).json()
    assert pub["overrides"][PROBE_KEY] == "Probe text\nline two"
    assert pub["updated_at"]

    r = requests.put(
        f"{BASE_URL}/api/admin/site-copy", json={"changes": {PROBE_KEY: ""}}, headers=founder_headers, timeout=20
    )
    assert r.status_code == 200
    assert PROBE_KEY not in r.json()["overrides"]
    assert PROBE_KEY not in requests.get(f"{BASE_URL}/api/public/site-copy", timeout=20).json()["overrides"]


def test_rejects_bad_key_and_oversize(founder_headers):
    r = requests.put(
        f"{BASE_URL}/api/admin/site-copy", json={"changes": {"$where": "x"}}, headers=founder_headers, timeout=20
    )
    assert r.status_code == 400
    r = requests.put(
        f"{BASE_URL}/api/admin/site-copy",
        json={"changes": {PROBE_KEY: "x" * 5001}},
        headers=founder_headers,
        timeout=20,
    )
    assert r.status_code == 400


def test_non_admin_cannot_write():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not set")
    r = requests.put(f"{BASE_URL}/api/admin/site-copy", json={"changes": {PROBE_KEY: "nope"}}, timeout=20)
    assert r.status_code in (401, 403)
    r = requests.put(
        f"{BASE_URL}/api/admin/site-copy", json={"changes": {PROBE_KEY: "nope"}}, headers=_login(BENEFACTOR), timeout=20
    )
    assert r.status_code == 403


def test_history_records_before_after_and_actor(founder_headers):
    requests.put(
        f"{BASE_URL}/api/admin/site-copy",
        json={"changes": {PROBE_KEY: "version one"}},
        headers=founder_headers,
        timeout=20,
    )
    requests.put(
        f"{BASE_URL}/api/admin/site-copy",
        json={"changes": {PROBE_KEY: "version two"}},
        headers=founder_headers,
        timeout=20,
    )
    # unchanged value must not create a history row
    requests.put(
        f"{BASE_URL}/api/admin/site-copy",
        json={"changes": {PROBE_KEY: "version two"}},
        headers=founder_headers,
        timeout=20,
    )
    requests.put(
        f"{BASE_URL}/api/admin/site-copy", json={"changes": {PROBE_KEY: None}}, headers=founder_headers, timeout=20
    )

    r = requests.get(
        f"{BASE_URL}/api/admin/site-copy/history",
        params={"key": PROBE_KEY, "limit": 10},
        headers=founder_headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    pairs = [(i["previous"], i["next"]) for i in items[:3]]
    assert pairs == [("version two", ""), ("version one", "version two"), ("", "version one")]
    assert all(i["actor_email"] == FOUNDER["email"] and i["at"] and i["id"] for i in items[:3])

    # restore = PUT the previous text back
    r = requests.put(
        f"{BASE_URL}/api/admin/site-copy",
        json={"changes": {PROBE_KEY: items[1]["previous"]}},
        headers=founder_headers,
        timeout=20,
    )
    assert r.json()["overrides"][PROBE_KEY] == "version one"


def test_history_is_admin_only_and_validates_key(founder_headers):
    assert requests.get(f"{BASE_URL}/api/admin/site-copy/history", timeout=20).status_code in (401, 403)
    assert (
        requests.get(f"{BASE_URL}/api/admin/site-copy/history", headers=_login(BENEFACTOR), timeout=20).status_code
        == 403
    )
    assert (
        requests.get(
            f"{BASE_URL}/api/admin/site-copy/history", params={"key": "$ne"}, headers=founder_headers, timeout=20
        ).status_code
        == 400
    )
    r = requests.get(
        f"{BASE_URL}/api/admin/site-copy/history", params={"limit": 5}, headers=founder_headers, timeout=20
    )
    assert r.status_code == 200 and len(r.json()["items"]) <= 5


# ── Phase 3: schedules + review ─────────────────────────────────────────────────


def _purge_probe_schedules(headers):
    items = requests.get(f"{BASE_URL}/api/admin/site-copy/schedules", headers=headers, timeout=20).json()["items"]
    for s in items:
        if s["key"] == PROBE_KEY:
            requests.delete(f"{BASE_URL}/api/admin/site-copy/schedules/{s['id']}", headers=headers, timeout=20)


def test_schedule_goes_live_and_reverts(founder_headers):
    from datetime import datetime, timedelta, timezone

    _purge_probe_schedules(founder_headers)
    now = datetime.now(timezone.utc)
    requests.put(
        f"{BASE_URL}/api/admin/site-copy",
        json={"changes": {PROBE_KEY: "saved text"}},
        headers=founder_headers,
        timeout=20,
    )
    # upcoming → not live yet
    r = requests.post(
        f"{BASE_URL}/api/admin/site-copy/schedules",
        json={
            "key": PROBE_KEY,
            "value": "future text",
            "start_at": (now + timedelta(days=1)).isoformat(),
            "end_at": None,
            "note": "qa",
        },
        headers=founder_headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    upcoming = [s for s in r.json()["items"] if s["key"] == PROBE_KEY]
    assert upcoming and upcoming[0]["status"] == "upcoming"
    assert requests.get(f"{BASE_URL}/api/public/site-copy", timeout=20).json()["overrides"][PROBE_KEY] == "saved text"
    # active window → public shows the scheduled text, editor state keeps the saved text
    r = requests.post(
        f"{BASE_URL}/api/admin/site-copy/schedules",
        json={
            "key": PROBE_KEY,
            "value": "live text",
            "start_at": (now - timedelta(minutes=5)).isoformat(),
            "end_at": (now + timedelta(hours=1)).isoformat(),
        },
        headers=founder_headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    active = [s for s in r.json()["items"] if s["key"] == PROBE_KEY and s["status"] == "active"]
    assert len(active) == 1
    assert requests.get(f"{BASE_URL}/api/public/site-copy", timeout=20).json()["overrides"][PROBE_KEY] == "live text"
    state = requests.get(f"{BASE_URL}/api/admin/site-copy/state", headers=founder_headers, timeout=20).json()
    assert state["overrides"][PROBE_KEY] == "saved text" and state["effective"][PROBE_KEY] == "live text"
    # remove the live one → saved text is back
    r = requests.delete(
        f"{BASE_URL}/api/admin/site-copy/schedules/{active[0]['id']}", headers=founder_headers, timeout=20
    )
    assert r.status_code == 200
    assert requests.get(f"{BASE_URL}/api/public/site-copy", timeout=20).json()["overrides"][PROBE_KEY] == "saved text"
    _purge_probe_schedules(founder_headers)
    assert (
        requests.delete(
            f"{BASE_URL}/api/admin/site-copy/schedules/{active[0]['id']}", headers=founder_headers, timeout=20
        ).status_code
        == 404
    )


def test_schedule_validation_and_scope(founder_headers):
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    bad = [
        {"key": PROBE_KEY, "value": "x", "start_at": "not-a-date"},
        {"key": PROBE_KEY, "value": "x", "start_at": now.isoformat(), "end_at": (now - timedelta(hours=1)).isoformat()},
        {
            "key": PROBE_KEY,
            "value": "x",
            "start_at": (now - timedelta(days=2)).isoformat(),
            "end_at": (now - timedelta(days=1)).isoformat(),
        },
        {"key": "$where", "value": "x", "start_at": now.isoformat()},
    ]
    for payload in bad:
        assert (
            requests.post(
                f"{BASE_URL}/api/admin/site-copy/schedules", json=payload, headers=founder_headers, timeout=20
            ).status_code
            == 400
        ), payload
    assert requests.get(f"{BASE_URL}/api/admin/site-copy/schedules", timeout=20).status_code in (401, 403)
    assert (
        requests.get(f"{BASE_URL}/api/admin/site-copy/schedules", headers=_login(BENEFACTOR), timeout=20).status_code
        == 403
    )
    assert (
        requests.get(f"{BASE_URL}/api/admin/site-copy/state", headers=_login(BENEFACTOR), timeout=20).status_code == 403
    )


def test_review_flags_deterministic_issues(founder_headers):
    from routes.site_copy import ReviewField, deterministic_issues

    types = {i["type"] for i in deterministic_issues(ReviewField(key="home.hero.title", text="Hello  world **bold"))}
    assert {"spacing", "markup"} <= types
    seo = deterministic_issues(ReviewField(key="home.seo.title", text="x" * 61))
    assert any(i["type"] == "seo" for i in seo)
    missing = deterministic_issues(
        ReviewField(key="signup.step_counter", text="Step {n}", required_vars=["n", "total"])
    )
    assert [i["type"] for i in missing] == ["placeholder"]
    assert deterministic_issues(ReviewField(key="home.hero.title", text="Clean sentence.")) == []

    r = requests.post(
        f"{BASE_URL}/api/admin/site-copy/review",
        json={"fields": [{"key": PROBE_KEY, "label": "Probe", "text": "Two  spaces here.", "required_vars": []}]},
        headers=founder_headers,
        timeout=90,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["reviewed"] == 1 and "llm_used" in body
    spacing = [i for i in body["issues"] if i["type"] == "spacing"]
    assert spacing and spacing[0]["fix"] == "Two spaces here."
    assert (
        requests.post(
            f"{BASE_URL}/api/admin/site-copy/review", json={"fields": []}, headers=_login(BENEFACTOR), timeout=20
        ).status_code
        == 403
    )
    assert (
        requests.post(
            f"{BASE_URL}/api/admin/site-copy/review",
            json={"fields": [{"key": "$bad", "text": "x"}]},
            headers=founder_headers,
            timeout=20,
        ).status_code
        == 400
    )


# ── Drafts, copy alerts, guides launch ───────────────────────────────────────────


def test_draft_lifecycle_publishes_in_one_press(founder_headers):
    base = f"{BASE_URL}/api/admin/site-copy/drafts"
    for d in requests.get(base, headers=founder_headers, timeout=20).json()["items"]:
        if d["name"].startswith("QA draft"):
            requests.delete(f"{base}/{d['id']}", headers=founder_headers, timeout=20)
    requests.put(
        f"{BASE_URL}/api/admin/site-copy", json={"changes": {PROBE_KEY: None}}, headers=founder_headers, timeout=20
    )

    assert (
        requests.post(base, json={"name": "QA draft", "changes": {}}, headers=founder_headers, timeout=20).status_code
        == 400
    )
    assert (
        requests.post(
            base, json={"name": "  ", "changes": {PROBE_KEY: "x"}}, headers=founder_headers, timeout=20
        ).status_code
        == 400
    )
    r = requests.post(
        base,
        json={"name": "QA draft one", "changes": {PROBE_KEY: "drafted text", "home.hero.title": "Draft headline"}},
        headers=founder_headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    draft_id = r.json()["id"]
    mine = [d for d in r.json()["items"] if d["id"] == draft_id][0]
    assert mine["count"] == 2 and mine["name"] == "QA draft one" and mine["created_by"] == FOUNDER["email"]
    # nothing is live yet
    assert PROBE_KEY not in requests.get(f"{BASE_URL}/api/public/site-copy", timeout=20).json()["overrides"]
    # state carries drafts for the editor
    state = requests.get(f"{BASE_URL}/api/admin/site-copy/state", headers=founder_headers, timeout=20).json()
    assert any(d["id"] == draft_id for d in state["drafts"]) and "alerts_enabled" in state
    # update: rename + narrow to one field
    r = requests.put(
        f"{base}/{draft_id}",
        json={"name": "QA draft two", "changes": {PROBE_KEY: "published from draft"}},
        headers=founder_headers,
        timeout=20,
    )
    assert r.status_code == 200 and [d for d in r.json()["items"] if d["id"] == draft_id][0]["count"] == 1
    assert (
        requests.put(
            f"{base}/missing", json={"name": "x", "changes": {PROBE_KEY: "x"}}, headers=founder_headers, timeout=20
        ).status_code
        == 404
    )
    # publish → live, history carries the draft name, draft gone
    r = requests.post(f"{base}/{draft_id}/publish", json={}, headers=founder_headers, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["overrides"][PROBE_KEY] == "published from draft"
    assert not any(d["id"] == draft_id for d in r.json()["items"])
    assert (
        requests.get(f"{BASE_URL}/api/public/site-copy", timeout=20).json()["overrides"][PROBE_KEY]
        == "published from draft"
    )
    hist = requests.get(
        f"{BASE_URL}/api/admin/site-copy/history?key={PROBE_KEY}&limit=5", headers=founder_headers, timeout=20
    ).json()["items"]
    assert hist and hist[0]["via"] == "QA draft two" and hist[0]["next"] == "published from draft"
    assert requests.post(f"{base}/{draft_id}/publish", json={}, headers=founder_headers, timeout=20).status_code == 404
    # delete path + scope
    r = requests.post(
        base, json={"name": "QA draft three", "changes": {PROBE_KEY: "y"}}, headers=founder_headers, timeout=20
    )
    did = r.json()["id"]
    assert requests.delete(f"{base}/{did}", headers=founder_headers, timeout=20).status_code == 200
    assert requests.delete(f"{base}/{did}", headers=founder_headers, timeout=20).status_code == 404
    assert requests.get(base, headers=_login(BENEFACTOR), timeout=20).status_code == 403
    requests.put(
        f"{BASE_URL}/api/admin/site-copy", json={"changes": {PROBE_KEY: None}}, headers=founder_headers, timeout=20
    )


def test_copy_alerts_toggle_and_email_builder(founder_headers):
    url = f"{BASE_URL}/api/admin/site-copy/alerts"
    original = requests.get(url, headers=founder_headers, timeout=20).json()["enabled"]
    assert requests.put(url, json={"enabled": False}, headers=founder_headers, timeout=20).json()["enabled"] is False
    assert requests.get(url, headers=founder_headers, timeout=20).json()["enabled"] is False
    assert (
        requests.put(url, json={"enabled": original}, headers=founder_headers, timeout=20).json()["enabled"] is original
    )
    assert requests.get(url, headers=_login(BENEFACTOR), timeout=20).status_code == 403

    from services.site_copy_alerts import build_alert_email

    sched = {
        "key": "signup.hero.h1b",
        "value": "Holiday headline",
        "before_text": "Get your family ready.",
        "start_at": "2026-12-24T14:00:00+00:00",
        "end_at": "2026-12-26T14:00:00+00:00",
        "page_path": "/signup",
        "page_label": "Sign-up wizard",
        "field_label": "Left panel › Headline line 2",
        "note": "Christmas",
    }
    subject, html = build_alert_email(sched, "live", "Get your family ready.")
    assert subject == "Site copy went live: Left panel › Headline line 2"
    assert (
        "https://www.carryon.us/signup" in html
        and "Holiday headline" in html
        and "Get your family ready." in html
        and "Christmas" in html
    )
    subject, html = build_alert_email(sched, "revert", "")
    assert subject.startswith("Site copy reverted") and "(built-in default)" in html


def test_alert_scheduler_claims_each_schedule_once(founder_headers):
    from datetime import datetime, timedelta, timezone

    from services import site_copy_alerts as alerts

    _purge_probe_schedules(founder_headers)
    now = datetime.now(timezone.utc)
    r = requests.post(
        f"{BASE_URL}/api/admin/site-copy/schedules",
        json={
            "key": PROBE_KEY,
            "value": "alert probe",
            "start_at": (now - timedelta(minutes=1)).isoformat(),
            "end_at": (now + timedelta(hours=1)).isoformat(),
            "page_path": "/",
            "page_label": "Home",
            "field_label": "Probe",
            "before_text": "before",
        },
        headers=founder_headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    sid = [s for s in r.json()["items"] if s["key"] == PROBE_KEY][0]["id"]
    sent = []

    async def fake_send(schedule, kind):
        sent.append((schedule["_id"], kind))

    async def run_twice():
        return await alerts.process_due_alerts(), await alerts.process_due_alerts()

    real = alerts._send_alert
    alerts._send_alert = fake_send
    try:
        first, second = _run(run_twice())
    finally:
        alerts._send_alert = real
    assert first >= 1 and sent.count((sid, "live")) == 1 and second == 0
    items = requests.get(f"{BASE_URL}/api/admin/site-copy/schedules", headers=founder_headers, timeout=20).json()[
        "items"
    ]
    mine = [s for s in items if s["id"] == sid][0]
    assert mine["live_alert_at"] and not mine["revert_alert_at"]
    _purge_probe_schedules(founder_headers)


def test_guides_launch_switch(founder_headers):
    pub = f"{BASE_URL}/api/public/guides/status"
    adm = f"{BASE_URL}/api/admin/guides/launch"
    before = requests.get(pub, timeout=20).json()
    assert set(before) == {"launched", "launched_at"}
    assert requests.put(adm, json={"launched": True}, headers=_login(BENEFACTOR), timeout=20).status_code == 403
    on = requests.put(adm, json={"launched": True}, headers=founder_headers, timeout=20).json()
    assert on["launched"] is True and on["launched_at"]
    assert requests.get(pub, timeout=20).json()["launched"] is True
    flags = requests.get(f"{BASE_URL}/api/public/site-copy", timeout=20).json()["flags"]
    assert flags["guides_launched"] is True and flags["guides_launched_at"] == on["launched_at"]
    off = requests.put(adm, json={"launched": False}, headers=founder_headers, timeout=20).json()
    assert off["launched"] is False
    assert requests.get(f"{BASE_URL}/api/public/site-copy", timeout=20).json()["flags"]["guides_launched"] is False
    if before["launched"]:
        requests.put(adm, json={"launched": True}, headers=founder_headers, timeout=20)


# ── Legal-tone review, scheduled draft publish, guide share cards ───────────────


def test_review_legal_tone_phrase_check(founder_headers):
    from routes.site_copy import ReviewField, legal_phrase_issues

    text = "Only the signed original counts in most states. You must file the will within 30 days. Always sign in front of a notary."
    hits = legal_phrase_issues(ReviewField(key="guides.x.s1.body", text=text))
    assert [h["type"] for h in hits] == ["legal", "legal"]
    assert "You must file the will within 30 days." in hits[0]["message"]
    assert (
        legal_phrase_issues(
            ReviewField(
                key="guides.x.s1.body",
                text="Many families keep the original in a fireproof box; an attorney can confirm what your state expects.",
            )
        )
        == []
    )

    r = requests.post(
        f"{BASE_URL}/api/admin/site-copy/review",
        json={
            "fields": [{"key": "guides.x.s1.body", "label": "Body", "text": text, "required_vars": []}],
            "legal": True,
        },
        headers=founder_headers,
        timeout=120,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["legal"] is True
    legal = [i for i in body["issues"] if i["type"] == "legal"]
    assert any("You must file the will" in i["message"] for i in legal)
    # without the flag nothing legal is reported
    r = requests.post(
        f"{BASE_URL}/api/admin/site-copy/review",
        json={"fields": [{"key": "guides.x.s1.body", "label": "Body", "text": text, "required_vars": []}]},
        headers=founder_headers,
        timeout=120,
    )
    assert r.status_code == 200 and not [i for i in r.json()["issues"] if i["type"] == "legal"]


def test_draft_schedule_and_self_publish(founder_headers):
    import time as _time
    from datetime import datetime, timedelta, timezone

    from services import site_copy_alerts as alerts

    base = f"{BASE_URL}/api/admin/site-copy/drafts"
    requests.put(
        f"{BASE_URL}/api/admin/site-copy", json={"changes": {PROBE_KEY: None}}, headers=founder_headers, timeout=20
    )
    r = requests.post(
        base,
        json={"name": "QA scheduled draft", "changes": {PROBE_KEY: "published on schedule"}},
        headers=founder_headers,
        timeout=20,
    )
    did = r.json()["id"]
    now = datetime.now(timezone.utc)
    sched = f"{base}/{did}/schedule"
    assert requests.put(sched, json={"publish_at": "bad"}, headers=founder_headers, timeout=20).status_code == 400
    assert (
        requests.put(
            sched, json={"publish_at": (now - timedelta(minutes=1)).isoformat()}, headers=founder_headers, timeout=20
        ).status_code
        == 400
    )
    assert (
        requests.put(
            f"{base}/missing/schedule", json={"publish_at": None}, headers=founder_headers, timeout=20
        ).status_code
        == 404
    )
    assert requests.put(sched, json={"publish_at": None}, headers=_login(BENEFACTOR), timeout=20).status_code == 403
    # timestamps are taken right before each request — the bcrypt login above can take >1 s
    soon = lambda: (datetime.now(timezone.utc) + timedelta(seconds=6)).isoformat()  # noqa: E731
    r = requests.put(
        sched,
        json={
            "publish_at": soon(),
            "pages": [{"path": "/", "label": "Homepage"}],
            "field_labels": {PROBE_KEY: "Homepage › QA › Probe"},
        },
        headers=founder_headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    mine = [d for d in r.json()["items"] if d["id"] == did][0]
    assert mine["publish_at"] and mine["scheduled_by"] == FOUNDER["email"]
    # cancel → publish_at cleared; re-schedule
    r = requests.put(sched, json={"publish_at": None}, headers=founder_headers, timeout=20)
    assert [d for d in r.json()["items"] if d["id"] == did][0]["publish_at"] is None
    r = requests.put(
        sched,
        json={"publish_at": soon(), "pages": [{"path": "/", "label": "Homepage"}]},
        headers=founder_headers,
        timeout=20,
    )
    assert r.status_code == 200, r.text
    _time.sleep(7)

    sent = []

    async def fake_send(to, subject, html):
        sent.append((to, subject, html))
        return True

    async def run():
        alerts_enabled = await alerts.alerts_enabled()
        return alerts_enabled, await alerts.publish_due_drafts(), await alerts.publish_due_drafts()

    import services.email as email_mod

    real = email_mod.send_email
    email_mod.send_email = fake_send
    # the live 60-second loop may beat us to it — either way the draft must publish exactly once
    already = not any(d["id"] == did for d in requests.get(base, headers=founder_headers, timeout=20).json()["items"])
    try:
        enabled, first, second = _run(run())
    finally:
        email_mod.send_email = real
    assert (first >= 1 or already) and second == 0
    assert (
        requests.get(f"{BASE_URL}/api/public/site-copy", timeout=20).json()["overrides"][PROBE_KEY]
        == "published on schedule"
    )
    assert not any(d["id"] == did for d in requests.get(base, headers=founder_headers, timeout=20).json()["items"])
    hist = requests.get(
        f"{BASE_URL}/api/admin/site-copy/history?key={PROBE_KEY}&limit=3", headers=founder_headers, timeout=20
    ).json()["items"]
    assert hist[0]["via"] == "QA scheduled draft" and hist[0]["actor_email"] == FOUNDER["email"]
    if enabled and not already:
        assert (
            sent
            and sent[0][1] == "Draft published: QA scheduled draft"
            and "published on schedule" in sent[0][2]
            and "https://www.carryon.us/" in sent[0][2]
        )
    requests.put(
        f"{BASE_URL}/api/admin/site-copy", json={"changes": {PROBE_KEY: None}}, headers=founder_headers, timeout=20
    )


def test_guide_share_card(founder_headers):
    slug = "the-first-72-hours-after-a-death"
    r = requests.get(f"{BASE_URL}/api/public/guides/{slug}/card.png", timeout=30)
    assert r.status_code == 200 and r.headers["content-type"] == "image/png" and r.content[:8] == b"\x89PNG\r\n\x1a\n"
    original = r.content
    assert requests.get(f"{BASE_URL}/api/public/guides/not-a-guide/card.png", timeout=20).status_code == 404
    # a Site Copy title override changes the card
    key = f"guides.{slug}.title"
    requests.put(
        f"{BASE_URL}/api/admin/site-copy",
        json={"changes": {key: "QA card title override"}},
        headers=founder_headers,
        timeout=20,
    )
    try:
        r2 = requests.get(f"{BASE_URL}/api/public/guides/{slug}/card.png", timeout=30)
        assert r2.status_code == 200 and r2.content != original
    finally:
        requests.put(
            f"{BASE_URL}/api/admin/site-copy", json={"changes": {key: None}}, headers=founder_headers, timeout=20
        )
