# Login to pass.azet.io in a Bitwarden-family extension, open an item with a TOTP secret, screenshot each step.
import sys, asyncio, re
from playwright.async_api import async_playwright
ext, out, email, pw, selfhost = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] == "1"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(f"/tmp/azp-pw/prof-{out}", headless=True, channel="chromium", locale="en-US",
            args=[f"--disable-extensions-except={ext}", f"--load-extension={ext}", f"--user-agent={UA}", "--lang=en-US"], viewport={"width": 380, "height": 600})
        sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event("serviceworker", timeout=30000)
        eid = sw.url.split('/')[2]
        pg = await ctx.new_page()
        n = 0
        async def shot(tag):
            nonlocal n; n += 1
            await pg.wait_for_timeout(1500)
            await pg.screenshot(path=f"/tmp/azp-pw/{out}-{n:02d}-{tag}.png")
            print(f"--- {n} {tag}:", re.sub(r"\s+", " ", await pg.inner_text("body"))[:400])
        await pg.goto(f"chrome-extension://{eid}/popup/index.html")
        await pg.wait_for_timeout(8000)
        await shot("first")
        for name in ["^(skip|건너뛰기)$", "^(log in|로그인)$"]:
            b = pg.get_by_role("button", name=re.compile(name, re.I))
            if await b.count(): await b.first.click(); await pg.wait_for_timeout(1500)
        await pg.wait_for_selector("input[type=email]", timeout=30000)
        await shot("login")
        if selfhost:
            await pg.get_by_role("button", name=re.compile("bitwarden.com", re.I)).first.click()
            await pg.get_by_text(re.compile("^(self-hosted|자체 호스팅)$", re.I)).first.click()
            await shot("selfhost-dialog")
            await pg.locator("[role=dialog] input, dialog input, bit-dialog input").first.fill("https://pass.azet.io")
            await pg.get_by_role("button", name=re.compile("^(save|저장)$", re.I)).click()
            await shot("selfhost-saved")
        await pg.fill("input[type=email]", email)
        await pg.get_by_role("button", name=re.compile("^(continue|계속)$", re.I)).click()
        await pg.wait_for_selector("input[type=password]", timeout=30000)
        await shot("master-password")
        await pg.fill("input[type=password]", pw)
        await pg.get_by_role("button", name=re.compile("^(log in with master password|log in|마스터 비밀번호로 로그인|로그인)$", re.I)).click()
        await pg.wait_for_timeout(8000)
        await shot("vault")
        await pg.get_by_text("TOTP-Demo").first.click()
        await shot("item-totp")
        await ctx.close()
asyncio.run(main())
