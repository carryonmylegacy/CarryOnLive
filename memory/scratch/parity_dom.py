"""Diff visible data-testid sets between PWA (393px standalone) and desktop (1920px).
Usage: cd /app/backend && API_BASE=http://localhost:8001 python3 parity_dom.py <BASE> <public|founder|benefactor> <path>..."""
import asyncio, json, os, sys
import httpx
from playwright.async_api import async_playwright

src = open('/app/memory/scratch/pwa_sweep.py').read()
INIT_JS = src.split('INIT_JS = """')[1].split('"""')[0]
BASE, WHO, PATHS = sys.argv[1], sys.argv[2], sys.argv[3:]

COLLECT = """
() => {
  const out = {};
  for (const el of document.querySelectorAll('[data-testid]')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const visible = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    const id = el.getAttribute('data-testid').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>').replace(/\\d+/g, '#');
    if (visible) out[id] = (out[id] || 0) + 1;
  }
  return out;
}
"""


async def collect(ctx, path):
    page = await ctx.new_page()
    await page.goto(BASE + path, wait_until="domcontentloaded")
    await page.wait_for_timeout(5000)
    # scroll through so lazy sections mount
    for _ in range(12):
        await page.mouse.move(200, 400)
        await page.mouse.wheel(0, 900)
        await page.wait_for_timeout(250)
    ids = await page.evaluate(COLLECT)
    await page.close()
    return ids


async def main():
    tok = None
    if WHO in ("benefactor", "founder"):
        creds = {"email": "info@carryon.us", "password": "Demo1234!"} if WHO == "benefactor" else {"email": "founder@carryon.us", "password": "CarryOntheWisdom!"}
        async with httpx.AsyncClient(timeout=60) as c:
            api = os.environ.get('API_BASE', BASE)
            tok = (await c.post(f"{api}/api/auth/login", json={**creds, "force_login": True})).json()["access_token"]
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pwa = await b.new_context(viewport={"width": 393, "height": 852}, is_mobile=True, has_touch=True)
        await pwa.add_init_script(INIT_JS)
        desk = await b.new_context(viewport={"width": 1920, "height": 1000})
        await desk.add_init_script("try { sessionStorage.setItem('carryon_quickstart_skipped_session', '1'); } catch (e) {}")
        for ctx in (pwa, desk):
            if tok:
                await ctx.add_init_script(f"localStorage.setItem('carryon_token', {json.dumps(tok)});")
        for path in PATHS:
            a = await collect(pwa, path)
            d = await collect(desk, path)
            only_pwa = sorted(k for k in a if k not in d)
            only_desk = sorted(k for k in d if k not in a)
            print(f"\n=== {path}  (pwa {len(a)} ids, desk {len(d)} ids)")
            print("  only PWA :", ", ".join(only_pwa) or "-")
            print("  only DESK:", ", ".join(only_desk) or "-")
        await b.close()

asyncio.run(main())
