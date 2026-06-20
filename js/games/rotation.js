/* Mental Rotation — a small chiral (asymmetric) shape is shown on the left.
   The right shape is the same shape either purely ROTATED (answer "same") or
   MIRRORED and then rotated (answer "mirrored"). Decide which in 60 seconds.
   Shapes are drawn once as SVG <rect> tiles; the right side is produced purely
   with CSS/SVG transforms (rotate / scaleX(-1)), never by recomputing coords. */
NERDBOX.injectStyle("rotation", `
  .rotation-wrap { position: relative; width: 100%; max-width: 560px; display: flex; flex-direction: column; align-items: center; gap: 1.2rem; }
  .rotation-board { display: flex; align-items: center; justify-content: center; gap: 1.1rem; width: 100%; }
  .rotation-pane { display: flex; flex-direction: column; align-items: center; gap: 0.55rem; }
  .rotation-stage { width: 168px; height: 168px; border-radius: 16px; background: var(--bg-alt); display: flex; align-items: center; justify-content: center; box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--sub-alt) 45%, transparent); }
  .rotation-stage svg { width: 132px; height: 132px; display: block; overflow: visible; }
  .rotation-cell { fill: var(--accent); stroke: var(--bg-alt); stroke-width: 0.06; rx: 0.1; }
  .rotation-cell.rotation-ghost { fill: color-mix(in srgb, var(--sub-alt) 38%, transparent); }
  .rotation-label { font-family: "JetBrains Mono", monospace; font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sub); }
  .rotation-arrow { font-family: "JetBrains Mono", monospace; font-size: 1.5rem; color: var(--sub-alt); user-select: none; }
  .rotation-controls { display: flex; gap: 0.9rem; flex-wrap: wrap; justify-content: center; }
  .rotation-choice { font-family: "JetBrains Mono", monospace; min-width: 150px; }
  .rotation-choice.rotation-mirror { background: var(--sub); }
  .rotation-hint { font-family: "JetBrains Mono", monospace; font-size: 0.78rem; color: var(--sub); text-align: center; }
  .rotation-hint b { color: var(--accent); font-weight: 500; }
  .rotation-wrap.rotation-flash-good .rotation-stage { box-shadow: inset 0 0 0 3px var(--go); background: color-mix(in srgb, var(--go) 16%, var(--bg-alt)); }
  .rotation-wrap.rotation-flash-bad .rotation-stage { box-shadow: inset 0 0 0 3px var(--error); background: color-mix(in srgb, var(--error) 16%, var(--bg-alt)); }
`);

