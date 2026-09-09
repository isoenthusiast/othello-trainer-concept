# ROADMAP — from this concept to true master level

This app is a **working, verified prototype of the right design**, not yet a
master engine. It plays a sound mid-strength game (search depth 6 + a
feature-weighted eval with hand-tuned weights). This roadmap is the honest path
to 2500+ ELO. Every phase is independently verifiable.

The design premise (from the research, cited below): **master-level Othello is a
search + evaluation problem** with the strongest engines being classical, not
neural. The weakest parts of this prototype relative to Edgaroucid/Edax are, in
order of leverage:

## Phase 0 — Bitboards (the big win)
Currently the board is a flat 64-int array and move-gen scans per-square. Replace
with **two `uint64_t` bitboards** (one per color) and the classic mirrored
move-gen tables (compute all legal moves per direction via precomputed masks).
- **Why:** 10–50× move-gen speedup → search deeper (6 → 10+ ply) at the same wall
  time, which is the single largest strength lever in Othello.
- **Verify:** node test/verify.js still passes; measure nodes/sec go up.

## Phase 1 — Transposition table + killer moves + NWS
A proper TT (Zobrist hashing, depth-preferred, PV move first), killer move
heuristic, and principal-variation search. The current code has a *transposition-
lite* Map keyed on a custom hash — upgrade to a real table.
- **Verify:** test the engine beats the depth-6 baseline consistently.

## Phase 2 — Better evaluation (data-fitted weights)
The current weights are hand-set. Logistello's method: **fit the feature weights
from labeled data** using a large (position, final-score) corpus.
- **Data:** WTHOR (~130k pro games, free, `.wtb`) and **Egaroucid free data**
  (`publicly released` ~ (position, evaluation-value) pairs, permissive).
- **Method:** logistic-style regression on the feature vector → a weighted eval
  that generalizes far better than hand-tuned values.
- **Features to add:** the 32 edge patterns (each 3^8 = 6561 configs), potential
  mobility (frontier discs), and mid/endgame-appropriate weights.
- **Verify:** benchmark vs Edax at equal depth; ELO should climb sharply.

## Phase 3 — Opening book
Transpose a real book (Edax `book-2008.htm`, or WZebra's, both permissive) so the
engine handles theory openings without searching the first ~12–18 moves.
- **Verify:** engine doesn't waste search on book moves; opening win rate up.

## Phase 4 — Verify "master" (the gate)
Benchmark vs Edax / WZebra and against the solved-perfect-play reference
(Othello is solved — Takizawa: perfect play = draw). **Gate: reach ~2500+ ELO.**
This is the acceptance criterion for "master."

## Phase 5 — WASM port
Compile the C core to WebAssembly (Emscripten) so the whole engine runs in the
browser at native speed. The [Hans H. Q. engine](https://www.hanshq.net/othello.html)
is an ideal reference — a complete bitboard+negamax engine already compiled to
asm.js/WASM. The current JS stays as the dev/reference and (optionally) the
manual-worker fallback.
- **Verify:** WASM engine benchmarks faster than the JS; still passes E2E.

## Phase 6 — Coaching depth (the HELP ME polish)
The current coach explains *why a move is good* via feature decomposition
(tactical). To also explain *the plan it sets up* (strategic, 2–4 sentences),
feed the ranked moves + feature deltas to a small model for natural-language
narration — **as an optional toggle**, keeping the deterministic feature
explanation as the cheap default. That's a per-feature model-routing choice:
deterministic for the bulk, a model only where it earns value.

## Key references
- Othello is **solved** (perfect play = draw): arXiv 2310.19387
- ChessProgrammingWiki — Othello (bitboards, move-gen, eval)
- Buro — *An Evaluation Function for Othello Based on Statistics* (Logistello)
- Egaroucid tech explanation + free train data
- WTHOR / FFO database (`.wtb`)

**Note on scope:** "HELP ME" was specified as a **deterministic coach with no
model** — that's what Phase 6's default is. The LLM narration is an explicit
future option, not a requirement.
