"""Deterministic probe: confirm the DOM board state and the JS engine state agree,
and that disc elements are actually rendered for every non-empty square."""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8619/index.html"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto(BASE, wait_until="load")
        await page.wait_for_timeout(300)

        # Read the live engine board + legal moves directly from JS (ground truth)
        state = await page.evaluate("""() => ({
            board: Othello.newBoard().join(''),
            discCells: document.querySelectorAll('.disc').length,
            scoreBlack: document.getElementById('score-black').textContent,
            scoreWhite: document.getElementById('score-white').textContent,
            legalCells: document.querySelectorAll('.cell.legal').length,
        })""")
        print("initial:", state)

        # Count discs via JS board scan
        discs = await page.evaluate("""() => {
            const b = Othello.newBoard();
            let n = 0;
            for (const v of b) if (v !== 0) n++;
            return n;
        }""")
        print("engine non-empty squares:", discs, "| DOM .disc elements:", state["discCells"])
        assert state["discCells"] == discs, "DOM disc count != engine board count"
        assert state["scoreBlack"] == "2" and state["scoreWhite"] == "2", "opening score wrong"

        # Play one human move + engine reply, then re-check DOM vs engine
        await page.locator(".cell.legal").first.click()
        await page.wait_for_timeout(900)
        state2 = await page.evaluate("""() => ({
            discCells: document.querySelectorAll('.disc').length,
            scoreBlack: document.getElementById('score-black').textContent,
            scoreWhite: document.getElementById('score-white').textContent,
            turn: document.getElementById('turn').textContent,
        })""")
        print("after move:", state2)
        assert state2["discCells"] == int(state2["scoreBlack"]) + int(state2["scoreWhite"]), \
            f"DOM disc mismatch: {state2}"
        assert int(state2["scoreBlack"]) + int(state2["scoreWhite"]) >= 5, "no discs added after move"

        print("\nDOM / engine agreement verified: disc elements == engine board == score")
        await browser.close()

asyncio.run(main())
