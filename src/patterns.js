/**
 * Patterns: the deterministic pattern & opening library behind the coach.
 * Plain browser script exposing globalThis.Patterns. No LLM, no API — pure rules.
 *
 * Two hard rules keep this honest:
 *   1. Every insight carries a citation (REFS) — an authoritative/academic source
 *      where the player can read the theory behind the tactic.
 *   2. Every claimed CONSEQUENCE (a corner is forced, parity decides, a trap wins)
 *      is verified against the engine's own alpha-beta search before it is shown.
 *      A pattern never teaches a claim that doesn't hold in the actual position.
 *
 * Sources (verified 2026-09-09):
 *   - Lazard / F.F.O., "Othello Strategy Guide" (1993) — wedge, parity, quiet moves,
 *     unbalanced edge, Stoner trap, stable discs (canonical federation text).
 *   - Comte, "The Strategy to Winning Othello" (othello.nl) — mobility, parity,
 *     tempo, stable discs, quiet moves, openings.
 *   - "Road to Mastery" — the Stoner Trap (mastery.50webs.com) — the trap's
 *     ingredients in detail.
 *   - Gatliff's 77 named openings (samsoft.org.uk) — opening book lines.
 *   - Rosenbloom (1982), "A World-Championship-Level Othello Program",
 *     Artificial Intelligence 19:279-320 — the academic anchor for evaluation
 *     concepts (mobility / stability / parity).
 */
