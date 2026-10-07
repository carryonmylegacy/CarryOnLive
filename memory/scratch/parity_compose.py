"""Compose desk shots (row 1) + pwa shots (row 2) into one review image per route.
Usage: python3 parity_compose.py <who> <route-name> [...]"""
import glob, sys
from PIL import Image

who, routes = sys.argv[1], sys.argv[2:]
for route in routes:
    rows = []
    for suffix, scale in (('desk', 0.5), ('pwa', 1.0)):
        files = sorted(glob.glob(f'/tmp/parity/{who}_{route}_{suffix}*.png'), key=lambda f: (len(f), f))
        ims = [Image.open(f) for f in files]
        ims = [i.resize((int(i.width * scale), int(i.height * scale))) for i in ims]
        if not ims:
            continue
        w = sum(i.width for i in ims); h = max(i.height for i in ims)
        row = Image.new('RGB', (w, h), 'black'); x = 0
        for i in ims:
            row.paste(i, (x, 0)); x += i.width
        rows.append(row)
    W = max(r.width for r in rows); H = sum(r.height for r in rows) + 10 * (len(rows) - 1)
    out = Image.new('RGB', (W, H), (40, 40, 40)); y = 0
    for r in rows:
        out.paste(r, (0, y)); y += r.height + 10
    out.save(f'/tmp/parity/cmp_{who}_{route}.png')
    print(route, out.size)
