#!/usr/bin/env python3
"""
Scan React component files for the temporal-dead-zone (TDZ) bug pattern
that crashed production once already:

    useEffect(() => { ... }, [foo, bar])
    ...
    const { bar } = useMemo(...)   // ← declared AFTER the useEffect

When the file is minified, JavaScript's TDZ throws a runtime
`ReferenceError: Cannot access 'X' before initialization` because the
useEffect's deps array is evaluated synchronously during render and
the variable isn't bound yet.

This scanner intentionally targets the *narrow* pattern only — for any
identifier that appears in a hook's dependency array, we ensure that
identifier's `const NAME` / `let NAME` / `const { NAME }` declaration
sits ABOVE the hook in the same file. False positives are minimised
because we ignore identifiers that don't have a top-level `const`/`let`
declaration anywhere (those are imports, props, function args, etc.).

Run from the housekeeping script. Exit 0 = clean, exit 1 = bug found.
"""
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else '/app/frontend/src'

# Match useEffect / useMemo / useCallback / useLayoutEffect with a deps array
HOOK_RE = re.compile(
    r'\buse(?:Effect|Memo|Callback|LayoutEffect|InsertionEffect)\b'
    r'\([^()]*?(?:\([^()]*\)[^()]*?)*?,\s*'      # callback arg + comma
    r'\[([^\]]*?)\]\s*\)',                        # deps array
    re.DOTALL,
)

# An identifier-only token (not a property access, not a method call)
IDENT_RE = re.compile(r'^[A-Za-z_$][A-Za-z0-9_$]*$')

issues = []
scanned = 0

for dirpath, _, files in os.walk(ROOT):
    # Skip generated / vendor dirs
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

        # Pre-build an index of all `const NAME = ...` and `const { NAME, ... } = ...`
        # declarations with their byte offset in the file.
        decls = {}
        for m in re.finditer(r'\b(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=', src):
            decls.setdefault(m.group(1), m.start())
        for m in re.finditer(r'\b(?:const|let)\s*\{([^}]+)\}\s*=', src):
            for raw in m.group(1).split(','):
                # Handle "alias: name", "name", "name = default" etc.
                token = raw.split(':')[-1].split('=')[0].strip()
                if IDENT_RE.match(token):
                    decls.setdefault(token, m.start())

        for hook in HOOK_RE.finditer(src):
            deps_str = hook.group(1)
            hook_offset = hook.start()
            for raw_dep in deps_str.split(','):
                dep = raw_dep.strip().split('?.')[0].split('.')[0]
                if not IDENT_RE.match(dep):
                    continue
                decl_offset = decls.get(dep)
                if decl_offset is not None and decl_offset > hook_offset:
                    rel = os.path.relpath(path, ROOT)
                    hook_line = src[:hook_offset].count('\n') + 1
                    decl_line = src[:decl_offset].count('\n') + 1
                    issues.append(
                        f"{rel}:{hook_line}  hook dep '{dep}' is declared later "
                        f"on line {decl_line} (TDZ — minified build will crash)"
                    )

if issues:
    print(f"Scanned {scanned} files. Found {len(issues)} TDZ violation(s):")
    for i in issues[:10]:
        print(f"  {i}")
    if len(issues) > 10:
        print(f"  …and {len(issues) - 10} more.")
    sys.exit(1)

print(f"Scanned {scanned} files. No TDZ-in-deps-array violations.")
sys.exit(0)
