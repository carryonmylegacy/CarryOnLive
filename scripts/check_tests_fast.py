#!/usr/bin/env python3
"""Fast pytest smoke suite gate (Task 2 of Commercial-Grade Audit).

Runs the curated "fast suite" — IDOR guards + core-endpoints smoke — in
under ~45s. This is the test set the pre-push CI hook actually executes.

Why not the whole 140-file suite?
  * The full suite takes 20-30 minutes and has rate-limit + ordering issues.
  * It's run on-demand (HK_RUN_TESTS=1 bash housekeeping.sh) and in nightly CI.
  * The fast suite is a TIGHT enterprise-style "hot path" coverage gate
    designed to catch regressions in <1 minute pre-push.

Usage:
    python scripts/check_tests_fast.py              # run + report
    python scripts/check_tests_fast.py --strict     # exit 1 on any failure
"""
from __future__ import annotations

import argparse
import subprocess
import sys

FAST_SUITE = [
    "tests/test_idor_guards.py",
    "tests/test_core_endpoints_smoke.py",
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true", help="Exit 1 on test failure")
    args = ap.parse_args()

    cmd = ["pytest", *FAST_SUITE, "-q", "--tb=short", "--no-header"]
    print(f"Running fast suite: {' '.join(FAST_SUITE)}")
    proc = subprocess.run(cmd, cwd="/app/backend")
    if proc.returncode != 0:
        print(f"\n❌ Fast suite failed (exit {proc.returncode}).")
        return 1 if args.strict else 0
    print("\n✅ Fast suite green.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
