"""PWA (393px standalone) vs desktop (1920px) full-page shots of the same routes.
Usage: cd /app/backend && python3 /app/memory/scratch/parity_shots.py <BASE> <public|benefactor> <path> [<path>...]
Writes /tmp/parity/<who>_<name>_{pwa,desk}.png (full page)."""
import asyncio, json, os, sys
import httpx
from playwright.async_api import async_playwright

src = open('/app/memory/scratch/pwa_sweep.py').read()
INIT_JS = src.split('INIT_JS = """')[1].split('"""')[0]
EMULATE_JS = src.split('EMULATE_JS = """')[1].split('"""')[0]
BASE, WHO, PATHS = sys.argv[1], sys.argv[2], sys.argv[3:]
os.makedirs('/tmp/parity', exist_ok=True)


async def shoot(ctx, tok, path, suffix, emulate):
    page = await ctx.new_page()
    await page.goto(BASE + path, wait_until="domcontentloaded")
    await page.wait_for_timeout(4500)
    if emulate:
        await page.evaluate(EMULATE_JS, [59, 34])
        await page.wait_for_timeout(400)
    name = path.strip('/').replace('/', '_').replace('?', '_') or 'root'
    out = f"/tmp/parity/{WHO}_{name}_{suffix}.png"
    if suffix == 'pwa':
        await page.screenshot(path=out)
        for i in range(2, 2 + int(os.environ.get('SCROLLS', '5'))):
            await page.mouse.move(200, 500)
            await page.mouse.wheel(0, 700)
            await page.wait_for_timeout(500)
            await page.screenshot(path=out.replace('.png', f'_{i}.png'))
    else:
        await page.screenshot(path=out)
        h = await page.evaluate("document.documentElement.scrollHeight")
        y, i = 900, 2
        while y < h and i < 2 + int(os.environ.get('DESK_SCROLLS', '3')):
            await page.evaluate(f"window.scrollTo(0, {y})")
            await page.wait_for_timeout(400)
            await page.screenshot(path=out.replace('.png', f'_{i}.png'))
            y += 900; i += 1
    print("shot", suffix, path, page.url, out)
    await page.close()


async def main():
    tok = None
    if WHO in ("benefactor", "founder"):
        creds = {"email": "info@carryon.us", "password": "Demo1234!"} if WHO == "benefactor" else {"email": "founder@carryon.us", "password": "CarryOntheWisdom!"}
        async with httpx.AsyncClient(timeout=60) as c:
            api = os.environ.get('API_BASE', BASE)
            tok = (await c.post(f"{api}/api/auth/login", json={**creds, "force_login": True})).json()["access_token"]
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pwa = await b.new_context(viewport={"width": 393, "height": 852}, device_scale_factor=1, is_mobile=True, has_touch=True)
        await pwa.add_init_script(INIT_JS)
        desk = await b.new_context(viewport={"width": 1920, "height": 1000}, device_scale_factor=1)
        await desk.add_init_script("try { sessionStorage.setItem('carryon_quickstart_skipped_session', '1'); } catch (e) {}")
        for ctx in (pwa, desk):
            if tok:
                await ctx.add_init_script(f"localStorage.setItem('carryon_token', {json.dumps(tok)});")
        for path in PATHS:
            await shoot(pwa, tok, path, 'pwa', True)
            await shoot(desk, tok, path, 'desk', False)
        await b.close()

asyncio.run(main())
