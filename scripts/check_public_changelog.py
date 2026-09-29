#!/usr/bin/env python3
"""Public changelog freshness gate (check.sh Stage 4c).

The homepage "Last product update" and /changelog read frontend/public/changelog.json.
Fails when work logged in memory/CHANGELOG.md (internal, always written) has a newer date
than the newest public entry — i.e. something shipped that families can't see listed.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "frontend/public/changelog.json"
INTERNAL = ROOT / "memory/CHANGELOG.md"
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
TOKEN = re.compile(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?(?:,?\s+(\d{4}))?", re.I)


def newest_internal() -> date | None:
    text = INTERNAL.read_text(encoding="utf-8")
    # Top section only: from the first "## " heading to the next one.
    parts = re.split(r"^## ", text, flags=re.M)
    if len(parts) < 2:
        return None
    section = parts[1]
    year_match = re.search(r"\b(20\d{2})\b", section.splitlines()[0])
    default_year = int(year_match.group(1)) if year_match else date.today().year
    newest = None
    for m in TOKEN.finditer(section):
        month = MONTHS[m.group(1).lower()[:3]]
        day = int(m.group(3) or m.group(2))
        year = int(m.group(4)) if m.group(4) else default_year
        try:
            d = date(year, month, day)
        except ValueError:
            continue
        if d > date.today():
            continue
        newest = d if newest is None or d > newest else newest
    return newest


def newest_public() -> date | None:
    entries = json.loads(PUBLIC.read_text(encoding="utf-8")).get("entries", [])
    dates = [date.fromisoformat(e["date"]) for e in entries if e.get("date")]
    return max(dates) if dates else None


def main() -> int:
    internal, public = newest_internal(), newest_public()
    print(f"  internal (memory/CHANGELOG.md top section): {internal}")
    print(f"  public   (frontend/public/changelog.json):  {public}")
    if internal and public and public < internal:
        print(f"  FAIL — work dated {internal} is not in the public changelog; add a user-facing entry to frontend/public/changelog.json")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
