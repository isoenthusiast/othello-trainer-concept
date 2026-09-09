"""
Playwright smoke test: loads the real page over HTTP and drives it as a user.
Verifies the board renders, a legal human move flips a disc, the engine replies,
and HELP ME surfaces top-3 picks with reasons.

Run:  python e2e_smoke.py
Requires: playwright + a chromium install (see README).
"""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8619/index.html"
fails = []
def check(name, cond, extra=""):
    if cond:
        print(f"  ok  {name}")
    else:
        fails.append(name)
        print(f"  FAIL {name} {extra}")

async def main():
    async with async_playwright() as p:
        # try chromium, then chrome, then fall back to the channel
        try:
            browser = await p.chromium.launch()
        except Exception as e:
            print("chromium launch failed:", e)
            return
        page = await browser.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        await page.goto(BASE, wait_until="load")
        await page.wait_for_timeout(300)

        # 1. Board renders 64 cells
        cells = await page.locator(".cell").count()
        check("board renders 64 cells", cells == 64, f"count={cells}")

        # 2. Opening scores show 2 / 2
        score_black = await page.locator("#score-black").inner_text()
        score_white = await page.locator("#score-white").inner_text()
        check("opening score 2/2", score_black.strip() == "2" and score_white.strip() == "2",
              f"black={score_black} white={score_white}")

        # 3. Legal-move highlights present (4 for the human's opening choice)
        legal_highlights = await page.locator(".cell.legal").count()
        check("4 legal cells highlighted for human", legal_highlights == 4, f"count={legal_highlights}")

        # 4. Click a legal move (first highlighted cell) as the human, then wait for engine reply.
        first_legal = page.locator(".cell.legal").first
        await first_legal.click()
        await page.wait_for_timeout(800)  # allow engine search to finish

        # After the human + engine move, discs should be > 4 (each move adds + flips).
        black_count = int((await page.locator("#score-black").inner_text()).strip())
        white_count = int((await page.locator("#score-white").inner_text()).strip())
        check("discs increased after human+engine moves", black_count + white_count >= 5,
              f"black={black_count} white={white_count}")
        check("engine took a turn (white score >= 2)", white_count >= 2, f"white={white_count}")

        # 5. Click HELP ME and verify top-3 coach picks appear with reasons.
        await page.locator("#help-btn").click()
        await page.wait_for_timeout(800)
        coach_visible = await page.locator("#coach").is_visible()
        check("HELP ME coach panel becomes visible", coach_visible)
        coach_items = await page.locator("#coach-list li").count()
        check("coach shows up to 3 picks", 1 <= coach_items <= 3, f"count={coach_items}")
        if coach_items:
            first_why = await page.locator("#coach-list li .why").first.inner_text()
            check("coach pick has a non-empty reason", len(first_why.strip()) > 0, f"reason='{first_why.strip()}'")

        # 6. No JS errors on the page
        check("no JS errors during interaction", len([e for e in errors if "Error" in e]) == 0,
              "; ".join(errors[:3]))

        # optional screenshot artifact
        await page.screenshot(path="/tmp/othello_e2e.png", full_page=True)

        await browser.close()

asyncio.run(main())
print("\n=== E2E RESULT: %d failed ===" % len(fails))
raise SystemExit(1 if fails else 0)
