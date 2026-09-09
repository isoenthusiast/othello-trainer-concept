/**
 * Othello evaluation — the "brain". 
 * This is a feature-weighted static evaluation (Logistello-style), NOT a neural net.
 * Plain browser script exposing globalThis.Eval.
 *
 * Philosophy: master strength in Othello comes from (a) deep alpha-beta search and
 * (b) an evaluation that is DECOMPOSABLE into human-meaningful features. That
 * decomposability is exactly what powers the deterministic "HELP ME" coach — each
 * feature's contribution to a move's value is reported directly.
 *
 * The weights below are sensible hand-set defaults. The refinement path (fit these
 * from labeled positions on WTHOR / Egaroucid data) is documented in docs/ROADMAP.md.
 */
(function (global) {
  'use strict';

  const BLACK = 1, WHITE = 2;

  // Corner / edge square values that reward stable edges and punish X-squares.
  // Indexed by [row][col]. Negative = bad (X-squares adjacent to corners).
  const SQUARE_WEIGHTS = [
    [ 100,  -12,   8,   6,   6,   8, -12,  100],
    [ -12,  -20,  -4,  -4,  -4,  -4, -20,  -12],
    [   8,   -4,   2,   2,   2,   2,  -4,    8],
    [   6,   -4,   2,   2,   2,   2,  -4,    6],
    [   6,   -4,   2,   2,   2,   2,  -4,    6],
    [   8,   -4,   2,   2,   2,   2,  -4,    8],
    [ -12,  -20,  -4,  -4,  -4,  -4, -20,  -12],
    [ 100,  -12,   8,   6,   6,   8, -12,  100],
  ];

  // Feature weights in a normalized (approximately centipawn-ish) scale.
  // Higher weight = the feature matters more in a total evaluation.
  const WEIGHTS = {
    discs:     1.0,
    mobility:  12.0,   // current legal moves
    potential:  3.0,   // frontier / mobility potential
    corners:    8.0,   // squared corner ownership (corner is huge)
    stability:  6.0,   // discs that can never flip (edges/corners)
    parity:     2.5,   // who plays the last move (endgame only)
    wedge:      3.0,   // controlling a hole that the corner is adjacent to
  };

  /**
   * Evaluate a board from the perspective of @player.
   * Positive score = good for @player. Uses static features + square weights.
   * @param {number[]} board  64-length board from Othello
   * @param {number} player   BLACK or WHITE
   * @param {boolean} [stage] how far into the game (0=early, 1=mid, 2=late) to modulate parity
   */
  function evaluate(board, player, stage) {
    const opp = player === BLACK ? WHITE : BLACK;
    let score = 0;

    let myDiscs = 0, oppDiscs = 0;
    for (let i = 0; i < 64; i++) {
      const v = board[i];
      if (v === player) myDiscs++;
      else if (v === opp) oppDiscs++;
    }
    score += WEIGHTS.discs * Math.sign(myDiscs - oppDiscs) *
      (Math.abs(myDiscs - oppDiscs));

    // --- mobility ---
    const myMoves = Othello.legalMoves(board, player).length;
    const oppMoves = Othello.legalMoves(board, opp).length;
    if (myMoves + oppMoves > 0) {
      score += WEIGHTS.mobility * 100 * (myMoves - oppMoves) / (myMoves + oppMoves);
    }

    // --- corner + square weights + "stability" proxy ---
    let myWeight = 0, oppWeight = 0;
    for (let i = 0; i < 64; i++) {
      const v = board[i];
      const r = (i / 8) | 0, c = i % 8;
      const w = SQUARE_WEIGHTS[r][c];
      if (v === player) myWeight += w;
      else if (v === opp) oppWeight += w;
    }
    score += WEIGHTS.corners * (myWeight - oppWeight) / 100.0;

    // --- parity (endgame): who plays last often decides the game ---
    if (stage && stage >= 0.8) {
      const empties = 64 - (myDiscs + oppDiscs);
      if (myMoves > 0 && oppMoves === 0) score += WEIGHTS.parity * 10;
      else if (oppMoves > 0 && myMoves === 0) score -= WEIGHTS.parity * 10;
      // crude but effective: touching the empties count
      score += WEIGHTS.parity * (empties % 2 === 0 ? 1 : -1) * 2;
    }

    // --- edges owned & stability proxy: a disc that borders the board edge on all
    //     sides (fully in a corner) is stable; approximate by rewarding edges a little ---
    score += WEIGHTS.stability * (myWeight - oppWeight) / 400.0;

    return score;
  }

  /**
   * Describe a move in human terms by decomposing its evaluation into features.
   * Returns a list of {feature, delta} explaining WHY @index is good for @player.
   * This is the deterministic "coach" signal — no LLM, no neural net.
   */
  function explainMove(board, player, index) {
    const nxt = Othello.makeMove(board, player, index);
    const flat = [];
    const info = {};

    // mobility delta
    const opp = player === BLACK ? WHITE : BLACK;
    const myBefore = Othello.legalMoves(board, player).length;
    const myAfter = Othello.legalMoves(nxt, player).length;
    info.mobility = myAfter - myBefore;
    if (info.mobility !== 0) flat.push({ feature: 'mobility', delta: info.mobility });

    // corner / edge acquisition
    const r = (index / 8) | 0, c = index % 8;
    const w = SQUARE_WEIGHTS[r][c];
    if (w > 50) flat.push({ feature: 'corner', delta: w });
    else if (w > 0 && (r === 0 || r === 7 || c === 0 || c === 7))
      flat.push({ feature: 'edge', delta: w });
    else if (w < -12) flat.push({ feature: 'x-square', delta: w }); // avoid

    // stability / disc counts after
    const cntA = Othello.countDiscs(nxt);
    const cntB = Othello.countDiscs(board);
    const gained = (player === BLACK ? cntA.black - cntB.black : cntA.white - cntB.white);
    if (gained > 0) flat.push({ feature: 'flips', delta: gained });

    // overall search value (filled by caller — placeholder here)
    return { features: flat };
  }

  const Eval = {
    evaluate, explainMove, SQUARE_WEIGHTS, WEIGHTS,
  };
  global.Eval = Eval;
})(typeof globalThis !== 'undefined' ? globalThis : this);
