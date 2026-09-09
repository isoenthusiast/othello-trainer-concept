"""Verifies the coordinate labels render and that a coach pick highlights its square.
Run after rebuilding othello.html. Server: python3 -m http.server 8622."""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8622/othello.html"  # single-file build
fails = []
def check(name, cond, extra=""):
    if cond:
        print(f"  ok  {name}")
    else:
        fails.append(name)
        print(f"  FAIL {name} {extra}")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(BASE, wait_until="load")
        await page.wait_for_timeout(300)

        # 8 file labels a..h
        files = await page.locator(".coord.file").all_inner_texts()
        check("file labels a..h", files == [chr(97+i) for i in range(8)], "got " + ",".join(files))

        # 8 rank labels 1..8 (top row = rank 1)
        ranks = await page.locator(".coord.rank").all_inner_texts()
        check("rank labels 1..8 top-to-bottom", ranks == [str(i) for i in range(1, 9)], "got " + ",".join(ranks))

        # Still exactly 64 playable cells (labels are .coord, not .cell)
        cells = await page.locator(".cell").count()
        check("64 playable cells", cells == 64, f"count={cells}")

        # Play a legal move, let engine reply, click HELP ME, hover first pick -> its cell gets .suggest
        await page.locator(".cell.legal").first.click()
        await page.wait_for_timeout(900)
        await page.locator("#help-btn").click()
        await page.wait_for_timeout(500)
        first = page.locator("#coach-list li").first
        n = await page.locator("#coach-list li").count()
        check("coach shows picks", n >= 1, f"count={n}")
        if n:
            coord = (await first.locator(".coord").inner_text()).strip()
            box = page.locator("#coach-list li").first
            await box.hover()
            await page.wait_for_timeout(150)
            sugg = await page.locator(".cell.suggest").count()
            # Highlighted cell's data-i must map to the same coord the coach printed
            sugg_i = await page.locator(".cell.suggest").first.get_attribute("data-i")
            lbl = await page.evaluate(f"Othello.coordLabel(Number({sugg_i}))")
            check("hover highlights the matching square", sugg == 1, f"suggest={sugg}")
            check("highlighted square coord == coach coord", lbl == coord, f"cell={lbl} coach={coord}")
            await page.screenshot(path="/tmp/othello_coords.png", full_page=True)

        check("no JS errors",
              len([e for e in errors if "Error" in e]) == 0, "; ".join(errors[:3]))

        await browser.close()

asyncio.run(main())
print("\n=== COORDS RESULT: %d failed ===" % len(fails))
raise SystemExit(1 if fails else 0)
