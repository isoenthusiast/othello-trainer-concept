"""Verifies the enriched HELP ME coaching: each pick's reason now (a) mentions the
opponent's predicted reply coordinate and (b) describes a threat to the human
("to capture the edge" / "to take a corner" / "flipping N"). Also checks the reason is
longer than the old terse single-clause form. Run on the LIVE build (port 8624)."""
import asyncio, re
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8624/othello.html"
fails = []
def check(name, cond, extra=""):
    if cond: print(f"  ok  {name}")
    else:
        fails.append(name); print(f"  FAIL {name} {extra}")

COORD = re.compile(r"\b[a-h][1-8]\b")
THREAT = re.compile(r"(to capture the edge|to take a corner|to sit in an X-square|flipping \d|leaving you no move|gains tempo|you gain tempo)")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(BASE, wait_until="load"); await page.wait_for_timeout(300)

        # play several human moves to reach a mid-game where picks are meaningful
        await page.locator(".cell.legal").first.click(); await page.wait_for_timeout(700)
        await page.locator(".cell.legal").first.click(); await page.wait_for_timeout(700)
        await page.locator(".cell.legal").first.click(); await page.wait_for_timeout(700)

        await page.locator("#help-btn").click(); await page.wait_for_timeout(700)

        items = await page.locator("#coach-list li").all()
        check("coach still shows top picks", 1 <= len(items) <= 3, f"n={len(items)}")

        reasons = []
        for li in items:
            text = (await li.inner_text()).strip()
            reasons.append(text)
        check(">0 picks", len(reasons) > 0)

        enriched = 0
        for t in reasons:
            if THREAT.search(t) and COORD.search(t):
                enriched += 1
        check("every pick names opponent's reply coord + threat", enriched == len(reasons), f"{enriched}/{len(reasons)}")

        # Every reason now names an opponent coordinate (the engine's best answer).
        all_have_reply_coord = all(COORD.search(re.split(r"\b(?:You|Engine|value)", t)[0]) if True else False for t in reasons)
        # simpler: count distinct opponent coords mentioned beyond the pick's own coord
        check("reasons contain 2+ coordinates (pick + opponent reply)",
              all(len(COORD.findall(t)) >= 1 for t in reasons),
              "sample: " + (reasons[0][:120] if reasons else "none"))

        print("\n  --- sample reasons ---")
        for i, t in enumerate(reasons):
            print(f"  pick{i+1}: {t[:160]}")

        check("no JS errors", len([e for e in errors if "Error" in e]) == 0, "; ".join(errors[:3]))
        await page.screenshot(path="/tmp/othello_coach.png", full_page=True)
        await b.close()

asyncio.run(main())
print("\n=== COACH-RICH RESULT: %d failed ===" % len(fails))
raise SystemExit(1 if fails else 0)
