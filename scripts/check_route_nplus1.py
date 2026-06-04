#!/usr/bin/env python3
"""N+1 query regression guard for backend route handlers.

Catches the slowdown class we just fixed on /admin/users, /admin/grace-periods
and the Analytics signup trend: an `await db.<collection>.<query>(...)` call
issued INSIDE a `for` / `while` loop body. On a list endpoint that loops over
hundreds of users/records this becomes hundreds of sequential round-trips and
turns a sub-second response into a multi-second one.

Ratchet-style (same model as check_route_policies.py): it does NOT demand zero
N+1s on day one. Today's accepted occurrences are recorded in
``.nplus1_baseline.json``. The gate fails only when a push introduces a NEW
occurrence not already in the baseline — cheap insurance that this class of
slowdown can't silently creep back in before a pitch.

Signatures intentionally omit line numbers so they're stable across unrelated
edits: ``<relpath> | <loop header> | db.<collection>.<method>``.

Usage:
    python scripts/check_route_nplus1.py              # fail (exit 1) on NEW N+1
    python scripts/check_route_nplus1.py --update-baseline   # accept current state
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTES_DIR = ROOT / "backend" / "routes"
BASELINE_FILE = ROOT / ".nplus1_baseline.json"

LOOP_RE = re.compile(r"^(for|while|async\s+for)\b.*:\s*(#.*)?$")
# `await db.<collection>.<query-method>(` — the round-trip-per-iteration smell.
DB_CALL_RE = re.compile(r"await\s+db\.(\w+)\.(find_one|find|count_documents|aggregate|distinct)\s*\(")


def _indent(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def scan_file(path: Path) -> list[str]:
    """Return N+1 signatures found in one route file."""
    sigs: set[str] = set()
    rel = str(path.relative_to(ROOT))
    # stack of (indent, normalized loop header)
    loop_stack: list[tuple[int, str]] = []
    for raw in path.read_text().splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        ind = _indent(raw)
        # Close any loops whose body we've exited (current line dedents to/<= loop).
        while loop_stack and ind <= loop_stack[-1][0]:
            loop_stack.pop()
        if LOOP_RE.match(stripped):
            loop_stack.append((ind, " ".join(stripped.split())[:60]))
            continue
        if loop_stack:
            m = DB_CALL_RE.search(raw)
            if m:
                loop_header = loop_stack[-1][1]
                sigs.add(f"{rel} | {loop_header} | db.{m.group(1)}.{m.group(2)}")
    return sorted(sigs)


def collect() -> list[str]:
    sigs: set[str] = set()
    for p in ROUTES_DIR.rglob("*.py"):
        if "__pycache__" in str(p):
            continue
        sigs.update(scan_file(p))
    return sorted(sigs)


def load_baseline() -> set[str]:
    if not BASELINE_FILE.exists():
        return set()
    try:
        return set(json.loads(BASELINE_FILE.read_text()))
    except (ValueError, OSError):
        return set()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--update-baseline", action="store_true", help="Record current N+1 occurrences as accepted")
    args = ap.parse_args()

    current = collect()

    if args.update_baseline:
        BASELINE_FILE.write_text(json.dumps(current, indent=2) + "\n")
        print(f"Baseline written: {len(current)} accepted N+1 occurrence(s).")
        return 0

    baseline = load_baseline()
    new = [s for s in current if s not in baseline]
    if new:
        print(f"❌ {len(new)} NEW N+1 query pattern(s) introduced (await db.* inside a loop):")
        for s in new:
            print(f"     {s}")
        print("   Batch the lookup (one find({$in:[...]}) + an in-memory map), or")
        print("   if intentional, run: python scripts/check_route_nplus1.py --update-baseline")
        return 1

    fixed = len(baseline) - len([s for s in current if s in baseline])
    if fixed > 0:
        print(f"⬇️  {fixed} baselined N+1(s) removed — consider --update-baseline to tighten the gate.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
