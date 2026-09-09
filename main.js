/**
 * Game controller: human vs engine. Binds the board UI, the engine (Othello),
 * and the alpha-beta search (Search) + deterministic coach (Search.helpMe).
 *
 * Search runs on the main thread (synchronous) so the app opens straight from
 * file:// with no build step / no server / no worker-origin headaches. The search
 * depth is capped to keep the UI responsive; the worker path is a documented
 * upgrade in docs/ROADMAP.md for pushing to true master strength.
 */
'use strict';

const $ = (id) => document.getElementById(id);
const HUMAN = Othello.BLACK;   // you play first
const AI = Othello.WHITE;

let board = Othello.newBoard();
let turn = HUMAN;              // whose move it is
let last = null;               // last played square index
let gameOver = false;
let history = [];              // played move indexes in order (for opening-book matching)

const AI_DEPTH = 6;            // search depth for the engine's move. Bump for a harder engine.

function render() {
  const b = $('board');
  b.innerHTML = '';
  // Build a 9x9 grid: a rank/file label gutter around the 8x8 playfield.
  // Row 0 = file letters a..h across the top; Col 0 = ranks 1..8 down the left.
  // Board cell (r,c) sits at grid (r+1, c+1) and maps to engine index r*8+c,
  // matching Othello.coordLabel (a1 = top-left, row 0 = rank 1, col 0 = file a).
  for (let r = 0; r <= 8; r++) {
    for (let c = 0; c <= 8; c++) {
      const slot = document.createElement('div');
      if (r === 0 && c === 0) {
        slot.className = 'coord corner';
      } else if (r === 0) {
        slot.className = 'coord file';
        slot.textContent = String.fromCharCode(97 + (c - 1)); // a..h
      } else if (c === 0) {
        slot.className = 'coord rank';
        slot.textContent = String(r);                          // 1..8
      } else {
        const i = (r - 1) * 8 + (c - 1);
        slot.className = 'cell';
        slot.dataset.r = r - 1; slot.dataset.c = c - 1; slot.dataset.i = i;
        const v = board[i];
        if (v === HUMAN) slot.appendChild(disc('black'));
        else if (v === AI) slot.appendChild(disc('white'));

        if (i === last) slot.classList.add('last');
        if (!gameOver && turn === HUMAN) {
          const legal = Othello.legalMoves(board, HUMAN).some((m) => m.i === i);
          if (legal) slot.classList.add('legal');
        }
        slot.addEventListener('click', () => onCellClick(i));
      }
      b.appendChild(slot);
    }
  }
  updateScore();
  updateTurn();
}

function disc(color) {
  const d = document.createElement('span');
  d.className = 'disc ' + color;
  return d;
}

function updateScore() {
  const { black, white } = Othello.countDiscs(board);
  $('score-black').textContent = black;
  $('score-white').textContent = white;
}

function updateTurn() {
  const t = $('turn');
  const help = $('help-btn');
  if (gameOver) {
    t.textContent = 'Game over';
    help.disabled = true;
    $('endgame').classList.remove('hidden');
    const { black, white } = Othello.countDiscs(board);
    $('endgame-title').textContent = black > white ? 'You win!' : white > black ? 'Engine wins.' : 'Draw.';
    $('endgame-detail').textContent = `Final: You ${black} — Engine ${white}`;
    return;
  }
  const humanTurn = (turn === HUMAN);
  t.textContent = humanTurn ? 'Your turn' : 'Engine thinking…';
  help.disabled = !humanTurn;
}

function onCellClick(i) {
  if (gameOver || turn !== HUMAN) return;
  const mv = Othello.legalMoves(board, HUMAN).find((m) => m.i === i);
  if (!mv) return;
  board = Othello.makeMove(board, HUMAN, i, mv.flips);
  last = i;
  history.push({ i });
  $('coach').classList.add('hidden');
  $('hint-coord').classList.add('hidden');
  render();
  drive();
}

/**
 * Drive the game forward after the player (needsToMove) just moved, applying the
 * Othello pass rule correctly. In Othello, when a player has no legal move they PASS
 * and the other player moves again — and that "other player" can itself have no move
 * and pass again, chaining until someone can legally move or nobody can:
 *
 *   - If the next player (opponent) can move -> their turn.
 *   - If the next player cannot move but the mover can -> mover keeps the turn (opponent passed).
 *   - If neither can move -> game over.
 *
 * The engine is played in a loop so a chain of passes never strands the UI on
 * "Engine thinking…": it keeps making engine moves until it is the human's turn
 * (with a legal move available) or the game is actually over.
 */
