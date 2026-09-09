/**
 * Search + the deterministic "HELP ME" coach.
 * Plain browser script exposing globalThis.Search.
 *
 * Uses negamax + alpha-beta with iterative deepening, near-best-first move ordering,
 * and an optional transposition-lite (position hash -> depth,score,flag). Moves are
 * searched in a ranked order so a strong-but-ready-to-move best move is returned fast.
 * For a browser this keeps the UI responsive at reasonable depths; depth is capped.
 */
(function (global) {
  'use strict';

  const BLACK = 1, WHITE = 2;

  // Simple zobrist-lite hash: map each square/color to a pseudo-random 32-bit.
  // Deterministic so results are reproducible.
  let RAND = [];
  (function seed() {
    let s = 0x12345678;
    const next = () => {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0;
      return s >>> 0;
    };
    for (let i = 0; i < 64 * 3; i++) RAND.push(next());
  })();

  function hash(board) {
    let h = 0;
    for (let i = 0; i < 64; i++) {
      const v = board[i];
      if (v === BLACK) h ^= RAND[i * 3 + 0];
      else if (v === WHITE) h ^= RAND[i * 3 + 1];
    }
    return h >>> 0;
  }

  /**
   * Negamax with alpha-beta.
   * @returns {number} score from the perspective of @player at the root.
   */
  function negamax(board, player, depth, alpha, beta, stage, tt, ply) {
    const moves = Othello.legalMoves(board, player);
    if (depth === 0) return Eval.evaluate(board, player, stage);

    // No moves for player: pass to opponent, or endgame.
    if (moves.length === 0) {
      const opp = Othello.other(player);
      // If opponent also has no moves, game over — score by final disc count.
      if (!Othello.hasAnyMove(board, opp)) {
        const c = Othello.countDiscs(board);
        return (player === BLACK ? c.black - c.white : c.white - c.black) * 100;
      }
      return -negamax(board, opp, depth - 1, -beta, -alpha, stage, tt, ply + 1);
    }

    // Transposition-lite lookup
    const H = hash(board);
    const ttEntry = tt.get(H);
    if (ttEntry && ttEntry.depth >= depth) {
      if (ttEntry.flag === 'exact') return ttEntry.score;
      if (ttEntry.flag === 'lower') alpha = Math.max(alpha, ttEntry.score);
      else if (ttEntry.flag === 'upper') beta = Math.min(beta, ttEntry.score);
      if (alpha >= beta) return ttEntry.score;
    }

    // Order moves: cheap eval first for better pruning.
    let ordered = moves.map((m) => {
      const b = Othello.makeMove(board, player, m.i, m.flips);
      return { m, score: Eval.evaluate(b, player, stage) };
    });
    ordered.sort((a, b) => b.score - a.score);

    let best = -Infinity;
    let bestFlag = 'upper';
    let bestChildScore = -Infinity;
    for (const { m } of ordered) {
      const b = Othello.makeMove(board, player, m.i, m.flips);
      const score = -negamax(b, Othello.other(player), depth - 1, -beta, -alpha, stage, tt, ply + 1);
      if (score > best) { best = score; bestChildScore = score; bestFlag = 'exact'; }
      if (score > alpha) alpha = score;
      if (alpha >= beta) { bestFlag = 'lower'; break; }
    }

    tt.set(H, { depth, score: best, flag: bestFlag });
    return best;
  }

  /**
   * Rank the legal moves for @player, best first, with the search score (from
   * player's perspective). Runs iterative deepening up to @maxDepth, returning the
   * ranking from the deepest completed depth we had time for.
   */
  function rankMoves(board, player, maxDepth) {
    const tt = new Map();
    const stage = (Othello.totalDiscs(board) / 64);
    let results = [];

    const moves = Othello.legalMoves(board, player);
    for (let depth = 1; depth <= maxDepth; depth++) {
      const scored = moves.map((m) => {
        const b = Othello.makeMove(board, player, m.i, m.flips);
        const s = -negamax(b, Othello.other(player), depth - 1, -Infinity, Infinity, stage, tt, 1);
        return { i: m.i, score: s };
      });
      // Near-best-first ordering for consistency across iterations
      scored.sort((a, b) => b.score - a.score);
      results = scored;
    }
    return results;
  }

  /**
   * The "HELP ME" coach: returns the top-3 moves with a deterministic reason each.
   * reason = a plain-english sentence assembled from feature deltas (no LLM).
   * @param {number[]} board
   * @param {number} player
   * @param {number} topN   how many moves to return (default 3)
   * @param {number} depth  search depth (default 6 — good for a coaching hint)
   */
  function helpMe(board, player, topN, depth) {
    topN = topN || 3;
    depth = depth || 6;
    const ranked = rankMoves(board, player, depth);
    const out = [];
    for (let k = 0; k < Math.min(topN, ranked.length); k++) {
      const { i, score } = ranked[k];
      const ex = explain(board, player, i);
      out.push({ i, coord: Othello.coordLabel(i), score, reason: ex.text, features: ex.features });
    }
    return out;
  }

  /** Build the plain-english reason from the decomposed features. */
  function explain(board, player, index) {
    const nxt = Othello.makeMove(board, player, index);
    const opp = Othello.other(player);
    const parts = [];
    const features = [];

    const myBefore = Othello.legalMoves(board, player).length;
    const myAfter = Othello.legalMoves(nxt, player).length;
    const mobDelta = myAfter - myBefore;
    if (mobDelta > 0) {
      parts.push(`gives you ${mobDelta} more legal move${mobDelta === 1 ? '' : 's'}`);
      features.push({ feature: 'mobility', delta: mobDelta });
    } else if (mobDelta < 0) {
      parts.push(`costs you ${-mobDelta} legal move${mobDelta === -1 ? '' : 's'}`);
      features.push({ feature: 'mobility', delta: mobDelta });
    }

    const r = (index / 8) | 0, c = index % 8;
    const w = Eval.SQUARE_WEIGHTS[r][c];
    if (w > 50) {
      parts.push('secures a corner');
      features.push({ feature: 'corner', delta: w });
    } else if (w > 0 && (r === 0 || r === 7 || c === 0 || c === 7)) {
      parts.push('extends your edge');
      features.push({ feature: 'edge', delta: w });
    } else if (w < -12) {
      parts.push('(caution: this sits in an X-square, adjacent to a corner)');
      features.push({ feature: 'x-square', delta: w });
    }

    const cntA = Othello.countDiscs(nxt);
    const cntB = Othello.countDiscs(board);
    const gained = (player === BLACK ? cntA.black - cntB.black : cntA.white - cntB.white);
    if (gained > 0) features.push({ feature: 'flips', delta: gained });

    // parity / pass pressure
    const oppAfter = Othello.legalMoves(nxt, opp).length;
    if (oppAfter === 0) {
      parts.push('leaves your opponent with no move — you gain tempo');
      features.push({ feature: 'parity', delta: 1 });
    }

    let sentence = parts.length
      ? parts.join(', ')
      : 'balances disc count and maintains flexibility';
    return { text: sentence + '.', features };
  }

  const Search = { rankMoves, helpMe, negamax };
  global.Search = Search;
})(typeof globalThis !== 'undefined' ? globalThis : this);
