# Coach patterns & openings — implementation guide (the "D" upgrade)

> **Who this is for:** an AI agent (or person) rebuilding/extending this repo from
> scratch on their own machine. It is a recipe, not marketing copy.
> **Scope:** the HELP ME coach's pattern & opening library — named tactics, the
> opening book, and the academic references. Everything here is deterministic:
> **no LLM, no neural net, no API, no network at runtime.** All data lives in
> `src/patterns.js` as plain JavaScript.

---

## 1. The contract (read this before writing code)

Two hard rules make this library trustworthy, and both are enforced in code:

1. **Every insight carries a citation.** Each tactic/opening explanation ships
   with one or more `{label, url}` references to the canonical theory text
   (Lazard / F.F.O. 1993, Comte's strategy guide, Gatliff's openings catalogue,
   Rosenbloom 1982). The player can click through and read the theory.
2. **A claimed consequence must be verified by the engine's own search before
   it is shown.** If the text says "the corner falls to you", the engine's
   alpha-beta search must have *proven* that first (see §5). If it can't be
   verified, the claim is softened or the pattern isn't shown. The coach never
   teaches a pattern that doesn't hold in the actual position. False positives
   are impossible by construction; false negatives are acceptable.

If you add a pattern that breaks either rule, the feature becomes decoration
instead of coaching. Don't.

## 2. Where things live

| File | Role |
|---|---|
| `src/patterns.js` | The whole library: `REFS`, `BOOK`, detectors, `Patterns.forMove`, `Patterns.refsForPick` |
| `main.js` | Move history (`history`), and `showHelp()` which renders insights + ref links under each pick |
| `src/search.js` | `Search.rankMoves` / `Search.negamax` — used by the verification gates |
| `src/engine.js` | `Othello.legalMoves`, `Othello.makeMove`, `Othello.coordLabel` — board primitives |
| `build_single.js` | Inlines `patterns.js` between `search.js` and `main.js` in the single-file build |
| `test/verify.js` | Node logic tests (`node test/verify.js`) — includes 16 pattern-library checks |
| `test/coach_patterns_check.py` | Playwright check: every pick has a labeled, absolute http link; no JS errors |

Load order matters: `engine → eval → search → patterns → main`.

## 3. Data structures

### 3.1 `REFS` — the citation registry

```js
const REFS = {
  lazard:    { label: 'Lazard, F.F.O. Strategy Guide (1993)',
               url:   'https://www.othello-club.de/wp-content/uploads/2025/09/Lazard-Strategie.pdf' },
  comteMobi: { label: 'Comte — mobility & quiet moves',
               url:   'https://www.othello.nl/content/guides/comteguide/strategy.html#mobi' },
  rosenbloom:{ label: 'Rosenbloom (1982), Artificial Intelligence 19 — Iago',
               url:   'https://www.sciencedirect.com/science/article/pii/0004370282900030' },
  // ... plus comte, comtePari, comteStabi, stoner, openings, openingsAlt
};
```

Rules: label must be human-readable; url must be absolute http(s); never add a
source you haven't read — the URL must actually contain what the insight claims.

### 3.2 `BOOK` — the opening book (14 lines, from Gatliff's 77)

```js
const BOOK = [
  { name: 'Tiger',     desc: 'the oldest and most popular main line',
    seq: ['c4', 'e3', 'f6', 'e6', 'f5'] },
  // seq alternates black, white, black, ... — black always starts in this app.
];
```

Coordinates are lowercase strings, matching `Othello.coordLabel()` output
(that function returns `file` + `rank`, e.g. `c4`). Board index ↔ coord:
`index = (rank-1)*8 + file`, where file `a..h` = `0..7` (so `c4` → `(4-1)*8+2 = 26`).

### 3.3 A detector's output

Each detector is a function `(board, player, i) → null | {name, text, refs}`.
`board` = 64-entry array (`0` empty, `1` black, `2` white); `player` = the mover;
`i` = the candidate move's board index; `refs` = array of `REFS.*` entries.

## 4. The six tactic detectors (what each one checks)

