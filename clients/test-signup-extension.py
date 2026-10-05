# First-time user: install, create an account in the popup, land in the empty vault.
import sys, asyncio, re
from playwright.async_api import async_playwright
ext, out, email, pw = sys.argv[1:5]
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(f"/tmp/azp-pw/prof-{out}", headless=True, channel="chromium",
            args=[f"--disable-extensions-except={ext}", f"--load-extension={ext}", f"--user-agent={UA}"], viewport={"width": 380, "height": 600})
        sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event("serviceworker", timeout=30000)
        pg = await ctx.new_page()
        n = 0
        async def shot(tag):
            nonlocal n; n += 1
            await pg.wait_for_timeout(2000)
            await pg.screenshot(path=f"/tmp/azp-pw/{out}-{n:02d}-{tag}.png")
            print(f"--- {n} {tag}:", re.sub(r"\s+", " ", await pg.inner_text("body"))[:500])
        btn = lambda r: pg.get_by_role("button", name=re.compile(r, re.I))
        await pg.goto(f"chrome-extension://{sw.url.split('/')[2]}/popup/index.html")
        await pg.wait_for_timeout(8000)
        await shot("first")
        await btn("^(create account|계정 만들기)$").first.click()
        await shot("signup")
        await pg.fill("input[type=email]", email)
        await btn("^(continue|계속)$").first.click()
        await shot("set-password")
        pws = pg.locator("input[type=password]")
        await pws.nth(0).fill(pw); await pws.nth(1).fill(pw)
        await shot("filled")
        await btn("^(create account|계정 만들기|계정 생성)$").last.click()
        await pg.wait_for_timeout(10000)
        await shot("after")
        await pg.wait_for_timeout(20000)
        await shot("after-30s")
        await ctx.close()
asyncio.run(main())
