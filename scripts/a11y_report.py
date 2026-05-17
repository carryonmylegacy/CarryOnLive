#!/usr/bin/env python3
"""Generates /app/memory/A11Y_AUDIT.md from axe-core JSON results.

Run AFTER `yarn e2e tests/e2e/a11y.spec.js` produces /tmp/a11y-results/*.json.
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

RESULTS_DIR = Path("/tmp/a11y-results")
REPORT_FILE = Path("/app/memory/A11Y_AUDIT.md")


def severity_emoji(impact: str) -> str:
    return {"critical": "🔴", "serious": "🟠", "moderate": "🟡", "minor": "🟢"}.get(impact, "⚪")


def main() -> int:
    if not RESULTS_DIR.exists():
        print(f"No results dir at {RESULTS_DIR}; run the a11y suite first.")
        return 1

    pages: dict[str, dict] = {}
    all_violations_by_impact: Counter = Counter()
    all_violations_by_rule: defaultdict = defaultdict(int)

    for jf in sorted(RESULTS_DIR.glob("*.json")):
        data = json.loads(jf.read_text())
        page_name = jf.stem
        pages[page_name] = {
            "passes": len(data.get("passes", [])),
            "violations": data.get("violations", []),
            "incomplete": len(data.get("incomplete", [])),
            "url": data.get("url", "(unknown)"),
        }
        for v in data.get("violations", []):
            impact = v.get("impact", "minor")
            all_violations_by_impact[impact] += 1
            all_violations_by_rule[v.get("id", "unknown")] += 1

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines: list[str] = []
    lines.append(f"# CarryOn™ — WCAG 2.1 AA Audit Report ({ts})")
    lines.append("")
    lines.append("Generated automatically from `axe-core` 4.x via Playwright. Re-runs every push that opts into `HK_RUN_A11Y=1`.")
    lines.append("")
    lines.append("## TL;DR")
    lines.append("")
    total_pass = sum(p["passes"] for p in pages.values())
    total_v = sum(all_violations_by_impact.values())
    crit_or_serious = all_violations_by_impact["critical"] + all_violations_by_impact["serious"]
    lines.append(f"- **Pages tested**: {len(pages)}")
    lines.append(f"- **Rules passed (cumulative)**: {total_pass}")
    lines.append(f"- **Violations**: {total_v} total")
    lines.append(f"  - 🔴 critical: {all_violations_by_impact['critical']}")
    lines.append(f"  - 🟠 serious: {all_violations_by_impact['serious']}")
    lines.append(f"  - 🟡 moderate: {all_violations_by_impact['moderate']}")
    lines.append(f"  - 🟢 minor: {all_violations_by_impact['minor']}")
    if crit_or_serious == 0:
        lines.append("")
        lines.append("✅ **No critical or serious WCAG 2.1 AA violations.** The platform meets the procurement-grade bar.")
    else:
        lines.append("")
        lines.append(f"⚠️ **{crit_or_serious} critical/serious WCAG 2.1 AA violations** — block until fixed.")
    lines.append("")

    lines.append("## Per-page results")
    lines.append("")
    for page_name, info in pages.items():
        lines.append(f"### `{page_name}` — {info['url']}")
        lines.append("")
        if not info["violations"]:
            lines.append("✅ Clean. No WCAG 2.1 AA violations.")
            lines.append("")
            continue
        lines.append("| Impact | Rule | Description | Affected nodes |")
        lines.append("|---|---|---|---|")
        for v in info["violations"]:
            impact = v.get("impact", "minor")
            lines.append(
                f"| {severity_emoji(impact)} {impact} | "
                f"[`{v['id']}`]({v.get('helpUrl', '')}) | "
                f"{v.get('description', '')[:120]} | "
                f"{len(v.get('nodes', []))} |"
            )
        lines.append("")

    if all_violations_by_rule:
        lines.append("## Violations by rule (cumulative)")
        lines.append("")
        for rule, count in sorted(all_violations_by_rule.items(), key=lambda x: -x[1]):
            lines.append(f"- `{rule}` — {count} occurrence(s)")
        lines.append("")

    lines.append("## Waivers")
    lines.append("")
    lines.append("See `/app/memory/A11Y_WAIVERS.md` for any rules deliberately disabled, with rationale.")
    lines.append("")
    lines.append("## Methodology")
    lines.append("")
    lines.append("- Tool: `@axe-core/playwright` 4.x")
    lines.append("- Tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`")
    lines.append("- Browser: Chromium (Playwright default)")
    lines.append("- We test the highest-traffic surfaces (landing, login, dashboard). Add new pages to `tests/e2e/a11y.spec.js`.")
    lines.append("")

    REPORT_FILE.write_text("\n".join(lines))
    print(f"✅ Report written: {REPORT_FILE}")
    print(f"   Pages: {len(pages)} | Violations: {total_v} (crit/serious: {crit_or_serious})")
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