| # | Detector | Fires when | Explanation cites |
|---|---|---|---|
| 1 | **Corner capture** | `i` is a corner (0, 7, 56, 63) | Lazard §stable discs, Comte #stabi |
| 2 | **Wedge** | `i` is an edge non-corner and, *after* the move, both edge-adjacent squares are opponent discs (flanked → can't be flipped back along the edge) | Lazard (wedge rule), Comte |
| 3 | **Stoner trap** | `i` is an X-square (b2/g2/b7/g7, indexes 9/14/49/54), its diagonal corner is empty, and `canTakeCornerWithin(..., 3)` confirms the corner is still forced | mastery.50webs Stoner page, Lazard |
| 4 | **Quiet move** | no flipped disc is a frontier disc *and* the new disc itself has no empty neighbour after the move | Comte #mobi, Lazard |
| 5 | **Unbalanced edge** | `i` is on an edge and after the move it belongs to a run of ≥5 same-colour discs with no corner in it | Lazard glossary |
| 6 | **Endgame parity** | 3–8 empties, all in ONE 8-connected empty region; text states the odd/even last-move rule, then an exact search to the end confirms the sign of the final disc count | Comte #pari, Lazard |

Implementation notes for the fiddly ones:

- **Wedge flanking** must be checked on the board *after* the move
  (`makeMove`), because the move can flip its own edge neighbours — a square
  flanked by your *own* colour is not a wedge.
- **Quiet move** needs both halves (see `isQuiet` in the code):
  (a) for every flipped disc, no empty neighbour *except the move square itself*
  (it was empty before the move, obviously); (b) the move square, after the
  move, has no empty neighbours. Missing (b) lets "quiet" fire on moves that
  hand the opponent brand-new mobility.
- **Parity** needs the 8-connected region check (`emptyRegions`, a simple
  BFS/stack flood-fill over the 64 squares). Multiple regions = the parity rule
  doesn't apply to the whole board = don't fire. The exact search is
  `-Search.negamax(boardAfter, opp, 2*(empties-1), -Inf, +Inf, stage, new Map(), 0)`;
  with E empties the game lasts at most 2E plies, so that depth always reaches
  a terminal node; divide the result by 100 to get the disc margin.
- **Unbalanced edge** — corners are excluded from the run (`edgeRunContaining`
  walks the six non-corner cells of the edge around `i`).

`Patterns.forMove(board, player, i, {history})` runs the detectors in order and
keeps at most **2** insights (deduped by name), wrapped in try/catch so a
detector bug degrades to "no insight" instead of breaking the UI.

## 5. The verification gate (`canTakeCornerWithin`)

The one place the coach makes a *consequential* claim ("the corner falls to you
regardless of the reply") it must be search-verified. The gate is a small,
bounded game-tree search:

```
canTakeCornerWithin(board, player, corner, plies):
    if board[corner] == player:  return true
    if plies <= 0:               return false
    if corner is a legal move for player now: return true      # just take it
    for each of player's top-3 moves (Search.rankMoves depth 1):
        b1 = makeMove(board, player, thatMove)
        if b1[corner] == player: return true
        for each of opponent's top-2 replies on b1 (or a pass if none):
            b2 = makeMove(b1, opp, reply)
            if not canTakeCornerWithin(b2, player, corner, plies-1): fail
        if all replies still force the corner: return true
    return false
```

- The wedge detector calls it with `plies = 2`; the Stoner trap with `plies = 3`.
- It only considers the mover's top-3 tries and the opponent's top-2 replies,
  so it's cheap (a handful of depth-1 rankings) — fine for a synchronous,
  single-threaded browser app.
- It can return false negatives (a forcing line outside the top-3), but never
  a false positive: if it returns true, taking the corner really is forced
  against the opponent's two best replies. That asymmetry is deliberate.

## 6. The opening book matcher

`opening(board, player, i, history)`:

- Only for black (this app: human always plays black) — `player !== BLACK` → null.
- Needs 1–11 real moves of history, and `history.length` must be even (black to
  move). A **pass anywhere breaks book continuity** — `main.js` clears
  `history` when a pass occurs, because a pass shifts whose move is next and the
  alternation assumption no longer holds.
- Matching is exact prefix + next move:
  `history` coordinates must equal `line.seq[0..k]` and the candidate move must
  equal `line.seq[k+1]`. If `line.seq.length <= history.length`, the line is
  exhausted (you're out of book) — skip it.
- First match wins. This is why "Rose-Bill" (9 plies) must be checked before
  "Tiger" (5 plies): a Rose-Bill game passes through the Tiger position.
  Currently the BOOK array is hand-ordered with longer lines before their
  prefixes — keep that ordering if you add lines.

## 7. References on every pick (`refsForPick`)

Even when no named pattern fires, every coached move still ends with a `📖`
line. `Patterns.refsForPick(pick, insights)` unions the insights' refs with
`refsForFeatures(pick.features)` (the same feature tags the coach text uses —
`mobility`, `corner`, `edge`, `x-square`, `parity`, `opponentReply`) and caps at
3 links. If nothing matches at all, a guaranteed fallback adds Rosenbloom +
Lazard, so the invariant "every pick ends with an academic reference" can never
fail. `main.js` renders them as `<a href target="_blank" rel="noopener">`.

## 8. Wiring in `main.js`

1. `let history = []` — every human move and every engine move pushes `{i}`;
   `reset()` clears it; the pass branch in `drive()` clears it (book broken).
2. `showHelp()` → for each pick: `Patterns.forMove(board, HUMAN, p.i, {history})`
   → render `<div class="reason">`, then one `<div class="insight">` per named
   pattern, then `<div class="refs">📖 …links…</div>`.
3. Styles are in `style.css` (`.insight`, `.refs a`).

## 9. Recipe: adding a new pattern (e.g. a "parity flip" detector)

1. **Read the theory first.** Find a canonical source that defines the tactic
   (Lazard PDF / Comte guide are the defaults). If you can't find one, don't add
   the pattern — the citation rule is non-negotiable.
2. Write the detector in `src/patterns.js`:
   `function myPattern(board, player, i) { ... return {name, text, refs} | null }`.
   Keep the text consequence-first and plain-English (the named term is a hook;
   the sentence must work even if the player skips the name).
3. If the text claims a consequence, add a verification gate — reuse
   `canTakeCornerWithin` or an exact endgame search; never hand-wave.
4. Register it in the `detectors` array in `forMove` (respect the ordering rule:
   more specific patterns first).
5. Add a citation to `REFS` (or reuse an existing one).
6. Add Node tests to `test/verify.js` — craft a small position where the
   detector must fire and one where it must NOT (use `boardFrom` with 8 row
   strings, `'B'`/`'W'`/`'.'`; see the existing quiet-move and wedge tests).
   Then `node test/verify.js` — all green.
7. Rebuild the single file (`node build_single.js`) and run the browser checks.

## 10. Build & test on a fresh box

```bash
# needs: Node ≥ 18 (v24 used here), Python 3 + playwright for the browser tests
node test/verify.js                     # logic: engine + coach + patterns
node build_single.js                    # emits self-contained othello.html
python3 -m http.server 8625             # serve the repo dir
# browser checks (adjust BASE= inside each file to the port):
python3 test/coach_patterns_check.py    # refs present, links absolute, 0 JS errors
```

Why serve over http instead of `file://`? Only for the automated tests; the
built `othello.html` itself works fine opened directly from disk — that's a
hard requirement (no server, no modules, no workers).

## 11. Sources (verified 2026-09-09)

- Lazard / F.F.O., *Othello Strategy Guide* (1993) — canonical definitions:
  wedge, parity, mobility, quiet moves, unbalanced edges, Stoner trap, stable
  discs. [PDF](https://www.othello-club.de/wp-content/uploads/2025/09/Lazard-Strategie.pdf)
- Comte, *The Strategy to Winning Othello* — mobility, parity, tempo, stable
  discs, quiet moves, standard openings.
  [othello.nl](https://www.othello.nl/content/guides/comteguide/strategy.html)
- *Road to Mastery* — the Stoner trap in depth.
  [mastery.50webs.com/stoner.html](http://mastery.50webs.com/stoner.html)
- Gatliff's 77 named openings — the BOOK table's source.
  [samsoft.org.uk/reversi/openings.htm](https://samsoft.org.uk/reversi/openings.htm)
- Rosenbloom (1982), *A World-Championship-Level Othello Program*, Artificial
  Intelligence 19:279–320 — the academic anchor for the evaluation concepts.
  [ScienceDirect](https://www.sciencedirect.com/science/article/pii/0004370282900030)

## 12. What this is NOT (deliberate)

- No LLM narrator (option E) — that stays an opt-in, premium, separate layer.
- No PV-line walkthrough (option A) and no "why not the tempting move" insight
  (option C) — both still cheap wins to layer on later.
- The pattern library doesn't make the engine stronger; it makes the engine
  *explainable*. Engine strength comes from search depth + eval weights
  (see `docs/ROADMAP.md`).
