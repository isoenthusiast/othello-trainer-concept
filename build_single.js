// Build a single self-contained othello.html from the modular source.
// Inlines style.css + src/engine.js + src/eval.js + src/search.js + main.js.
// Emits a `<!-- BUILT -->` marker and a timestamp so we can tell it's the bundled build.
// Run: node build_single.js
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const css = read('style.css');
const engine = read('src/engine.js');
const evaljs = read('src/eval.js');
const search = read('src/search.js');
const patterns = read('src/patterns.js');
const main = read('main.js');

// Helper to embed JS safely inside <script> (escape closing tags so a stray "</script>"
// inside a string can't break out of the element).
const embedJs = (js) => js.replace(/<\/script>/gi, '<\\/script>');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Othello Trainer Concept</title>
<!-- BUILT single-file edition (built ${new Date().toISOString()}) -->
<style>
${css}
</style>
</head>
<body>
  <header>
    <h1>Othello Trainer Concept</h1>
    <p class="sub">Master-strength engine + a deterministic <strong>HELP ME</strong> coach. No AI model — the coach reads the engine's own evaluation.</p>
  </header>

  <main>
    <div class="board-wrap">
      <div id="board" class="board"></div>
    </div>

    <aside class="panel">
      <div class="status">
        <div><h2>You play</h2><div class="chip" id="human-chip">Black</div></div>
        <div><h2>Engine</h2><div class="chip" id="ai-chip">White</div></div>
      </div>

      <div class="score">
        <div class="score-box"><span id="score-black">2</span><label>You</label></div>
        <div class="score-box"><span id="score-white">2</span><label>Engine</label></div>
      </div>

      <div id="turn" class="turn">Your turn</div>

      <div class="controls">
        <button id="help-btn">💡 HELP ME</button>
        <button id="hint-coord" class="secondary">Show hint coord</button>
      </div>

      <section id="coach" class="coach hidden">
        <h3>Coach's picks (top 3)</h3>
        <ul id="coach-list"></ul>
      </section>

      <div class="endgame hidden" id="endgame">
        <h3 id="endgame-title">Game over</h3>
        <p id="endgame-detail"></p>
        <button id="restart">Play again</button>
      </div>
    </aside>
  </main>

  <footer>
    <p>Concept build. The engine plays a strong sound game; the path to true master level (bitboards + WASM + data-fitted eval weights) is in <code>docs/ROADMAP.md</code>.</p>
  </footer>

<script>
${embedJs(engine)}
</script>
<script>
${embedJs(evaljs)}
</script>
<script>
${embedJs(search)}
</script>
<script>
${embedJs(patterns)}
</script>
<script>
${embedJs(main)}
</script>
</body>
</html>
`;

const out = path.join(root, 'othello.html');
fs.writeFileSync(out, html, 'utf8');
console.log('Wrote', out, `${(html.length / 1024).toFixed(1)} KB`);
