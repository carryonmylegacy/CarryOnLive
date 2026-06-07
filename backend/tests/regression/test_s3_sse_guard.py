"""
Static guard: every S3 put_object in S3Storage must request server-side
encryption (audit #5391e8b #5). This is a source-level invariant so a future
edit that adds a new raw-upload path without SSE fails CI immediately.
"""

import re
from pathlib import Path

STORAGE = Path(__file__).resolve().parents[2] / "services" / "storage.py"


def test_all_s3_put_object_calls_request_sse():
    src = STORAGE.read_text(encoding="utf-8")
    # Find each put_object( ... ) call argument block.
    calls = []
    for m in re.finditer(r"put_object", src):
        # put_object is passed as a reference INTO to_thread(...), so we're
        # already inside that call's parens. Scan forward until it closes.
        i = m.end()
        depth = 1
        while i < len(src) and depth:
            if src[i] == "(":
                depth += 1
            elif src[i] == ")":
                depth -= 1
            i += 1
        calls.append(src[m.start() : i])

    assert calls, "Expected at least one put_object reference in storage.py"
    missing = [c[:80] for c in calls if "ServerSideEncryption" not in c]
    assert not missing, f"put_object call(s) without ServerSideEncryption: {missing}"
