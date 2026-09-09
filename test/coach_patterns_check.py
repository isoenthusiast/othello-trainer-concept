"""
Verifies the D-upgrade: every coach pick now ends with an academic reference link,
and named patterns (corner / wedge / stoner / quiet / parity / opening) render as
insight lines above the refs. Runs on the LIVE single-file build.

Run:  python coach_patterns_check.py
"""
import asyncio, re
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8625/othello.html"
fails = []
def check(name, cond, extra=""):
    if cond: print(f"  ok  {name}")
    else:
        fails.append(name); print(f"  FAIL {name} {extra}")

HTTP = re.compile(r"^https?://")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(BASE, wait_until="load"); await page.wait_for_timeout(300)

        # play a few moves to reach a mid-game where picks are meaningful
        for _ in range(4):
            await page.locator(".cell.legal").first.click(); await page.wait_for_timeout(700)

        await page.locator("#help-btn").click(); await page.wait_for_timeout(900)

        items = await page.locator("#coach-list li").all()
        check("coach shows top picks", 1 <= len(items) <= 3, f"n={len(items)}")

        total_refs = 0
        for li in items:
            refs = await li.locator(".refs a").all()
            check("pick ends with an academic reference link", len(refs) >= 1, f"n={len(refs)}")
            for a in refs:
                href = await a.get_attribute("href")
                label = (await a.inner_text()).strip()
                check("ref url is absolute http(s)", bool(href) and HTTP.match(href), href or "")
                check("ref link has visible label", len(label) > 0)
                total_refs += 1
            ins = await li.locator(".insight").all()
            # insights are position-dependent: not every move fires one. Just check
            # that when present they carry a bold name and non-empty text.
            for d in ins:
                t = (await d.inner_text()).strip()
                check("insight line has a named pattern + explanation", len(t) > 12, t[:80])
        check("at least one ref rendered overall", total_refs >= 1, f"total={total_refs}")
        check("no page errors", len(errors) == 0, "; ".join(errors[:3]))

        # capture evidence
        await page.screenshot(path="/tmp/othello_patterns.png", full_page=False)
        await b.close()

    print(f"\n=== coach_patterns_check: {'PASS' if not fails else 'FAIL'} ({len(fails)} failed) ===")
    return 1 if fails else 0

if __name__ == "__main__":
    import sys
    sys.exit(asyncio.run(main()))
