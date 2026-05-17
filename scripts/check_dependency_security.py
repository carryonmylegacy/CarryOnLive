#!/usr/bin/env python3
"""Dependency Security CI gate (ratchet-style).

Runs `pip-audit` on the FastAPI backend and `yarn audit` on the React frontend,
counts vulnerabilities, and compares against baselines saved at
/app/.dep_security_baseline.json.

Ratchet semantics:
  * Default: report only, exit 0.
  * --strict: exit 1 if any severity count INCREASES vs baseline (i.e. a new
    vulnerable dependency was introduced).
  * --update-baseline: rewrite baseline file with current counts.

Tip for the pitch window: don't blindly upgrade flagged packages — many touch
critical paths (starlette, pymongo, litellm). The ratchet exists so the team
can fix on a maintenance schedule while still blocking *new* introductions.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

BACKEND_REQ = Path("/app/backend/requirements.txt")
FRONTEND_DIR = Path("/app/frontend")
BASELINE_FILE = Path("/app/.dep_security_baseline.json")


def run_pip_audit() -> dict:
    """Returns {'total': int, 'vulns': [{'name', 'version', 'id', 'fix_versions'}]}"""
    if not shutil.which("pip-audit"):
        return {"error": "pip-audit not installed (pip install pip-audit)", "total": 0, "vulns": []}
    try:
        proc = subprocess.run(
            ["pip-audit", "-r", str(BACKEND_REQ), "--format", "json"],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        return {"error": "pip-audit timed out", "total": 0, "vulns": []}
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {"error": f"pip-audit non-JSON output: {proc.stderr[:200]}", "total": 0, "vulns": []}
    vulns = []
    for dep in data.get("dependencies", []):
        for v in dep.get("vulns", []) or []:
            vulns.append({
                "name": dep["name"],
                "version": dep["version"],
                "id": v.get("id"),
                "fix_versions": v.get("fix_versions", []),
            })
    return {"total": len(vulns), "vulns": vulns}


def run_yarn_audit() -> dict:
    """Counts advisories by severity from `yarn audit --json` stream output."""
    counts = {"info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0}
    advisories: list[dict] = []
    if not shutil.which("yarn"):
        return {"error": "yarn not installed", "counts": counts, "total": 0, "advisories": []}
    try:
        proc = subprocess.run(
            ["yarn", "audit", "--json"],
            capture_output=True,
            text=True,
            cwd=str(FRONTEND_DIR),
            timeout=180,
        )
    except subprocess.TimeoutExpired:
        return {"error": "yarn audit timed out", "counts": counts, "total": 0, "advisories": []}
    for line in proc.stdout.splitlines():
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if obj.get("type") == "auditAdvisory":
            adv = obj["data"]["advisory"]
            sev = adv.get("severity", "info")
            counts[sev] = counts.get(sev, 0) + 1
            advisories.append({
                "id": adv.get("id"),
                "module": adv.get("module_name"),
                "severity": sev,
                "title": adv.get("title"),
                "patched": adv.get("patched_versions"),
            })
    total = sum(counts.values())
    return {"counts": counts, "total": total, "advisories": advisories}


def load_baseline() -> dict:
    if BASELINE_FILE.exists():
        try:
            return json.loads(BASELINE_FILE.read_text())
        except json.JSONDecodeError:
            return {}
    return {}


def save_baseline(payload: dict) -> None:
    BASELINE_FILE.write_text(json.dumps(payload, indent=2, sort_keys=True))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true", help="Fail if vuln counts go up vs baseline")
    ap.add_argument("--update-baseline", action="store_true", help="Record current counts as new baseline")
    ap.add_argument("--quick", action="store_true", help="Skip yarn audit (faster, backend-only)")
    args = ap.parse_args()

    print("Backend (pip-audit) ...")
    backend = run_pip_audit()
    if "error" in backend and backend.get("total", 0) == 0:
        print(f"  ⚠️  {backend['error']}")
    backend_total = backend.get("total", 0)
    print(f"  Backend vulns: {backend_total}")

    frontend_total = 0
    frontend_counts: dict = {"high": 0, "critical": 0, "moderate": 0, "low": 0, "info": 0}
    if not args.quick:
        print("Frontend (yarn audit) ...")
        frontend = run_yarn_audit()
        frontend_counts = frontend.get("counts", frontend_counts)
        frontend_total = frontend.get("total", 0)
        print(f"  Frontend vulns: {frontend_total} (high={frontend_counts.get('high', 0)}, "
              f"critical={frontend_counts.get('critical', 0)}, moderate={frontend_counts.get('moderate', 0)})")

    current = {
        "backend_total": backend_total,
        "frontend_total": frontend_total,
        "frontend_high": frontend_counts.get("high", 0),
        "frontend_critical": frontend_counts.get("critical", 0),
    }

    if args.update_baseline:
        save_baseline(current)
        print(f"\n✅ Baseline updated → {BASELINE_FILE}")
        return 0

    baseline = load_baseline()
    if not baseline:
        print("\nℹ️  No baseline recorded yet. Run with --update-baseline to set one.")
        return 0

    regressed = []
    for key, cur in current.items():
        base = baseline.get(key, 0)
        if cur > base:
            regressed.append(f"  ↑ {key}: {base} → {cur} (+{cur - base})")

    if regressed:
        print("\n❌ Dependency vulnerability regression detected:")
        for r in regressed:
            print(r)
        if args.strict:
            return 1
    else:
        print(f"\n✅ No regression vs baseline ({baseline}).")

    return 0


if __name__ == "__main__":
    sys.exit(main())
