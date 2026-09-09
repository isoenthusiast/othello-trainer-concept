/**
 * Othello / Reversi engine.
 * Plain browser script (globalThis.Othello) so it opens via file:// with no build step.
 * Board = flat array of 64, index = row*8 + col. 0 = empty, 1 = black, 2 = white.
 * Not yet bitboard-optimized — this is the clearest, bug-free reference. See docs/ROADMAP.md
 * for the bitboard + WASM path to true master strength.
 */
(function (global) {
  'use strict';

  const BLACK = 1;
  const WHITE = 2;

  // 8 directions as (dr, dc)
  const DIRS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1],
  ];

  function onBoard(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  /** Fresh board with the standard 4-center setup. black moves first. */
  function newBoard() {
    const b = new Array(64).fill(0);
    b[3 * 8 + 3] = WHITE; // d4
    b[3 * 8 + 4] = BLACK; // e4
    b[4 * 8 + 3] = BLACK; // d5
    b[4 * 8 + 4] = WHITE; // e5
    return b;
  }

  function at(board, i) { return board[i]; }
  function idxOf(r, c) { return r * 8 + c; }
  function rowOf(i) { return (i / 8) | 0; }
  function colOf(i) { return i % 8; }

  /**
   * Coordinate label a1..h8 for a square index.
   * Convention: a1 = top-left (row 0, col 0), h8 = bottom-right (row 7, col 7),
   * matching the WTHOR/FFO indexing used by the FFO dataset.
   */
  function coordLabel(i) {
    const r = rowOf(i), c = colOf(i);
    return String.fromCharCode(97 + c) + (r + 1);
  }

  /**
   * All legal moves for @player. Each is the set of opponent discs it flips.
   * Returns an array of { i, flips:[indices] }.
   */
  function legalMoves(board, player) {
    const opp = player === BLACK ? WHITE : BLACK;
    const moves = [];
    for (let i = 0; i < 64; i++) {
      if (board[i] !== 0) continue;
      const flips = [];
      const r = rowOf(i), c = colOf(i);
      for (const [dr, dc] of DIRS) {
        let rr = r + dr, cc = c + dc;
        let line = [];
        while (onBoard(rr, cc) && board[idxOf(rr, cc)] === opp) {
          line.push(idxOf(rr, cc));
          rr += dr; cc += dc;
        }
        if (line.length > 0 && onBoard(rr, cc) && board[idxOf(rr, cc)] === player) {
          for (const x of line) flips.push(x);
        }
      }
      if (flips.length > 0) moves.push({ i, flips });
    }
    return moves;
  }

  function hasAnyMove(board, player) {
    return legalMoves(board, player).length > 0;
  }

  /**
   * Apply a legal move, returning a NEW board (immutable). Throws on illegal move.
   */
  function makeMove(board, player, index, flips) {
    // If flips weren't given, recompute (callers that have them pass them for speed).
    let toFlip = flips;
    if (!toFlip) {
      const mv = legalMoves(board, player).find((m) => m.i === index);
      if (!mv) throw new Error('Illegal move: ' + index);
      toFlip = mv.flips;
    }
    const b = board.slice();
    b[index] = player;
    for (const x of toFlip) b[x] = player;
    return b;
  }

  /**
   * The player to move next after @player just played at @index, or null if the game is over.
   * Ignores whether the next player has moves — caller decides pass/skip.
   */
  function other(player) { return player === BLACK ? WHITE : BLACK; }

  function countDiscs(board) {
    let b = 0, w = 0;
    for (const v of board) { if (v === BLACK) b++; else if (v === WHITE) w++; }
    return { black: b, white: w };
  }

  /** Total discs remaining in the game (game ends when 64 or no moves for both). */
  function totalDiscs(board) {
    let n = 0;
    for (const v of board) if (v !== 0) n++;
    return n;
  }

  const Othello = {
    BLACK, WHITE,
    newBoard, legalMoves, hasAnyMove, makeMove,
    at, idxOf, rowOf, colOf, coordLabel,
    other, countDiscs, totalDiscs,
  };
  global.Othello = Othello;
})(typeof globalThis !== 'undefined' ? globalThis : this);
