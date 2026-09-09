/**
 * Node test harness for the Othello concept engine.
 * Loads src/engine.js, src/eval.js, src/search.js into one shared context
 * (they attach to globalThis), then exercises the rules + AI.
 *
 * Run:  node test/verify.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, Map, Array, Infinity });
ctx.globalThis = ctx;

function load(rel) {
  const p = path.join(__dirname, '..', rel);
  const code = fs.readFileSync(p, 'utf8');
  vm.runInContext(code, ctx, { filename: p });
}

['src/engine.js', 'src/eval.js', 'src/search.js', 'src/patterns.js'].forEach(load);

const Othello = ctx.Othello;
const Search = ctx.Search;
const Eval = ctx.Eval;
const Patterns = ctx.Patterns;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log(`  ❌ FAIL: ${name}${extra ? ' — ' + extra : ''}`); }
}

// ---- helpers ----
function boardFrom(rows) {
  // rows: array of 8 strings, '.' empty, 'B' black, 'W' white
  const b = new Array(64).fill(0);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const ch = rows[r][c];
      b[r * 8 + c] = ch === 'B' ? Othello.BLACK : ch === 'W' ? Othello.WHITE : 0;
    }
  }
  return b;
}
function movesStr(moves) {
  return moves.map((m) => Othello.coordLabel(m.i)).sort().join(',');
}

console.log('=== Othello rule verification ===\n');

// 1. Opening position: 4 legal moves for black (d3,c4,f5,e6) and 4 for white.
const start = Othello.newBoard();
const blackMoves = Othello.legalMoves(start, Othello.BLACK);
const whiteMoves = Othello.legalMoves(start, Othello.WHITE);
check('opening: black has 4 legal moves', blackMoves.length === 4, `${blackMoves.length}; ${movesStr(blackMoves)}`);
check('opening: white has 4 legal moves', whiteMoves.length === 4, `${whiteMoves.length}; ${movesStr(whiteMoves)}`);
check('opening: black moves are d3,c4,f5,e6', movesStr(blackMoves) === 'c4,d3,e6,f5', movesStr(blackMoves));

// helper: coord -> index, matching the engine's convention (a1 = top-left, index 0)
function index(coord) {
  const c = coord.charCodeAt(0) - 97;
  const r = parseInt(coord[1], 10) - 1;
  return r * 8 + c;
}

// 2. Opening move d3 flips white d4. Black: 2(e4,d5)+1(d3)+1(d4)=4; White: 1(e5).
let threw2 = false;
try {
  const bAfterD3 = Othello.makeMove(start, Othello.BLACK, index('d3'));
  const cnt = Othello.countDiscs(bAfterD3);
  check('makeMove d3 is accepted', true);
  check('after d3: black has 4 discs', cnt.black === 4, `black=${cnt.black} (expected 4)`);
  check('after d3: white has 1 disc', cnt.white === 1, `white=${cnt.white} (expected 1)`);
  check('after d3: total discs = 5', cnt.black + cnt.white === 5, `total=${cnt.black + cnt.white}`);
} catch (e) { threw2 = true; check('opening move d3 does not throw', false, String(e)); }
check('opening move d3 processed without exception', !threw2);

// 3. Corner capture: black has white at a2,a3 and its own disc at a4; black plays a1 (index 0)
//    and captures down the a-file. rows[0]=rank1, rows[1]=rank2 (a2), etc. a1=index0, a2=8, a3=16, a4=24.
const bCorner = boardFrom([
  '........',
  'W.......',   // a2 = W
  'W.......',   // a3 = W
  'B.......',   // a4 = B
  '........', '........', '........', '........',
]);
const cornerMoves = Othello.legalMoves(bCorner, Othello.BLACK);
const a1m = cornerMoves.find((m) => m.i === index('a1'));
check('corner position: a1 is a legal move', !!a1m, movesStr(cornerMoves));
if (a1m) check('a1 flips exactly 2 white discs (a2,a3)', a1m.flips.length === 2, a1m.flips.join(','));
const afterCorner = Othello.makeMove(bCorner, Othello.BLACK, index('a1'));
const aOs = [0, 8, 16, 24]; // a1,a2,a3,a4
check('after a1: a1,a2,a3,a4 all black',
  aOs.every((i) => afterCorner[i] === Othello.BLACK),
  aOs.map((i) => afterCorner[i]).join(','));

// 4. Illegal move rejection.
let threw = false;
try { Othello.makeMove(start, Othello.BLACK, index('a1')); } catch (e) { threw = true; }
check('illegal move to a1 throws', threw);

// 5. Coordinate labels (top-left a1 convention).
check('coordLabel(0) === a1', Othello.coordLabel(0) === 'a1');
check('coordLabel(63) === h8', Othello.coordLabel(63) === 'h8');
check('coordLabel(8) === a2', Othello.coordLabel(8) === 'a2');
check('coordLabel(index("d3")) === d3', Othello.coordLabel(index('d3')) === 'd3');

// 7. AI picks a legal move on the opening.
const aiMoves = Search.rankMoves(start, Othello.BLACK, 4);
check('AI returns 4 ranked moves on opening', aiMoves.length === 4, `${aiMoves.length}`);
check('AI best move is legal', Othello.legalMoves(start, Othello.BLACK).some((m) => m.i === aiMoves[0].i));
check('ranked moves are sorted best-first', aiMoves[0].score >= aiMoves[aiMoves.length-1].score);

// 8. Coach returns top 3 with reasons, all legal.
const coach = Search.helpMe(start, Othello.BLACK, 3, 4);
check('coach returns up to 3 picks', coach.length === 3, `${coach.length}`);
check('each coach pick is a legal move', coach.every((p) => Othello.legalMoves(start, Othello.BLACK).some((m) => m.i === p.i)));
check('every coach pick has a non-empty reason', coach.every((p) => typeof p.reason === 'string' && p.reason.length > 0));
check('coach picks report coordinates', coach.every((p) => /^[a-h][1-8]$/.test(p.coord)), coach.map((p) => p.coord).join(','));

// 9. full self-play to completion on a small position, to prove game-over/pass don't hang.
console.log('\n=== self-play (depth 4) to completion ===');
let gb = Othello.newBoard();
let gp = Othello.BLACK;
let movesMade = 0;
let safety = 0;
while (safety++ < 200) {
  const ms = Othello.legalMoves(gb, gp);
  if (ms.length === 0) {
    const other = Othello.other(gp);
    if (ms.length === 0 && Othello.legalMoves(gb, other).length === 0) { break; }
    gp = Othello.other(gp); // pass
    continue;
  }
  const best = Search.helpMe(gb, gp, 1, 4)[0];
  gb = Othello.makeMove(gb, gp, best.i);
  movesMade++;
  gp = Othello.other(gp);
}
const finalCnt = Othello.countDiscs(gb);
const total = finalCnt.black + finalCnt.white;
check('self-play terminates within safety bound', safety < 200, `safety=${safety}`);
check('self-play ends with game-over condition (neither side can move, or full board)', 
  total === 64 || (!Othello.hasAnyMove(gb, Othello.BLACK) && !Othello.hasAnyMove(gb, Othello.WHITE)),
  `total=${total}, black can move?=${Othello.hasAnyMove(gb, Othello.BLACK)}, white can move?=${Othello.hasAnyMove(gb, Othello.WHITE)}`);
check('self-play made legal moves (>=30)', movesMade >= 30, `movesMade=${movesMade}`);
console.log(`  final: black=${finalCnt.black} white=${finalCnt.white} moves=${movesMade} iters=${safety}`);

console.log(`\n=== pattern & opening library (D: coach insights + academic refs) ===`);

// 10. Corner pattern fires on the corner-capture position.
{
  const ins = Patterns.forMove(bCorner, Othello.BLACK, index('a1'), {});
  check('corner capture fires the Corner insight', ins.length === 1 && ins[0].name === 'Corner capture', ins.map((x) => x.name).join(','));
  check('Corner insight carries academic refs with http urls',
    ins.length === 1 && ins[0].refs.length >= 1 && ins[0].refs.every((r) => /^https?:\/\//.test(r.url)));
}

// 11. Wedge: c1 flanked by white b1/d1 along the top edge; corner a1 verified forced.
{
  const bw = boardFrom([
    '.W.W....',
    '..W.....',
    '..B.....',
    '........', '........', '........', '........', '........',
  ]);
  const ins = Patterns.forMove(bw, Othello.BLACK, index('c1'), {});
  const w = ins.find((x) => x.name === 'Wedge');
  check('wedge detection fires for c1 flanked by white on the edge', !!w, ins.map((x) => x.name).join(','));
  if (w) check('wedge claims the a1 corner falls to you (search-verified)', /a1/.test(w.text), w.text);
  if (w) check('wedge carries the Lazard guide ref', w.refs.some((r) => /lazard/i.test(r.label)));
}

// 12. Quiet move: c4 flips a surrounded white disc and creates no new frontier.
{
  const bq = boardFrom([
    '........',
    '........',
    '.BBBB...',
    '.B.WB...',
    '.BBBB...',
    '........', '........', '........',
  ]);
  const ins = Patterns.forMove(bq, Othello.BLACK, index('c4'), {});
  const q = ins.find((x) => x.name === 'Quiet move');
  check('quiet-move detection fires for the interior c4 move', !!q, ins.map((x) => x.name).join(','));
  check('quiet helper isQuiet agrees', Patterns._test.isQuiet(bq, Othello.BLACK, index('c4')) === true);
}

// 13. Opening book: c4 e3 then candidate f6 continues the Tiger.
{
  const ins = Patterns.forMove(start, Othello.BLACK, index('f6'),
    { history: [{ i: index('c4') }, { i: index('e3') }] });
  const o = ins.find((x) => x.name === 'Opening book');
  check('opening book fires on the Tiger continuation', !!o && /Tiger/.test(o.text), ins.map((x) => x.name).join(','));
  if (o) check('opening insight cites the Gatliff openings list', o.refs.some((r) => /samsoft/.test(r.url)));
}

// 14. Region segmentation: a filled middle column splits the board into two regions.
{
  const rows = [];
  for (let r = 0; r < 8; r++) rows.push('...B....');
  const bs = boardFrom(rows);
  const regs = Patterns._test.emptyRegions(bs);
  check('filled middle column yields exactly 2 empty regions', regs.length === 2, `regions=${JSON.stringify(regs)}`);
  check('region sizes sum to 56 empties', regs.reduce((a, b) => a + b, 0) === 56);
}

// 15. canTakeCornerWithin: direct corner capture is trivially forced.
check('canTakeCornerWithin true when the corner is immediately legal',
  Patterns._test.canTakeCornerWithin(bCorner, Othello.BLACK, 0, 1) === true);

// 16. Feature fallback refs + combined refs for a coach pick.
{
  const picks = Search.helpMe(start, Othello.BLACK, 1, 4);
  const fr = Patterns.refsForFeatures(picks[0].features);
  check('feature fallback yields at least one citation', fr.length >= 1, JSON.stringify(picks[0].features));
  const combined = Patterns.refsForPick(picks[0], []);
  check('refsForPick caps at 3 and all urls are http(s)',
    combined.length >= 1 && combined.length <= 3 && combined.every((r) => /^https?:\/\//.test(r.url)));
  const insOnStart = Patterns.forMove(start, Othello.BLACK, picks[0].i, {});
  check('forMove never returns more than 2 insights', insOnStart.length <= 2);
  check('every insight has name+text+refs', insOnStart.every((x) => x.name && x.text && Array.isArray(x.refs)));
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
