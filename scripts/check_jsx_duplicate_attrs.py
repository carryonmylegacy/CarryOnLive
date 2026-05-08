#!/usr/bin/env python3
"""
Scan React JSX for duplicate `style={...}` attributes on the same element.

This bug shipped once and broke a whole panel: when JSX has two
`style={...}` attributes on the same element, React silently keeps only
the LAST one — every property in the earlier object is dropped without
warning. The first symptom is a layout that "kind of" works in dev but
fails on iOS Safari / production builds because critical inline styles
(min-height, touch-action, overflow modes) silently vanish.

We also flag duplicate `className=`, which has the same problem.

Run from the housekeeping script. Exit 0 = clean, exit 1 = bug found.
"""
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else '/app/frontend/src'

# Match a JSX opening tag and capture its full attribute body. We greedily
# consume up through the matching `>` while balancing `{}` so that a `>`
# inside a JS expression doesn't break the tag boundary.
def find_jsx_tags(src):
    i = 0
    n = len(src)
    while i < n:
        # Find next "<TagName" — must be a JSX element start (capital
        # letter or lowercase HTML), not a closing tag, not a comment.
        m = re.search(r'<([A-Za-z][\w.]*)\b', src[i:])
        if not m:
            return
        start = i + m.start()
        # Walk forward, balancing braces, until we hit the closing `>`
        # or `/>` at brace depth 0.
        j = start + len(m.group(0))
        depth = 0
        while j < n:
            c = src[j]
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
            elif c == '>' and depth == 0:
                yield (start, j + 1, src[start:j + 1])
                break
            j += 1
        i = j + 1

# An attribute occurrence inside a tag body. We brace-balance so that
# nested JSX inside prop values (e.g. `components={{ IconLeft: () =>
# <Foo className="x"/> }}`) does NOT count as an attribute of the
# parent tag — only attribute occurrences at brace-depth 0 count.
def count_attr(tag_body, attr):
    count = 0
    n = len(tag_body)
    pat = re.compile(r'\b' + re.escape(attr) + r'\s*=\s*\{')
    j = 0
    depth = 0
    while j < n:
        c = tag_body[j]
        if c == '{':
            depth += 1
            j += 1
            continue
        if c == '}':
            depth -= 1
            j += 1
            continue
        # Only check for the attribute pattern at depth 0 (i.e. directly
        # an attribute of THIS tag, not part of a JSX expression value).
        if depth == 0:
            m = pat.match(tag_body, j)
            if m:
                count += 1
                # Jump to the value's opening `{`, then balance through
                # the value so we don't re-enter the same expression.
                j = m.end()
                depth = 1
                continue
        j += 1
    return count

issues = []
scanned = 0

for dirpath, _, files in os.walk(ROOT):
    if any(seg in dirpath for seg in ('node_modules', 'build', 'dist', '__tests__')):
        continue
    for fname in files:
        if not fname.endswith(('.js', '.jsx', '.ts', '.tsx')):
            continue
        path = os.path.join(dirpath, fname)
        try:
            with open(path, encoding='utf-8') as fh:
                src = fh.read()
        except (OSError, UnicodeDecodeError):
            continue
        scanned += 1

        for start, end, tag in find_jsx_tags(src):
            for attr in ('style', 'className'):
                if count_attr(tag, attr) >= 2:
                    line = src[:start].count('\n') + 1
                    rel = os.path.relpath(path, ROOT)
                    issues.append(
                        f"{rel}:{line}  duplicate `{attr}=` attr — "
                        f"React silently drops all but the last one"
                    )
                    break

if issues:
    print(f"Scanned {scanned} files. Found {len(issues)} duplicate-attr violation(s):")
    for i in issues[:10]:
        print(f"  {i}")
    if len(issues) > 10:
        print(f"  …and {len(issues) - 10} more.")
    sys.exit(1)

print(f"Scanned {scanned} files. No duplicate JSX style/className attrs.")
sys.exit(0)