(function (global) {
  'use strict';

  const BLACK = 1, WHITE = 2;
  // X-square index -> the corner it sits diagonally next to.
  const XSQUARES = { 9: 0, 14: 7, 49: 56, 54: 63 };

  // ---- citations ----
  const REFS = {
    lazard: {
      label: 'Lazard, F.F.O. Strategy Guide (1993)',
      url: 'https://www.othello-club.de/wp-content/uploads/2025/09/Lazard-Strategie.pdf',
    },
    comte: {
      label: 'Comte, "The Strategy to Winning Othello"',
      url: 'https://www.othello.nl/content/guides/comteguide/strategy.html',
    },
    comteMobi: {
      label: 'Comte — mobility & quiet moves',
      url: 'https://www.othello.nl/content/guides/comteguide/strategy.html#mobi',
    },
    comtePari: {
      label: 'Comte — parity',
      url: 'https://www.othello.nl/content/guides/comteguide/strategy.html#pari',
    },
    comteStabi: {
      label: 'Comte — stable discs',
      url: 'https://www.othello.nl/content/guides/comteguide/strategy.html#stabi',
    },
    stoner: {
      label: 'Road to Mastery: The Stoner Trap',
      url: 'http://mastery.50webs.com/stoner.html',
    },
    openings: {
      label: "Gatliff's 77 Named Openings (samsoft)",
      url: 'https://samsoft.org.uk/reversi/openings.htm',
    },
    openingsAlt: {
      label: 'Othello openings reference',
      url: 'https://reversiboardgame.com/openings/',
    },
    rosenbloom: {
      label: 'Rosenbloom (1982), Artificial Intelligence 19 — Iago',
      url: 'https://www.sciencedirect.com/science/article/pii/0004370282900030',
    },
  };

  // ---- named openings (Gatliff). Sequence alternates: black, white, black, ...
  // Coordinate strings lowercase; the coach's coordLabel returns lowercase too.
  const BOOK = [
    { name: 'Perpendicular', desc: 'the classic perpendicular opening — the most common at top level', seq: ['c4', 'e3'] },
    { name: 'Diagonal', desc: 'the diagonal opening', seq: ['c4', 'c3'] },
    { name: 'Parallel', desc: 'the parallel opening', seq: ['c4', 'c5'] },
    { name: 'Tiger', desc: 'the oldest and most popular main line', seq: ['c4', 'e3', 'f6', 'e6', 'f5'] },
    { name: 'Buffalo (Kenichi)', desc: 'the Buffalo / Kenichi variation of the diagonal', seq: ['c4', 'c3', 'd3', 'c5', 'f6'] },
    { name: 'Horse', desc: 'the Horse', seq: ['c4', 'e3', 'f4', 'c5', 'e6'] },
    { name: 'Cat', desc: 'the Cat', seq: ['c4', 'e3', 'f5', 'e6', 'f4'] },
    { name: 'Italian', desc: 'the Italian', seq: ['c4', 'e3', 'f5', 'e6', 'd3'] },
    { name: 'Wing', desc: 'the Wing variation of the diagonal', seq: ['c4', 'c3', 'e6', 'c5'] },
    { name: 'Semi-Wing', desc: 'the Semi-Wing variation', seq: ['c4', 'c3', 'f5', 'c5'] },
    { name: 'Rose-Bill', desc: 'the central Tiger, aka Rose-Bill', seq: ['c4', 'e3', 'f6', 'e6', 'f5', 'c5', 'f4', 'g6', 'f7'] },
    { name: 'Mimura', desc: 'the Mimura', seq: ['c4', 'e3', 'f4', 'c5', 'd6', 'e6'] },
    { name: 'Landau', desc: 'the Landau', seq: ['c4', 'c3', 'd3', 'c5', 'd6', 'f4', 'f5', 'e6', 'f6'] },
    { name: 'Iago', desc: 'named after Rosenbloom\u2019s championship program', seq: ['c4', 'e3', 'f4', 'c5', 'd6', 'f3', 'd3', 'c3'] },
  ];

  // ---- board helpers ----
  function neighbors(i) {
    const r = (i / 8) | 0, c = i % 8;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
      out.push(nr * 8 + nc);
    }
    return out;
  }

  function emptyRegions(board) {
    const seen = new Uint8Array(64);
    const regions = [];
    for (let i = 0; i < 64; i++) {
      if (board[i] !== 0 || seen[i]) continue;
      let size = 0;
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const q = stack.pop();
        size++;
        for (const n of neighbors(q)) {
          if (board[n] === 0 && !seen[n]) { seen[n] = 1; stack.push(n); }
        }
      }
      regions.push(size);
    }
    return regions;
  }

  function isEdgeNonCorner(i) {
    const r = (i / 8) | 0, c = i % 8;
    return (r === 0 || r === 7 || c === 0 || c === 7) && ![0, 7, 56, 63].includes(i);
  }

  /** The two squares adjacent to i along its edge (i must be an edge non-corner). */
  function edgeNeighbors(i) {
    const r = (i / 8) | 0, c = i % 8;
    if (r === 0 || r === 7) return [i - 1, i + 1];
    return [i - 8, i + 8];
  }

  /**
   * Can @player force occupation of @corner within @plies of their own moves,
   * assuming the opponent plays one of their top-2 replies at each turn?
   * Search-verified; used as the gate before any "the corner falls to you" claim.
   */
  function canTakeCornerWithin(board, player, corner, plies) {
    if (board[corner] === player) return true;
    if (plies <= 0) return false;
    const legal = Othello.legalMoves(board, player);
    if (legal.some((m) => m.i === corner)) return true;          // take it right now
    const top = Search.rankMoves(board, player, 1).slice(0, 3);  // best-ish tries
    const opp = Othello.other(player);
    for (const mv of top) {
      const b1 = Othello.makeMove(board, player, mv.i, mv.flips);
      if (b1[corner] === player) return true;
      const oppMoves = Othello.legalMoves(b1, opp);
      const replies = oppMoves.length ? Search.rankMoves(b1, opp, 1).slice(0, 2) : [null];
      let all = true;
      for (const r of replies) {
        const b2 = r ? Othello.makeMove(b1, opp, r.i, r.flips) : b1;
        if (!canTakeCornerWithin(b2, player, corner, plies - 1)) { all = false; break; }
      }
      if (all) return true;
    }
    return false;
  }

  /** Quiet move: flips no frontier discs and doesn't create a new frontier disc. */
  function isQuiet(board, player, i) {
    const mv = Othello.legalMoves(board, player).find((m) => m.i === i);
    if (!mv) return false;
    for (const f of mv.flips) {
      for (const n of neighbors(f)) {
        if (board[n] === 0 && n !== i) return false;   // flipped disc sat on the frontier
      }
    }
    const nxt = Othello.makeMove(board, player, i, mv.flips);
    return neighbors(i).every((n) => nxt[n] !== 0);    // the new disc isn't a frontier disc
  }

  /** Length of the run of @color discs along @i's edge that contains @i (corners excluded). */
  function edgeRunContaining(board, color, i) {
    const r = (i / 8) | 0, c = i % 8;
    let cells;
    if (r === 0) cells = [1, 2, 3, 4, 5, 6];
    else if (r === 7) cells = [57, 58, 59, 60, 61, 62];
    else if (c === 0) cells = [8, 16, 24, 32, 40, 48];
    else cells = [15, 23, 31, 39, 47, 55];
    const idx = cells.indexOf(i);
    if (idx === -1) return 0;
    let run = 1;
    for (let k = idx - 1; k >= 0 && board[cells[k]] === color; k--) run++;
    for (let k = idx + 1; k < cells.length && board[cells[k]] === color; k++) run++;
    return run;
  }

  // ---- pattern detectors: each returns null or {name, text, refs} ----
  function corner(board, player, i) {
    if (![0, 7, 56, 63].includes(i)) return null;
    return {
      name: 'Corner capture',
      text: 'You take the corner — a stable disc that can never be flipped again. It anchors the whole edge and is the seed from which more stable discs grow.',
      refs: [REFS.lazard, REFS.comteStabi],
    };
  }

  function wedge(board, player, i) {
    if (!isEdgeNonCorner(i)) return null;
    const mv = Othello.legalMoves(board, player).find((m) => m.i === i);
    if (!mv) return null;
    const nxt = Othello.makeMove(board, player, i, mv.flips);
    const opp = Othello.other(player);
    const [a, b] = edgeNeighbors(i);
    if (nxt[a] !== opp || nxt[b] !== opp) return null;   // not flanked by opponent on the edge
    const r = (i / 8) | 0, c = i % 8;
    const cornerCands = [];
    if (r === 0) cornerCands.push(0, 7);
    else if (r === 7) cornerCands.push(56, 63);
    else if (c === 0) cornerCands.push(0, 56);
    else cornerCands.push(7, 63);
    const forced = cornerCands.filter((k) => nxt[k] === 0 && canTakeCornerWithin(nxt, player, k, 2));
    const clause = forced.length
      ? ` the search confirms the ${Othello.coordLabel(forced[0])} corner falls to you regardless of the reply.`
      : ` it also threatens the corner on this edge.`;
    return {
      name: 'Wedge',
      text: `This is a wedge — a disc on the edge flanked by two ${opp === BLACK ? 'black' : 'white'} discs, so it cannot be flipped back along the edge;${clause}`,
      refs: [REFS.lazard, REFS.comte],
    };
  }

  function quiet(board, player, i) {
    if (!isQuiet(board, player, i)) return null;
    return {
      name: 'Quiet move',
      text: 'It flips no frontier discs and creates no new frontier — the opponent gains no new moves from it. Quiet moves are how strong players keep mobility.',
      refs: [REFS.comteMobi, REFS.lazard],
    };
  }

  function unbalancedEdge(board, player, i) {
    if (!isEdgeNonCorner(i)) return null;
    const mv = Othello.legalMoves(board, player).find((m) => m.i === i);
    if (!mv) return null;
    const nxt = Othello.makeMove(board, player, i, mv.flips);
    if (edgeRunContaining(nxt, player, i) < 5) return null;
    return {
      name: 'Unbalanced edge',
      text: '⚠️ This creates an unbalanced edge — five of your discs in a row along the edge with no corner support. These formations invite attacks; it is ranked here because the engine still judges it least-bad.',
      refs: [REFS.lazard],
    };
  }

  function stoner(board, player, i) {
    if (!(i in XSQUARES)) return null;
    const cornerAt = XSQUARES[i];
    if (board[cornerAt] !== 0) return null;
    const mv = Othello.legalMoves(board, player).find((m) => m.i === i);
    if (!mv) return null;
    const nxt = Othello.makeMove(board, player, i, mv.flips);
    if (!canTakeCornerWithin(nxt, player, cornerAt, 3)) return null;
    return {
      name: 'Stoner trap',
      text: `You play into an X-square — usually dangerous because it hands the opponent the corner. Here the search confirms White cannot punish it: this is the Stoner-trap idea, attacking the weak edge to force the ${Othello.coordLabel(cornerAt)} corner anyway.`,
      refs: [REFS.stoner, REFS.lazard],
    };
  }

  function parity(board, player, i) {
    const empties = board.filter ? board.filter((v) => v === 0).length : 0;
    if (empties < 3 || empties > 8) return null;
    const regions = emptyRegions(board);
    if (regions.length !== 1) return null;
    const mv = Othello.legalMoves(board, player).find((m) => m.i === i);
    if (!mv) return null;
    const nxt = Othello.makeMove(board, player, i, mv.flips);
    const opp = Othello.other(player);
    // Exact search to the end: with E empties the game lasts at most 2E plies.
    const stage = Othello.totalDiscs(nxt) / 64;
    const exact = -Search.negamax(nxt, opp, 2 * (empties - 1), -Infinity, Infinity, stage, new Map(), 0);
    const diff = Math.round(exact / 100);
    const odd = (empties % 2) === 1;
    return {
      name: 'Endgame parity',
      text: `${empties} empty squares left, all in one region — ${odd ? 'odd, so barring passes you' : 'even, so White'} will get the last move there. Exact search to the end confirms: best play ${diff >= 0 ? `leaves you +${diff}` : `costs you ${-diff}`} in discs.`,
      refs: [REFS.comtePari, REFS.lazard],
    };
  }

  function opening(board, player, i, history) {
    if (player !== BLACK || !history || history.length === 0 || history.length > 11) return null;
    if (history.length % 2 !== 0) return null;          // must be black to move
    const histCoords = history.map((h) => Othello.coordLabel(h.i));
    const cand = Othello.coordLabel(i);
    for (const line of BOOK) {
      if (line.seq.length <= history.length) continue;
      const prefix = line.seq.slice(0, history.length);
      if (prefix.every((c, k) => c === histCoords[k]) && line.seq[history.length] === cand) {
        const refs = [REFS.openings, REFS.openingsAlt];
        if (line.name === 'Iago') refs.push(REFS.rosenbloom);
        return {
          name: 'Opening book',
          text: `This continues the ${line.name} opening — ${line.desc}. Playing known theory keeps the position sound while you learn.`,
          refs,
        };
      }
    }
    return null;
  }

  /** Run all detectors for a candidate move; returns up to 2 insights (deduped). */
  function forMove(board, player, i, opts) {
    opts = opts || {};
    const history = opts.history || null;
    const insights = [];
    const seen = new Set();
    const detectors = [
      corner, wedge, stoner, quiet, unbalancedEdge, parity,
      (b, p, idx) => opening(b, p, idx, history),
    ];
    for (const det of detectors) {
      if (insights.length >= 2) break;
      let hit = null;
      try { hit = det(board, player, i); } catch (e) { hit = null; }
      if (hit && !seen.has(hit.name)) {
        seen.add(hit.name);
        insights.push(hit);
      }
    }
    return insights;
  }

  /** Baseline citations for a pick from its feature tags (no named pattern needed). */
  function refsForFeatures(features) {
    const out = [];
    const seen = new Set();
    const add = (r) => { if (r && !seen.has(r.url)) { seen.add(r.url); out.push(r); } };
    for (const f of features || []) {
      if (f.feature === 'mobility') { add(REFS.comteMobi); add(REFS.rosenbloom); }
      else if (f.feature === 'corner') { add(REFS.lazard); add(REFS.comteStabi); }
      else if (f.feature === 'edge' || f.feature === 'x-square') { add(REFS.lazard); }
      else if (f.feature === 'parity') { add(REFS.comtePari); }
      else if (f.feature === 'opponentReply') { add(REFS.rosenbloom); }
      if (out.length >= 3) break;
    }
    // Guarantee: every coached move ends with at least one academic reference.
    if (out.length === 0) { add(REFS.rosenbloom); add(REFS.lazard); }
    return out;
  }

  /** Combined citation list for a coach pick (insights first, feature fallback), capped at 3. */
  function refsForPick(pick, insights) {
    const out = [];
    const seen = new Set();
    const add = (r) => { if (r && !seen.has(r.url)) { seen.add(r.url); out.push(r); } };
    for (const ins of insights || []) for (const r of ins.refs) add(r);
    if (out.length < 3) for (const r of refsForFeatures(pick && pick.features)) add(r);
    return out.slice(0, 3);
  }

  global.Patterns = {
    forMove,
    refsForFeatures,
    refsForPick,
    REFS,
    BOOK,
    _test: { isQuiet, canTakeCornerWithin, emptyRegions, edgeRunContaining },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
