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
    # AI Safety Contract + onboarding dual-state mutual-exclusion regression
    # (~2.5s, no LLM cost, no network — covers prompt-wrap integrity across
    # all 4 AI routes plus the skip/complete atomic swap on $set + $unset).
    # Added May 27 2026 after a fork reverification found guardian.py was
    # missing the hardened_system_prompt import — pre-push gate now catches
    # any future regression of either invariant in <5s.
    "tests/test_iter156_ai_safety_onboarding.py",
    # Static AST gates — auto-discovers every *_SYSTEM_PROMPT constant
    # under routes/ + services/ and asserts the Safety Contract preamble
    # is present; auto-discovers every `db.<coll>.find(...).to_list()`
    # call under routes/ and asserts the inclusion projection includes
    # "id": 1 (or carries the `# pre-push-invariants: allow-missing-id`
    # marker for legitimate non-id collections). ~2s, no I/O. Added
    # May 27 2026 — catches regressions BEFORE any LLM endpoint or
    # Mongo query is exercised, without per-symbol manual registration.
    "tests/test_pre_push_invariants.py",
    # Prime Directive trust footer regression — asserts every page of
    # every CarryOn-generated PDF carries the public Our Promise
    # attribution. ~0.3s, no I/O. Added Feb 17 2026 alongside the
    # public /our-promise page; a regression that drops the footer
    # means a professional reading a user's CarryOn PDF has no path
    # to verify the platform's locked operating contract.
    "tests/test_pdf_trust_footer.py",
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