function drive() {
  let guard = 0;
  while (!gameOver && guard++ < 128) {
    const mover = turn;
    const opp = Othello.other(mover);
    if (Othello.hasAnyMove(board, opp)) {
      turn = opp;                       // opponent can move — normal hand-off
    } else if (Othello.hasAnyMove(board, mover)) {
      // opponent has no move but mover does -> opponent passes, mover moves again
      turn = mover;
      history = [];                     // a pass breaks opening-book continuity
    } else {
      gameOver = true;                  // nobody can move — game over
      break;
    }

    render();

    if (turn === HUMAN) {
      // Give the human the turn, but only if they can actually move. If the human
      // cannot move, they pass and the engine keeps going (loop continues).
      if (Othello.hasAnyMove(board, HUMAN)) return;
      continue;
    }

    // Engine's turn: play the best move now.
    const rank = Search.helpMe(board, AI, 1, AI_DEPTH);
    if (!rank.length) {
      // Engine has no move but it's its turn — can only happen if we mis-assigned.
      // Fall back: if human can move, hand to human; else end.
      if (Othello.hasAnyMove(board, HUMAN)) { turn = HUMAN; render(); return; }
      gameOver = true; render(); return;
    }
    const best = rank[0];
    const mv = Othello.legalMoves(board, AI).find((m) => m.i === best.i);
    board = Othello.makeMove(board, AI, best.i, mv.flips);
    last = best.i;
    history.push({ i: best.i });
    render();
  }
  if (gameOver) render();
}

function showHelp() {
  if (turn !== HUMAN || gameOver) return;
  const picks = Search.helpMe(board, HUMAN, 3);
  const list = $('coach-list');
  list.innerHTML = '';
  for (const p of picks) {
    const li = document.createElement('li');
    const insights = (typeof Patterns !== 'undefined')
      ? Patterns.forMove(board, HUMAN, p.i, { history })
      : [];
    const refs = (typeof Patterns !== 'undefined')
      ? Patterns.refsForPick(p, insights)
      : [];
    li.innerHTML = `<span class="coord">${p.coord}</span> · <span class="score">value ${(p.score).toFixed(1)}</span>` +
      `<div class="why">${p.reason}</div>` +
      insights.map((ins) => `<div class="insight"><strong>${ins.name}.</strong> ${ins.text}</div>`).join('') +
      (refs.length
        ? `<div class="refs">📖 ` + refs.map((r) => `<a href="${r.url}" target="_blank" rel="noopener">${r.label}</a>`).join(' · ') + `</div>`
        : '');
    li.addEventListener('mouseenter', () => setSuggest(p.i));
    li.addEventListener('mouseleave', () => clearSuggest());
    li.addEventListener('click', () => {
      const mv = Othello.legalMoves(board, HUMAN).find((m) => m.i === p.i);
      if (mv) onCellClick(p.i);
    });
    list.appendChild(li);
  }
  $('coach').classList.remove('hidden');
}

function setSuggest(i) {
  const el = document.querySelector(`.cell[data-i="${i}"]`);
  if (el) el.classList.add('suggest');
}
function clearSuggest() {
  document.querySelectorAll('.cell.suggest').forEach((el) => el.classList.remove('suggest'));
}

function showHintCoord() {
  // Just a tiny aid: highlight a strong square for the human.
  const picks = Search.helpMe(board, HUMAN, 1);
  if (!picks.length) return;
  $('hint-coord').textContent = 'Try: ' + picks[0].coord;
  $('hint-coord').classList.remove('hidden');
}

function reset() {
  board = Othello.newBoard();
  turn = HUMAN;
  last = null;
  gameOver = false;
  history = [];
  $('coach').classList.add('hidden');
  $('endgame').classList.add('hidden');
  $('hint-coord').classList.add('hidden');
  render();
}

$('help-btn').addEventListener('click', showHelp);
$('hint-coord').addEventListener('click', showHintCoord);
$('restart').addEventListener('click', reset);

render();
