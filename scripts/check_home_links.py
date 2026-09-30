#!/usr/bin/env python3
"""Public "home" link guard (check.sh Stage 4d).

`/` renders the SIGN-IN screen inside the installed app / PWA shell (RootRoute), so any public
page that links to `/` (logo, back arrow, footer "Home", `/#features` hash links) drops the
visitor on Sign In instead of the homepage. Public surfaces must link to `/home`, or go through
`homeHref()` / `<LogoHome>` / `<BackHome>` (components/landing/BackHome.js).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "frontend/src"
SCAN = [ROOT / "pages", ROOT / "components/landing", ROOT / "components/benefactor"]
BAD = re.compile(
    r"""href=["']/["']|href=["']/#|href:\s*["']/#|to=["']/["']|to=\{['"]/['"]\}|"""
    r"""navigate\(['"]/['"]\)|navigateWithFade\(['"]/['"]\)|window\.location\.href\s*=\s*['"]/['"]|"""
    r"""\[['"]home['"],\s*['"]/['"]\]"""
)
ALLOW = ("homeHref(", "isAuthenticated ? '/'")


def main() -> int:
    hits = []
    for base in SCAN:
        for path in sorted(base.rglob("*.js")):
            for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if BAD.search(line) and not any(a in line for a in ALLOW):
                    hits.append(f"{path.relative_to(ROOT.parent.parent)}:{n}: {line.strip()[:140]}")
    if hits:
        print("  FAIL — public page links to `/` (sign-in inside the PWA shell); use /home, <LogoHome> or <BackHome>:")
        for h in hits:
            print(f"    {h}")
        return 1
    print(f"  scanned {sum(len(list(b.rglob('*.js'))) for b in SCAN)} files — every public home link resolves to /home")
    return 0


if __name__ == "__main__":
    sys.exit(main())
