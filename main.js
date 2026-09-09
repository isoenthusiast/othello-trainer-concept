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
  for (let i = 0; i < 64; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const r = (i / 8) | 0, c = i % 8;
    cell.dataset.r = r; cell.dataset.c = c; cell.dataset.i = i;
    const v = board[i];
    if (v === HUMAN) cell.appendChild(disc('black'));
    else if (v === AI) cell.appendChild(disc('white'));

    // mark last move
    if (i === last) cell.classList.add('last');

    // legal highlights + click only on current turn
    if (!gameOver && turn === HUMAN) {
      const legal = Othello.legalMoves(board, HUMAN).some((m) => m.i === i);
      if (legal) cell.classList.add('legal');
    }
    cell.addEventListener('click', () => onCellClick(i));
    b.appendChild(cell);
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
    li.addEventListener('click', () => {
      const mv = Othello.legalMoves(board, HUMAN).find((m) => m.i === p.i);
      if (mv) onCellClick(p.i);
    });
    list.appendChild(li);
  }
  $('coach').classList.remove('hidden');
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