NERDBOX.register({
  id: "rotation",
  name: "Mental Rotation",
  tagline: "same shape rotated, or mirrored?",
  category: "reasoning",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand, shuffle = ctx.util.shuffle;
    var ROUND_MS = 60000;
    var GRID = 4;            // shapes live on a 4x4 grid
    var CELLS = 5;           // ~5 connected cells per shape

    var score = 0;
    var timeLeft = 60;
    var roundTimer = null;   // the single 1s countdown interval
    var flashTimer = null;
    var running = false;
    var endAt = 0;
    var answer = null;       // "same" | "mirrored" for the current puzzle

    // ---------- shape generation (chiral polyomino) ----------
    // A cell is [x, y]. We generate a connected blob via random growth, then
    // verify it is chiral: its set of 4 rotations must be disjoint from the
    // set of 4 rotations of its mirror. If symmetric, regenerate.
    function key(cells) {
      // normalise to origin, sort, join -> canonical string fingerprint
      var minX = Infinity, minY = Infinity, i;
      for (i = 0; i < cells.length; i++) {
        if (cells[i][0] < minX) minX = cells[i][0];
        if (cells[i][1] < minY) minY = cells[i][1];
      }
      var pts = [];
      for (i = 0; i < cells.length; i++) pts.push((cells[i][0] - minX) + "," + (cells[i][1] - minY));
      pts.sort();
      return pts.join(" ");
    }
    function rot90(cells) {            // 90deg CW: (x,y) -> (y, -x)
      var out = [];
      for (var i = 0; i < cells.length; i++) out.push([cells[i][1], -cells[i][0]]);
      return out;
    }
    function mirror(cells) {           // flip across vertical axis: (x,y) -> (-x, y)
      var out = [];
      for (var i = 0; i < cells.length; i++) out.push([-cells[i][0], cells[i][1]]);
      return out;
    }
    function rotationSet(cells) {      // 4 unique rotation fingerprints
      var set = {}, cur = cells, i;
      for (i = 0; i < 4; i++) { set[key(cur)] = true; cur = rot90(cur); }
      return set;
    }
    function isChiral(cells) {
      var a = rotationSet(cells);
      var b = rotationSet(mirror(cells));
      for (var k in b) if (a[k]) return false;   // overlap => achiral/symmetric
      return true;
    }
    function growBlob() {
      // random walk on the grid collecting CELLS distinct connected cells
      var occupied = {}, cells = [];
      var x = 1 + rand(GRID - 2), y = 1 + rand(GRID - 2);   // start inland-ish
      occupied[x + "," + y] = true; cells.push([x, y]);
      var guard = 0;
      while (cells.length < CELLS && guard++ < 200) {
        var from = cells[rand(cells.length)];
        var dirs = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        for (var d = 0; d < dirs.length; d++) {
          var nx = from[0] + dirs[d][0], ny = from[1] + dirs[d][1];
          if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
          var kk = nx + "," + ny;
          if (occupied[kk]) continue;
          occupied[kk] = true; cells.push([nx, ny]);
          break;
        }
      }
      return cells;
    }
    function makeChiralShape() {
      for (var tries = 0; tries < 80; tries++) {
        var cells = growBlob();
        if (cells.length === CELLS && isChiral(cells)) return normalise(cells);
      }
      // extremely unlikely fallback: a known chiral pentomino (F-like)
      return normalise([[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]]);
    }
    function normalise(cells) {        // shift to origin, return fresh [x,y] list
      var minX = Infinity, minY = Infinity, i;
      for (i = 0; i < cells.length; i++) {
        if (cells[i][0] < minX) minX = cells[i][0];
        if (cells[i][1] < minY) minY = cells[i][1];
      }
      var out = [];
      for (i = 0; i < cells.length; i++) out.push([cells[i][0] - minX, cells[i][1] - minY]);
      return out;
    }

    // ---------- rendering ----------
    // Draw the shape once in a fixed GRID x GRID viewBox so any rotation about
    // the centre stays inside the stage. The right pane reuses the same markup
    // and is transformed purely with CSS.
    function svgFor(cells, ghost) {
      var rects = "";
      var cls = "rotation-cell" + (ghost ? " rotation-ghost" : "");
      for (var i = 0; i < cells.length; i++) {
        rects += '<rect class="' + cls + '" x="' + cells[i][0] + '" y="' + cells[i][1] +
                 '" width="1" height="1" rx="0.1" />';
      }
      var off = (GRID - 1) / 2; // centre the GRIDxGRID viewBox on cell-centre origin
      return '<svg viewBox="' + (-off) + ' ' + (-off) + ' ' + GRID + ' ' + GRID +
             '" xmlns="http://www.w3.org/2000/svg">' + rects + '</svg>';
    }

    // ---------- DOM ----------
    var status = el("div", "g-status", "");

    var leftStage = el("div", "rotation-stage");
    var leftPane = el("div", "rotation-pane");
    leftPane.appendChild(leftStage);
    leftPane.appendChild(el("div", "rotation-label", "reference"));

    var arrow = el("div", "rotation-arrow", "&rarr;");

    var rightStage = el("div", "rotation-stage");
    var rightPane = el("div", "rotation-pane");
    rightPane.appendChild(rightStage);
    rightPane.appendChild(el("div", "rotation-label", "this one"));

    var board = el("div", "rotation-board");
    board.appendChild(leftPane);
    board.appendChild(arrow);
    board.appendChild(rightPane);

    var sameBtn = el("button", "g-btn rotation-choice", "Same");
    var mirrorBtn = el("button", "g-btn rotation-choice rotation-mirror", "Mirrored");
    var controls = el("div", "rotation-controls");
    controls.appendChild(sameBtn);
    controls.appendChild(mirrorBtn);

    var hint = el("div", "rotation-hint",
      'is the right shape the <b>same</b> one rotated, or its <b>mirror</b>?');

    var overlay = el("div", "g-overlay");

    var wrap = el("div", "rotation-wrap");
    wrap.appendChild(board);
    wrap.appendChild(controls);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);

    root.appendChild(status);
    root.appendChild(wrap);

    sameBtn.addEventListener("click", function () { answerWith("same"); });
    mirrorBtn.addEventListener("click", function () { answerWith("mirrored"); });

    function setStatus() {
      status.innerHTML =
        '<span class="gl-time">time ' + timeLeft + 's</span>' +
        '<span class="gl-score">score ' + score + '</span>';
    }

    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      var b = overlay.querySelector("button");
      if (b) b.addEventListener("click", function () { overlay.classList.remove("show"); onPlay(); });
      overlay.classList.add("show");
    }

    function setButtons(enabled) {
      sameBtn.disabled = !enabled;
      mirrorBtn.disabled = !enabled;
    }

    // ---------- round flow ----------
    function nextPuzzle() {
      var shape = makeChiralShape();
      leftStage.innerHTML = svgFor(shape, false);
      rightStage.innerHTML = svgFor(shape, false);

      var rotation = rand(4) * 90;                 // 0 / 90 / 180 / 270
      var isMirror = rand(2) === 1;                // 50/50
      answer = isMirror ? "mirrored" : "same";

      // Transform the SAME drawn shape: optional horizontal flip, then rotate.
      var svg = rightStage.querySelector("svg");
      svg.style.transformOrigin = "center";
      svg.style.transform =
        "rotate(" + rotation + "deg)" + (isMirror ? " scaleX(-1)" : "");

      setButtons(true);
    }

    function flash(good) {
      var cls = good ? "rotation-flash-good" : "rotation-flash-bad";
      wrap.classList.remove("rotation-flash-good", "rotation-flash-bad");
      void wrap.offsetWidth;                       // restart the transition
      wrap.classList.add(cls);
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(function () {
        wrap.classList.remove("rotation-flash-good", "rotation-flash-bad");
      }, 180);
    }

    function answerWith(choice) {
      if (!running) return;
      setButtons(false);
      if (choice === answer) {
        score++;
        ctx.submitScore(score);
        flash(true);
      } else {
        flash(false);
      }
      setStatus();
      nextPuzzle();
    }

    function tick() {
      timeLeft = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setStatus();
      if (timeLeft <= 0) finish();
    }

    function start() {
      stopTimer();
      overlay.classList.remove("show");
      score = 0;
      timeLeft = 60;
      running = true;
      endAt = Date.now() + ROUND_MS;
      setStatus();
      nextPuzzle();
      roundTimer = setInterval(tick, 250);         // smooth live countdown
    }

    function finish() {
      stopTimer();
      running = false;
      setButtons(false);
      timeLeft = 0;
      setStatus();
      var best = ctx.submitScore(score);
      showOverlay(
        '<div class="g-result"><div class="g-big">' + score + '</div>' +
        '<div class="g-sub">' + (best ? "new best! · " : "") + 'correct in 60s</div>' +
        '<button class="g-btn">play again</button></div>',
        start
      );
    }

    function stopTimer() {
      if (roundTimer) { clearInterval(roundTimer); roundTimer = null; }
      if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
    }

    // ---------- initial idle state ----------
    setButtons(false);
    setStatus();
    // show a static preview shape behind the start overlay
    var preview = makeChiralShape();
    leftStage.innerHTML = svgFor(preview, false);
    rightStage.innerHTML = svgFor(preview, false);
    (function () {
      var svg = rightStage.querySelector("svg");
      svg.style.transformOrigin = "center";
      svg.style.transform = "rotate(90deg)";
    })();
    showOverlay(
      '<div class="g-result"><div class="g-sub">60 seconds · same shape rotated, or mirrored?</div>' +
      '<button class="g-btn">start</button></div>',
      start
    );

    return function teardown() { stopTimer(); running = false; };
  }
});
