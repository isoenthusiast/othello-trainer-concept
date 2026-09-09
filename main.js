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
  $('coach').classList.add('hidden');
  $('hint-coord').classList.add('hidden');
  render();
  if (!advanceTurn()) return;
  engineMove();
}

/**
 * After a move by the current `turn` player: decide whose move is next,
 * applying Othello's pass rule. Returns false only when the game is over.
 */
function advanceTurn() {
  const justMoved = turn;
  const nxt = Othello.other(justMoved);
  if (Othello.hasAnyMove(board, nxt)) {
    turn = nxt;              // opponent can move — normal
  } else if (Othello.hasAnyMove(board, justMoved)) {
    // opponent has no move but we do → they pass, we move again
    // (turn stays on justMoved)
  } else {
    gameOver = true;         // nobody can move — game over
  }
  return !gameOver;
}

function engineMove() {
  if (turn !== AI) return;
  const rank = Search.helpMe(board, AI, 1, AI_DEPTH); // engine just needs best move
  if (!rank.length) { // engine has no move -> enemy turn / pass logic
    if (Othello.hasAnyMove(board, HUMAN)) { turn = HUMAN; render(); }
    else { gameOver = true; render(); }
    return;
  }
  const best = rank[0];
  // animate in a worker for snappiness
  board = Othello.makeMove(board, AI, best.i, Othello.legalMoves(board, AI).find((m) => m.i === best.i).flips);
  last = best.i;
  render();
  if (!advanceTurn()) return;
  render();
}

function showHelp() {
  if (turn !== HUMAN || gameOver) return;
  const picks = Search.helpMe(board, HUMAN, 3);
  const list = $('coach-list');
  list.innerHTML = '';
  for (const p of picks) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="coord">${p.coord}</span> · <span class="score">value ${(p.score).toFixed(1)}</span>` +
      `<div class="why">${p.reason}</div>`;
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
  $('coach').classList.add('hidden');
  $('endgame').classList.add('hidden');
  $('hint-coord').classList.add('hidden');
  render();
}

$('help-btn').addEventListener('click', showHelp);
$('hint-coord').addEventListener('click', showHintCoord);
$('restart').addEventListener('click', reset);

render();
