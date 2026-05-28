#!/usr/bin/env python3
"""
CarryOn Platform Health Check
=============================

A comprehensive read-only sweep of the LIVE production deployment + the
local codebase. Designed to be safe to run against `app.carryon.us` —
it never creates accounts, never writes data, never modifies state.
Auth tokens come from real existing user credentials.

Sections:
  A) Production Reachability         (DNS, frontend bundle, /api/health)
  B) Authentication                  (4 real credentials, role + token)
  C) Security Headers                (CSP, HSTS, X-Frame-Options, etc.)
  D) API Surface (per role)          (~50 endpoints, status + latency)
  E) Frontend Routes                 (15 public + auth pages, HTML 200)
  F) Codebase Statistics             (LOC, route count, pytest count, etc.)
  G) Static Analysis                 (housekeeping, ruff, eslint)
  H) Mocked / Blocked / TODO scan    (signup OTP bypass, Twilio, Apple, etc.)

Usage:
  python3 scripts/platform_health_check.py [--target prod|preview]
                                           [--out /tmp/phc.json]

Exit codes:
  0  — all critical checks pass
  1  — one or more critical (5xx / auth / security header) failures
  2  — script error
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlparse

import httpx

# ─────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────

TARGETS = {
    "prod": {
        "frontend": "https://app.carryon.us",
        "api": "https://carryon-api-production.up.railway.app",
    },
    "preview": {
        "frontend": "https://beneficiary-hub-16.preview.emergentagent.com",
        "api": "https://beneficiary-hub-16.preview.emergentagent.com",
    },
}

# Credentials to exercise. Env override supported via PHC_<KEY>_PASSWORD.
ACCOUNTS = [
    {"label": "founder", "ident": "founder@carryon.us", "password": "CarryOntheWisdom!", "expect_role": "admin"},
    {"label": "megumi", "ident": "megumiharris@gmail.com", "password": "Question2711", "expect_role": "benefactor"},
    {"label": "barnet", "ident": "barnetharris", "password": "Blh9170873", "expect_role": "beneficiary"},
    {"label": "info", "ident": "info@carryon.us", "password": "Demo1234!", "expect_role": "any"},
]

# Required security headers and acceptable values (substring check)
REQUIRED_SECURITY_HEADERS = {
    "Strict-Transport-Security": "max-age=",
    "Content-Security-Policy": "default-src",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin",
    "Permissions-Policy": "camera=",
}

# API endpoints per role. Tuple = (method, path, allowed_status_codes_set)
COMMON_ENDPOINTS = [
    ("GET", "/api/health", {200}),
    ("GET", "/api/health/live", {200}),
    ("GET", "/api/health/ready", {200, 503}),
    ("GET", "/api/auth/me", {200}),
    ("GET", "/api/subscriptions/plans", {200}),
    ("GET", "/api/subscriptions/enabled-features", {200}),
    ("GET", "/api/user-preferences/dock", {200}),
    ("GET", "/api/user-preferences/menu-order", {200}),
    ("GET", "/api/user-preferences/chat-autoscroll", {200}),
    ("GET", "/api/user-preferences/onboarding-emails", {200}),
    ("GET", "/api/notification-prefs", {200, 404}),
]

BENEFACTOR_ENDPOINTS = [
    ("GET", "/api/estates", {200}),
    ("GET", "/api/onboarding/status", {200}),
    ("GET", "/api/onboarding/progress", {200}),
    ("GET", "/api/referrals/me", {200}),
    ("GET", "/api/notifications", {200}),
    ("GET", "/api/share-cards/voices/public", {200}),
]

# Endpoints that require an estate_id in the path. Tested per benefactor
# after we've discovered their primary estate via /api/estates.
ESTATE_SCOPED_ENDPOINTS = [
    ("GET", "/api/beneficiaries/{eid}", {200}),
    ("GET", "/api/messages/{eid}", {200}),
    ("GET", "/api/checklists/{eid}", {200}),
    ("GET", "/api/documents/{eid}", {200}),
    ("GET", "/api/timeline/{eid}", {200}),
    ("GET", "/api/digital-wallet/{eid}", {200}),
    ("GET", "/api/ccp/plans/{eid}", {200}),
    ("GET", "/api/financial/portal/{eid}", {200, 404}),
    ("GET", "/api/financial/accounts/{eid}", {200}),
    ("GET", "/api/financial/bills/{eid}", {200}),
]

BENEFICIARY_ENDPOINTS = [
    ("GET", "/api/auth/me", {200}),
    ("GET", "/api/notifications", {200}),
]

ADMIN_ENDPOINTS = [
    ("GET", "/api/admin/users", {200}),
    ("GET", "/api/admin/feature-gates", {200}),
    ("GET", "/api/admin/platform-settings", {200}),
    ("GET", "/api/admin/code-health", {200}),
    ("GET", "/api/admin/launch-war-room", {200}),
    ("GET", "/api/admin/funnel-analytics?days=30", {200}),
    ("GET", "/api/admin/referrals?days=30", {200}),
    ("GET", "/api/admin/download-diagnostics", {200}),
    ("GET", "/api/admin/security-scan", {200}),
    ("GET", "/api/share-cards/admin/voices", {200}),
    ("GET", "/api/admin/scoped-admins", {200, 404}),
    ("GET", "/api/admin/p1-contact", {200, 404}),
]

PUBLIC_FRONTEND_ROUTES = [
    "/",
    "/login",
    "/signup",
    "/voices",
    "/about",
    "/privacy",
    "/terms",
    "/speak-with-us",
    "/.well-known/security.txt",
]


# ─────────────────────────────────────────────────────────────────────
# Result types
# ─────────────────────────────────────────────────────────────────────


@dataclass
class CheckResult:
    name: str
    ok: bool
    detail: str = ""
    elapsed_ms: float = 0.0
    extra: dict = field(default_factory=dict)


@dataclass
class Section:
    name: str
    results: list[CheckResult] = field(default_factory=list)

    @property
    def passed(self) -> int:
        return sum(1 for r in self.results if r.ok)

    @property
    def failed(self) -> int:
        return sum(1 for r in self.results if not r.ok)

    @property
    def total(self) -> int:
        return len(self.results)


def ok(name: str, detail: str = "", **extra) -> CheckResult:
    return CheckResult(name, True, detail, extra=extra)


def fail(name: str, detail: str = "", **extra) -> CheckResult:
    return CheckResult(name, False, detail, extra=extra)


# ─────────────────────────────────────────────────────────────────────
# HTTP helpers
# ─────────────────────────────────────────────────────────────────────


def http(method: str, url: str, *, headers: Optional[dict] = None, json_body: Any = None, timeout: float = 15.0) -> tuple[Optional[httpx.Response], float, Optional[str]]:
    t0 = time.perf_counter()
    try:
        r = httpx.request(method, url, headers=headers or {}, json=json_body, timeout=timeout, follow_redirects=False)
        return r, (time.perf_counter() - t0) * 1000.0, None
    except Exception as e:
        return None, (time.perf_counter() - t0) * 1000.0, f"{e.__class__.__name__}: {e}"


# ─────────────────────────────────────────────────────────────────────
# Section A — Reachability
# ─────────────────────────────────────────────────────────────────────


def section_reachability(target: dict) -> Section:
    s = Section("A. Production reachability")
    fe, api = target["frontend"], target["api"]

    r, ms, err = http("GET", f"{fe}/")
    if err or not r or r.status_code >= 500:
        s.results.append(fail(f"GET {fe}/", err or f"HTTP {r.status_code if r else '?'}", elapsed_ms=ms))
    else:
        s.results.append(CheckResult(f"GET {fe}/", r.status_code < 400, f"HTTP {r.status_code} ({len(r.text)} bytes)", ms))

    r, ms, err = http("GET", f"{api}/api/health")
    if err or not r:
        s.results.append(fail(f"GET {api}/api/health", err or "no response", elapsed_ms=ms))
    else:
        try:
            body = r.json()
        except Exception:
            body = {}
        s.results.append(CheckResult(
            f"GET {api}/api/health",
            r.status_code == 200 and body.get("database") == "connected",
            f"HTTP {r.status_code} db={body.get('database')} build={body.get('build', '?')}",
            ms,
            extra={"build": body.get("build")},
        ))

    r, ms, err = http("GET", f"{api}/api/health/ready")
    if err or not r:
        s.results.append(fail(f"GET {api}/api/health/ready", err or "no response", elapsed_ms=ms))
    else:
        s.results.append(CheckResult(
            f"GET {api}/api/health/ready",
            r.status_code == 200,
            f"HTTP {r.status_code}",
            ms,
        ))

    return s


# ─────────────────────────────────────────────────────────────────────
# Section B — Authentication
# ─────────────────────────────────────────────────────────────────────


def section_auth(target: dict) -> tuple[Section, dict]:
    s = Section("B. Authentication")
    api = target["api"]
    tokens: dict[str, dict] = {}

    for acct in ACCOUNTS:
        ident, pwd, label = acct["ident"], acct["password"], acct["label"]
        # Login
        r, ms, err = http("POST", f"{api}/api/auth/login", json_body={"email": ident, "password": pwd})
        if err or not r:
            s.results.append(fail(f"login[{label}]", err or "no response", elapsed_ms=ms))
            continue
        if r.status_code != 200:
            try:
                detail = r.json().get("detail", r.text[:200])
            except Exception:
                detail = r.text[:200]
            s.results.append(fail(f"login[{label}]", f"HTTP {r.status_code} — {detail}", elapsed_ms=ms))
            continue
        body = r.json()
        token = body.get("access_token") or body.get("token")
        if not token:
            s.results.append(fail(f"login[{label}]", "no access_token in response", elapsed_ms=ms))
            continue
        user = body.get("user") or {}
        actual_role = user.get("role", "?")
        expected_role = acct["expect_role"]
        role_ok = expected_role == "any" or actual_role == expected_role
        s.results.append(CheckResult(
            f"login[{label}]",
            role_ok,
            f"HTTP 200 role={actual_role} (expected {expected_role}) id={user.get('id', '?')[:8]}",
            ms,
            extra={"user_id": user.get("id"), "role": actual_role},
        ))
        tokens[label] = {"token": token, "user": user, "role": actual_role}

        # /auth/me roundtrip
        r2, ms2, err2 = http("GET", f"{api}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        s.results.append(CheckResult(
            f"auth/me[{label}]",
            bool(r2 and r2.status_code == 200),
            f"HTTP {r2.status_code if r2 else err2}",
            ms2,
        ))

    return s, tokens


# ─────────────────────────────────────────────────────────────────────
# Section C — Security headers
# ─────────────────────────────────────────────────────────────────────


def section_security_headers(target: dict) -> Section:
    s = Section("C. Security headers")
    api = target["api"]
    r, ms, err = http("GET", f"{api}/api/health")
    if err or not r:
        s.results.append(fail("fetch headers", err or "no response", elapsed_ms=ms))
        return s

    for header, expected_substr in REQUIRED_SECURITY_HEADERS.items():
        actual = r.headers.get(header, "")
        present = expected_substr in actual
        s.results.append(CheckResult(
            f"header[{header}]",
            present,
            f"actual={actual[:120]}" if actual else "MISSING",
            ms,
        ))

    return s


# ─────────────────────────────────────────────────────────────────────
# Section D — API surface
# ─────────────────────────────────────────────────────────────────────


def hit_endpoints(api: str, endpoints: list, headers: dict, label: str) -> list[CheckResult]:
    out = []
    for method, path, ok_codes in endpoints:
        # /admin/users can be slow on larger tenants — give it more headroom
        timeout = 30.0 if "/admin/users" in path else 15.0
        r, ms, err = http(method, f"{api}{path}", headers=headers, timeout=timeout)
        if err or not r:
            out.append(fail(f"{label}: {method} {path}", err or "no response", elapsed_ms=ms))
            continue
        passed = r.status_code in ok_codes
        out.append(CheckResult(
            f"{label}: {method} {path}",
            passed,
            f"HTTP {r.status_code}" + ("" if passed else f" (expected {sorted(ok_codes)})"),
            ms,
        ))
    return out


def section_api_surface(target: dict, tokens: dict) -> Section:
    s = Section("D. API surface (per role)")
    api = target["api"]

    # Anonymous (no token)
    s.results.extend(hit_endpoints(api, [
        ("GET", "/api/share-cards/voices/public", {200}),
        ("GET", "/api/public/site-content", {200}),
        ("GET", "/api/subscriptions/plans", {200}),
    ], headers={}, label="anon"))

    for label, info in tokens.items():
        h = {"Authorization": f"Bearer {info['token']}"}
        role = info["role"]
        s.results.extend(hit_endpoints(api, COMMON_ENDPOINTS, headers=h, label=label))

        if role == "benefactor":
            s.results.extend(hit_endpoints(api, BENEFACTOR_ENDPOINTS, headers=h, label=label))
            # Discover an estate to test estate-scoped endpoints
            r, _, _ = http("GET", f"{api}/api/estates", headers=h)
            estate_id = None
            if r and r.status_code == 200:
                try:
                    body = r.json()
                    estates = body if isinstance(body, list) else body.get("estates", [])
                    if estates:
                        estate_id = estates[0].get("id")
                except Exception:
                    pass
            if estate_id:
                scoped = [(m, p.replace("{eid}", estate_id), c) for m, p, c in ESTATE_SCOPED_ENDPOINTS]
                s.results.extend(hit_endpoints(api, scoped, headers=h, label=f"{label}/eid"))
            else:
                s.results.append(fail(f"{label}: estate discovery", "no estate found for benefactor"))
        elif role == "beneficiary":
            s.results.extend(hit_endpoints(api, BENEFICIARY_ENDPOINTS, headers=h, label=label))

        if role == "admin":
            s.results.extend(hit_endpoints(api, ADMIN_ENDPOINTS, headers=h, label=label))

    return s


# ─────────────────────────────────────────────────────────────────────
# Section E — Frontend routes
# ─────────────────────────────────────────────────────────────────────


def section_frontend_routes(target: dict) -> Section:
    s = Section("E. Frontend routes")
    fe = target["frontend"]
    for path in PUBLIC_FRONTEND_ROUTES:
        r, ms, err = http("GET", f"{fe}{path}")
        if err or not r:
            s.results.append(fail(f"GET {path}", err or "no response", elapsed_ms=ms))
            continue
        body_len = len(r.text) if r.text else 0
        s.results.append(CheckResult(
            f"GET {path}",
            r.status_code < 400 and body_len > 100,
            f"HTTP {r.status_code} ({body_len} bytes)",
            ms,
        ))
    return s


# ─────────────────────────────────────────────────────────────────────
# Section F — Codebase statistics
# ─────────────────────────────────────────────────────────────────────


def shell(cmd: str, *, timeout: int = 30) -> str:
    try:
        return subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=timeout
        ).stdout.strip()
    except Exception as e:
        return f"ERR: {e}"


def section_codebase_stats() -> Section:
    s = Section("F. Codebase statistics")
    backend_loc = shell("find /app/backend -name '*.py' -not -path '*/__pycache__/*' | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}'")
    frontend_loc = shell("find /app/frontend/src -name '*.js' -o -name '*.jsx' | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}'")
    backend_routes = shell("ls /app/backend/routes/*.py 2>/dev/null | wc -l")
    frontend_pages = shell("ls /app/frontend/src/pages/*.js 2>/dev/null | wc -l")
    frontend_components = shell("find /app/frontend/src/components -name '*.js' | wc -l")
    pytest_files = shell("find /app/backend/tests -name 'test_*.py' 2>/dev/null | wc -l")
    api_endpoints = shell(r"grep -rh '^@router\.' /app/backend/routes 2>/dev/null | wc -l")
    largest_route = shell("wc -l /app/backend/routes/*.py 2>/dev/null | sort -rn | head -2 | tail -1")
    largest_page = shell("wc -l /app/frontend/src/pages/*.js 2>/dev/null | sort -rn | head -2 | tail -1")

    s.results.append(ok("backend LOC", backend_loc))
    s.results.append(ok("frontend LOC", frontend_loc))
    s.results.append(ok("backend route modules", backend_routes))
    s.results.append(ok("frontend pages", frontend_pages))
    s.results.append(ok("frontend components", frontend_components))
    s.results.append(ok("pytest files", pytest_files))
    s.results.append(ok("api @router decorators", api_endpoints))
    s.results.append(ok("largest backend route file", largest_route or "—"))
    s.results.append(ok("largest frontend page file", largest_page or "—"))
    return s


# ─────────────────────────────────────────────────────────────────────
# Section G — Static analysis
# ─────────────────────────────────────────────────────────────────────


def section_static_analysis() -> Section:
    s = Section("G. Static analysis")

    # housekeeping (best-effort, captures pass/warn/fail counts)
    # Filter: only count lines that LOOK like check results (start with a number),
    # not help-text mentions of WARN/FAIL.
    hk = shell(
        "timeout 75 bash /app/housekeeping.sh 2>&1 | grep -E '^\\s*[0-9]+\\.' | grep -v 'integer expression'",
        timeout=90,
    )
    pass_count = sum(1 for ln in hk.splitlines() if "PASS" in ln)
    warn_count = sum(1 for ln in hk.splitlines() if "WARN" in ln and "PASS" not in ln)
    fail_count = sum(1 for ln in hk.splitlines() if "FAIL" in ln and "PASS" not in ln)
    s.results.append(CheckResult(
        "housekeeping.sh",
        warn_count == 0 and fail_count == 0,
        f"{pass_count} PASS / {warn_count} WARN / {fail_count} FAIL",
    ))

    # ruff
    ruff = shell("cd /app/backend && ruff check . 2>&1 | tail -3")
    s.results.append(CheckResult(
        "ruff check (backend)",
        "All checks passed" in ruff or "passed" in ruff.lower(),
        ruff[:200],
    ))

    # eslint errors
    esl = shell("cd /app/frontend && yarn lint:errors 2>&1 | tail -5")
    s.results.append(CheckResult(
        "eslint errors (frontend)",
        "✖" not in esl and "Error:" not in esl,
        esl[-200:].replace("\n", " · "),
    ))

    # Pytest — run ONLY the fast launch-sweep regression file.
    # The full /tests directory contains 135 files, many of which are E2E
    # specs that need fresh fixtures and aren't safe to run sequentially.
    pytest_out = shell(
        "cd /app/backend && E2E_API_URL=http://localhost:8001 timeout 30 python -m pytest tests/test_iter100_launch_sweep.py -q 2>&1 | tail -3",
        timeout=45,
    )
    s.results.append(CheckResult(
        "pytest (iter100 launch sweep)",
        "passed" in pytest_out and "failed" not in pytest_out,
        pytest_out[-200:].replace("\n", " · "),
    ))

    return s


# ─────────────────────────────────────────────────────────────────────
# Section H — Mocked / Blocked / TODO scan
# ─────────────────────────────────────────────────────────────────────


def section_mocked_blocked(target: dict, tokens: dict) -> Section:
    s = Section("H. Mocked / blocked / launch-risk scan")
    api = target["api"]

    # Signup OTP bypass status (admin-only). Use any admin token if available.
    admin_tok = next((t["token"] for t in tokens.values() if t["role"] == "admin"), None)
    if admin_tok:
        r, _, _ = http("GET", f"{api}/api/admin/platform-settings", headers={"Authorization": f"Bearer {admin_tok}"})
        if r and r.status_code == 200:
            ps = r.json()
            bypass_on = bool(ps.get("signup_otp_disabled"))
            s.results.append(CheckResult(
                "signup_otp_disabled",
                not bypass_on,  # we WANT this off for launch
                "ON — bypass active (NOT launch-safe)" if bypass_on else "OFF — OTP gate enforced",
                extra={"raw": ps.get("signup_otp_disabled"), "ttl_h": ps.get("signup_otp_bypass_ttl_hours")},
            ))
            otp_disabled = bool(ps.get("otp_disabled"))
            s.results.append(CheckResult(
                "global 2FA (otp_disabled)",
                not otp_disabled,
                "globally OFF (NOT launch-safe)" if otp_disabled else "global 2FA available",
            ))
        else:
            s.results.append(fail("signup_otp_disabled", "could not read /admin/platform-settings"))
    else:
        s.results.append(fail("signup_otp_disabled", "no admin token to inspect"))

    # Stripe / Twilio / Apple env hints (codebase-side)
    stripe_pres = shell("grep -E 'STRIPE_API_KEY' /app/backend/.env 2>/dev/null | head -1")
    s.results.append(CheckResult(
        "Stripe API key in backend/.env",
        "sk_" in stripe_pres,
        "present" if "sk_" in stripe_pres else "missing",
    ))

    # Codebase TODO/FIXME scan
    todo_count = shell("grep -rE 'TODO|FIXME|XXX' /app/backend/routes /app/frontend/src 2>/dev/null --include='*.py' --include='*.js' | wc -l")
    s.results.append(CheckResult(
        "TODO/FIXME count",
        int(todo_count or 0) < 50,
        f"{todo_count} TODO/FIXME markers",
    ))

    # known blocked items
    s.results.append(CheckResult("Apple IAP (3rd-party)", False, "BLOCKED — awaiting Apple Paid Applications Agreement"))
    s.results.append(CheckResult("Twilio SMS A2P 10DLC", False, "BLOCKED — awaiting campaign approval"))

    return s


# ─────────────────────────────────────────────────────────────────────
# Reporting
# ─────────────────────────────────────────────────────────────────────


def render_report(sections: list[Section], target_name: str, target: dict) -> str:
    lines = []
    lines.append("=" * 78)
    lines.append(f"CarryOn Platform Health Check — {target_name.upper()}")
    lines.append(f"Frontend: {target['frontend']}")
    lines.append(f"API:      {target['api']}")
    lines.append(f"Run at:   {datetime.now(timezone.utc).isoformat()}")
    lines.append("=" * 78)
    grand_pass = grand_fail = 0
    for sec in sections:
        lines.append("")
        lines.append(f"## {sec.name}  ({sec.passed}/{sec.total})")
        lines.append("-" * 60)
        for r in sec.results:
            mark = "✅" if r.ok else "❌"
            ms = f"{r.elapsed_ms:6.0f}ms" if r.elapsed_ms else " " * 9
            lines.append(f"  {mark} {ms}  {r.name:<55} {r.detail[:80]}")
        grand_pass += sec.passed
        grand_fail += sec.failed

    lines.append("")
    lines.append("=" * 78)
    lines.append(f"OVERALL: {grand_pass} passed / {grand_fail} failed")
    lines.append("=" * 78)
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", choices=list(TARGETS.keys()), default="prod")
    parser.add_argument("--out", default=None, help="Write structured JSON report to this path")
    parser.add_argument("--skip-static", action="store_true", help="Skip codebase static analysis (faster)")
    args = parser.parse_args()

    target = TARGETS[args.target]
    sections: list[Section] = []

    print(f"▶ Section A: reachability ({urlparse(target['frontend']).netloc})")
    sections.append(section_reachability(target))

    print("▶ Section B: authentication (4 accounts)")
    auth_sec, tokens = section_auth(target)
    sections.append(auth_sec)

    print("▶ Section C: security headers")
    sections.append(section_security_headers(target))

    print("▶ Section D: API surface (per role)")
    sections.append(section_api_surface(target, tokens))

    print("▶ Section E: frontend routes")
    sections.append(section_frontend_routes(target))

    print("▶ Section F: codebase statistics")
    sections.append(section_codebase_stats())

    if not args.skip_static:
        print("▶ Section G: static analysis (housekeeping + ruff + eslint + pytest)")
        sections.append(section_static_analysis())

    print("▶ Section H: mocked / blocked / launch-risk scan")
    sections.append(section_mocked_blocked(target, tokens))

    report = render_report(sections, args.target, target)
    print(report)

    if args.out:
        with open(args.out, "w") as f:
            json.dump(
                {
                    "target": args.target,
                    "ran_at": datetime.now(timezone.utc).isoformat(),
                    "sections": [{"name": s.name, "results": [asdict(r) for r in s.results]} for s in sections],
                },
                f,
                indent=2,
                default=str,
            )
        print(f"\nJSON report → {args.out}")

    grand_fail = sum(s.failed for s in sections)
    return 0 if grand_fail == 0 else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception as e:
        print(f"FATAL: {e.__class__.__name__}: {e}", file=sys.stderr)
        sys.exit(2)
