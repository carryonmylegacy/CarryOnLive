#!/usr/bin/env python3
"""Production requirements guard (check.sh Stage 4e).

backend/requirements.txt is installed by the Render image (python:3.12-slim, no compiler).
The preview pod runs Python 3.11 with dev tooling and ML libs installed, so `pip freeze`
into this file ships ~40 packages the API never imports and broke the Render build
(Sep 29, 2026: "Exited with status 1"). Pins are edited by hand, one line per real dependency.
"""
import re
import sys
from pathlib import Path

REQ = Path(__file__).resolve().parent.parent / "backend/requirements.txt"
# Dev / QA tooling and heavy ML stacks that must never ride into the production image.
DENY = {
    "black", "mypy", "mypy-extensions", "flake8", "pyflakes", "pycodestyle", "mccabe", "isort", "ruff",
    "pip-api", "pip-requirements-parser", "cyclonedx-python-lib", "packageurl-python",
    "license-expression", "boolean-py", "py-serializable", "tomli", "tomli-w",
    "librosa", "numba", "llvmlite", "scikit-learn", "scipy", "huggingface-hub", "hf-xet", "tokenizers",
    "soundfile", "soxr", "audioread", "pooch", "joblib", "threadpoolctl", "lazy-loader", "fsspec",
}
MAX_PINS = 200


def main() -> int:
    pins = []
    for line in REQ.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("--"):
            continue
        name = re.split(r"[=<>!~\[; ]", line, 1)[0].lower().replace("_", "-")
        pins.append(name)
    bad = sorted(p for p in pins if p in DENY)
    if bad:
        print("  FAIL — dev/ML packages in backend/requirements.txt (looks like a `pip freeze` dump):")
        for b in bad:
            print(f"    {b}")
        print("  Restore the curated file and add only the pins the API imports.")
        return 1
    if len(pins) > MAX_PINS:
        print(f"  FAIL — {len(pins)} pins (> {MAX_PINS}); requirements.txt must stay a curated list, not a freeze")
        return 1
    print(f"  {len(pins)} curated pins, no dev/ML tooling")
    return 0


if __name__ == "__main__":
    sys.exit(main())
