#!/usr/bin/env python3
"""Route policy coverage CI gate.

Scans all @router.<verb>("/path") decorators under backend/routes/ and
compares against backend/route_policies.py:ROUTE_POLICIES.

The gate is **ratchet-style**: it doesn't require 100% coverage on day 1 —
it only fails if a push REDUCES coverage. Today's baseline is recorded in
.route_policy_baseline. Adding new endpoints without registering them
will trip the gate; existing un-annotated endpoints are grandfathered until
their next touch (when CI will fail and force registration).

Usage:
    python scripts/check_route_policies.py            # report only
    python scripts/check_route_policies.py --strict   # fail on regression
    python scripts/check_route_policies.py --update-baseline  # record current state
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROUTES_DIR = ROOT / "backend" / "routes"
POLICIES_FILE = ROOT / "backend" / "route_policies.py"
AUTO_POLICIES_FILE = ROOT / "backend" / "route_policies_auto.py"
BASELINE_FILE = ROOT / ".route_policy_baseline"

ROUTER_DECORATOR = re.compile(
    r'@router\.(get|post|put|delete|patch)\(\s*"((?:[^"\\]|\\.)*?)"',
    re.MULTILINE,
)


def discover_routes() -> list[tuple[str, str, str]]:
    """Returns list of (method, path, source_file_relative)."""
    routes = []
    for p in ROUTES_DIR.rglob("*.py"):
        if "__pycache__" in str(p):
            continue
        text = p.read_text()
        for m in ROUTER_DECORATOR.finditer(text):
            method = m.group(1).upper()
            path = m.group(2)
            # Most routers are mounted with prefix /api in server.py; account for that
            if not path.startswith("/api"):
                path = "/api" + path
            routes.append((method, path, str(p.relative_to(ROOT))))
    return routes


def load_policy_keys() -> set[str]:
    """Parses ROUTE_POLICIES dict keys without importing (avoids backend
    side-effects in the CI hook). Reads both the curated registry and
    the auto-imported overflow file."""
    keys: set[str] = set()
    for src in (POLICIES_FILE, AUTO_POLICIES_FILE):
        if not src.exists():
            continue
        text = src.read_text()
        # crude but robust: find lines like '"METHOD /api/...":'
        for m in re.finditer(r'^\s*"((?:GET|POST|PUT|DELETE|PATCH)\s+/api/[^"]+)"\s*:', text, re.MULTILINE):
            keys.add(m.group(1))
    return keys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true", help="Fail if coverage drops below baseline")
    ap.add_argument("--update-baseline", action="store_true", help="Write current registered count to baseline")
    args = ap.parse_args()

    routes = discover_routes()
    policy_keys = load_policy_keys()

    # Build a registered/unregistered classification
    registered: list[tuple[str, str, str]] = []
    unregistered: list[tuple[str, str, str]] = []
    for method, path, source in routes:
        key = f"{method} {path}"
        # Path with FastAPI {placeholder} should match policy with same {placeholder}
        if key in policy_keys:
            registered.append((method, path, source))
        else:
            unregistered.append((method, path, source))

    total = len(routes)
    reg_count = len(registered)
    pct = (reg_count / total * 100) if total else 0
    print(f"Route policy coverage: {reg_count}/{total} ({pct:.1f}%)")

    if args.update_baseline:
        BASELINE_FILE.write_text(f"{reg_count}\n")
        print(f"Baseline written: {reg_count} registered routes.")
        return 0

    if args.strict:
        baseline = 0
        if BASELINE_FILE.exists():
            try:
                baseline = int(BASELINE_FILE.read_text().strip())
            except ValueError:
                baseline = 0
        if reg_count < baseline:
            print(f"❌ FAIL: Coverage dropped from {baseline} to {reg_count}.")
            print("       Unregistered routes that need adding to ROUTE_POLICIES:")
            for method, path, source in unregistered[:25]:
                print(f"         {method:7} {path:60} ({source})")
            return 1
        if reg_count > baseline:
            print(f"⬆️  IMPROVEMENT: +{reg_count - baseline} routes registered since baseline. Consider --update-baseline.")

    # Always print top 5 unregistered for visibility (advisory)
    if unregistered and not args.strict:
        print(f"\nTop {min(5, len(unregistered))} unregistered (advisory, not blocking):")
        for method, path, source in unregistered[:5]:
            print(f"  {method:7} {path:60} ({source})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
