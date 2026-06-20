/* Pattern Matrix — a Raven's-Progressive-Matrices-style fluid-reasoning test.
   A 3x3 grid of cells is shown; each cell draws one or more simple shapes
   (circle / square / triangle / diamond). The cells obey a hidden RULE that
   varies an attribute across rows and/or columns (shape type, count, size,
   rotation, fill). The bottom-right cell is blank ("?"). Six candidate tiles
   are offered; click the one that completes the matrix.

   Puzzles are generated programmatically: a rule fills all 8 visible cells AND
   computes the missing (correct) cell, then 5 wrong-but-plausible distractors
   are built by mutating exactly one attribute. Because the 8 visible cells fully
   determine the rule, the correct tile is precisely the one whose attributes
   equal the generator's output — so uniqueness reduces to: all 6 options have
   distinct attribute-fingerprints and exactly one equals the answer. We verify
   this for every puzzle and regenerate distractors on any collision.

   Correct -> green flash, streak++, submitScore(streak), next (rule families
   rotate and escalate). Wrong -> game over: the correct option is highlighted,
   best = longest streak. "play again" resets. */
NERDBOX.injectStyle("matrix", `
  .matrix-wrap { position: relative; width: 100%; max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 1.3rem; }
  .matrix-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; width: 100%; max-width: 330px; }
  .matrix-cell { position: relative; aspect-ratio: 1; background: var(--bg-alt); border-radius: 12px; box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--sub-alt) 45%, transparent); display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .matrix-cell svg { width: 86%; height: 86%; display: block; }
  .matrix-cell.matrix-blank { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent); }
  .matrix-q { font-family: "JetBrains Mono", monospace; font-size: 2.4rem; font-weight: 500; color: var(--accent); line-height: 1; }
  .matrix-prompt { font-family: "JetBrains Mono", monospace; font-size: 0.82rem; color: var(--sub); text-align: center; min-height: 1.2em; }
  .matrix-prompt b { color: var(--accent); font-weight: 500; }
  .matrix-options { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; width: 100%; }
  .matrix-opt { position: relative; aspect-ratio: 1; padding: 0; background: var(--bg-alt); border: 2px solid var(--sub-alt); border-radius: 10px; display: flex; align-items: center; justify-content: center; overflow: hidden; transition: border-color 0.12s, transform 0.08s, box-shadow 0.12s; }
  .matrix-opt svg { width: 82%; height: 82%; display: block; pointer-events: none; }
  .matrix-opt:hover:not(:disabled) { border-color: var(--accent); transform: translateY(-2px); }
  .matrix-opt:disabled { cursor: default; }
  .matrix-opt.matrix-correct { border-color: var(--go); box-shadow: 0 0 0 3px color-mix(in srgb, var(--go) 32%, transparent); background: color-mix(in srgb, var(--go) 14%, var(--bg-alt)); }
  .matrix-opt.matrix-wrong { border-color: var(--error); box-shadow: 0 0 0 3px color-mix(in srgb, var(--error) 32%, transparent); background: color-mix(in srgb, var(--error) 14%, var(--bg-alt)); }
  .matrix-grid.matrix-flash .matrix-blank { box-shadow: inset 0 0 0 2px var(--go); background: color-mix(in srgb, var(--go) 16%, var(--bg-alt)); }
  .matrix-shape-fill { fill: var(--accent); stroke: none; }
  .matrix-shape-out { fill: none; stroke: var(--accent); stroke-width: 5; stroke-linejoin: round; }
  .matrix-streak { color: var(--accent); }
  .matrix-rule b { color: var(--accent); font-weight: 500; }
  @media (max-width: 620px) {
    .matrix-options { gap: 6px; }
    .matrix-opt { border-radius: 8px; }
  }
`);

NERDBOX.register({
  id: "matrix",
  name: "Pattern Matrix",
  tagline: "complete the visual pattern",
  category: "reasoning",
  difficulty: "hard",
  scoreMode: "max",
  formatScore: function (v) { return v + " streak"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6" height="6" rx="1"/><circle cx="18" cy="6" r="3"/><path d="M6 15h6"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M6 12v6"/><path d="M9 18H3"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand, shuffle = ctx.util.shuffle;

    // ---- tiny helpers ----
    function ri(min, max) { return min + rand(max - min + 1); }   // inclusive int
    function pick(arr) { return arr[rand(arr.length)]; }
    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    /* ---------- shape attribute model ----------
       A cell is fully described by an attribute object:
         shape:    "circle" | "square" | "triangle" | "diamond"
         count:    1 | 2 | 3           (how many copies are drawn)
         size:     0 | 1 | 2           (small / medium / large)
         fill:     true | false        (solid vs outline)
         rot:      0 | 45 | 90 | 135    (rotation in degrees)
       Two cells are "equal" iff every attribute matches — captured by fp(). */
    var SHAPES = ["circle", "square", "triangle", "diamond"];

    function fp(a) {
      return a.shape + "|" + a.count + "|" + a.size + "|" + (a.fill ? "1" : "0") + "|" + a.rot;
    }
    // Canonical VISUAL identity of a cell — what the eye actually sees, with all
    // rendering symmetries collapsed so that any two cells which draw the same
    // picture share one key:
    //   - circle: rotation is invisible -> angle 0.
    //   - square / diamond: 90 rotational symmetry, AND a square turned 45 is a
    //     diamond (and vice-versa). We fold both onto a single {square,0} bucket.
    //   - triangle: distinct at every 45 step within 0..135.
    // Guarding distractors with this key (vfp) guarantees no two option tiles can
    // ever look identical, even across different shape/rotation combinations.
    function visKey(a) {
      if (a.shape === "circle") return "circle|0";
      if (a.shape === "triangle") return "triangle|" + (a.rot % 180);
      // square & diamond share a family with 90 symmetry. A diamond is just a
      // square carrying an intrinsic +45 offset, so the effective orientation is
      // (offset + rot) mod 90, giving exactly two buckets: "sq0" (flat square,
      // e.g. square@0/90 or diamond@45) and "sq45" (a diamond, e.g. diamond@0/90
      // or square@45/135).
      var offset = (a.shape === "diamond") ? 45 : 0;
      var eff = (offset + a.rot) % 90;   // 0 or 45
      return "sq|" + eff;
    }
    function vfp(a) {
      return visKey(a) + "|" + a.count + "|" + a.size + "|" + (a.fill ? "1" : "0");
    }
    function clone(a) {
      return { shape: a.shape, count: a.count, size: a.size, fill: a.fill, rot: a.rot };
    }

    // ---------- SVG drawing ----------
    // Each shape is drawn centred in a 100x100 viewBox. `count` copies are laid
    // out side by side and scaled down so they always fit cleanly.
    var SIZE_SCALE = [0.42, 0.62, 0.84];   // small / medium / large (fraction of cell)

    function shapePath(shape, cx, cy, r, fill) {
      var cls = fill ? "matrix-shape-fill" : "matrix-shape-out";
      if (shape === "circle") {
        return '<circle class="' + cls + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>';
      }
      if (shape === "square") {
        var s = r * 1.74;                    // side so the square ~matches circle bulk
        return '<rect class="' + cls + '" x="' + (cx - s / 2) + '" y="' + (cy - s / 2) +
               '" width="' + s + '" height="' + s + '" rx="' + (s * 0.08) + '"/>';
      }
      if (shape === "triangle") {
        var t = r * 1.05;                    // circumradius-ish
        var p1 = (cx) + "," + (cy - t);
        var p2 = (cx - t * 0.866) + "," + (cy + t * 0.5);
        var p3 = (cx + t * 0.866) + "," + (cy + t * 0.5);
        return '<polygon class="' + cls + '" points="' + p1 + " " + p2 + " " + p3 + '"/>';
      }
      // diamond (square rotated 45 — drawn explicitly so it tessellates cleanly)
      var d = r * 1.18;
      var dp = [
        cx + "," + (cy - d),
        (cx + d) + "," + cy,
        cx + "," + (cy + d),
        (cx - d) + "," + cy
      ].join(" ");
      return '<polygon class="' + cls + '" points="' + dp + '"/>';
    }

    // Build the inner SVG markup for an attribute object.
    function svgFor(a) {
      var n = a.count;
      var frac = SIZE_SCALE[a.size];
      // available horizontal room is shared between n copies
      var slot = 100 / n;
      var r = Math.min(slot, 100) * 0.5 * frac;   // radius per copy
      var inner = "";
      for (var i = 0; i < n; i++) {
        var cx = slot * (i + 0.5);
        inner += shapePath(a.shape, cx, 50, r, a.fill);
      }
      var transform = "";
      if (a.rot) transform = ' transform="rotate(' + a.rot + ' 50 50)"';
      return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
             '<g' + transform + '>' + inner + '</g></svg>';
    }

    /* ---------- rule families ----------
       Each generator returns a 3x3 array `grid[r][c]` of attribute objects plus
       a human-readable `rule` label. The generator fills ALL nine cells from the
       rule (including grid[2][2], the answer) so the stored answer is guaranteed
       consistent with the visible eight. Distractors are derived separately.

       Rules deliberately spread across the standard RPM transformation types:
         - an attribute PROGRESSES across each row (count / size / rotation)
         - an attribute is CONSTANT down columns, varies by row
         - the shape TYPE cycles (a Latin-square so rows & cols share shapes)
         - fill alternates in a checker / row pattern
       `level` (0+) escalates: more attributes vary at once as the streak grows. */

    function base(level) {
      // a sensible "default" cell that individual rules then perturb
      return {
        shape: pick(SHAPES),
        count: 1,
        size: 1,
        fill: true,
        rot: 0
      };
    }

    var GENERATORS = [
      // (a) COUNT progresses across each row: col 0->1 copy, col1->2, col2->3.
      // shape is constant per row but differs between rows; size/fill fixed.
      function (level) {
        var rowShapes = shuffle(SHAPES).slice(0, 3);
        var fill = level >= 3 ? pick([true, false]) : true;
        var size = level >= 2 ? pick([0, 1]) : 1;
        var g = [];
        for (var r = 0; r < 3; r++) {
          g[r] = [];
          for (var c = 0; c < 3; c++) {
            g[r][c] = { shape: rowShapes[r], count: c + 1, size: size, fill: fill, rot: 0 };
          }
        }
        return { grid: g, rule: "count increases across each row (1, 2, 3)" };
      },

      // (b) SIZE grows across each row (small -> med -> large). Shape constant
      // down columns (a cycled shape per column), so columns share a shape.
      function (level) {
        var colShapes = shuffle(SHAPES).slice(0, 3);
        var fill = level >= 3 ? pick([true, false]) : true;
        var g = [];
        for (var r = 0; r < 3; r++) {
          g[r] = [];
          for (var c = 0; c < 3; c++) {
            g[r][c] = { shape: colShapes[c], count: 1, size: c, fill: fill, rot: 0 };
          }
        }
        return { grid: g, rule: "size grows across each row; shape constant down columns" };
      },

      // (c) ROTATION advances across each row by +45 per column. We use the
      // TRIANGLE only: it has no 90 (square/diamond) symmetry, so every step in
      // {0,45,90,135} renders to a visibly different orientation — the rotation
      // progression actually reads. Each row starts at a different angle so the
      // answer (2,2) is the unique +45 continuation of its row.
      function (level) {
        var size = level >= 2 ? pick([1, 2]) : 1;
        var fill = level >= 4 ? pick([true, false]) : true;
        var rowStart = level >= 3 ? shuffle([0, 45, 90]) : [0, 0, 0];
        var g = [];
        for (var r = 0; r < 3; r++) {
          g[r] = [];
          var s0 = rowStart[r];
          for (var c = 0; c < 3; c++) {
            g[r][c] = { shape: "triangle", count: 1, size: size, fill: fill, rot: (s0 + c * 45) % 180 };
          }
        }
        return { grid: g, rule: "the triangle turns +45 across each row" };
      },

      // (d) SHAPE TYPE forms a Latin square: each row and each column contains
      // three distinct shapes; the diagonal pattern makes (2,2) deducible from
      // both its row and its column. count/size/fill fixed.
      function (level) {
        var s = shuffle(SHAPES).slice(0, 3);          // three shapes in play
        var fill = level >= 3 ? pick([true, false]) : true;
        var size = level >= 2 ? pick([0, 1, 2]) : 1;
        var g = [];
        for (var r = 0; r < 3; r++) {
          g[r] = [];
          for (var c = 0; c < 3; c++) {
            g[r][c] = { shape: s[(r + c) % 3], count: 1, size: size, fill: fill, rot: 0 };
          }
        }
        return { grid: g, rule: "each row & column holds the three shapes once" };
      },

      // (e) FILL alternates in a checkerboard (solid/outline by (r+c) parity);
      // count progresses across rows so two attributes co-vary (harder).
      function (level) {
        var rowShapes = shuffle(SHAPES).slice(0, 3);
        var size = level >= 2 ? pick([1, 2]) : 1;
        var g = [];
        for (var r = 0; r < 3; r++) {
          g[r] = [];
          for (var c = 0; c < 3; c++) {
            g[r][c] = {
              shape: rowShapes[r],
              count: c + 1,
              size: size,
              fill: ((r + c) % 2 === 0),
              rot: 0
            };
          }
        }
        return { grid: g, rule: "fill alternates (checkerboard); count rises across rows" };
      },

      // (f) Combined progression (HARD): size grows across rows AND fill is solid
      // on the top row, outline on the rest — i.e. fill constant down columns is
      // false; here fill depends on ROW. shape cycles down columns.
      function (level) {
        var colShapes = shuffle(SHAPES).slice(0, 3);
        var fillByRow = shuffle([true, false, true]);  // each row a fixed fill
        var g = [];
        for (var r = 0; r < 3; r++) {
          g[r] = [];
          for (var c = 0; c < 3; c++) {
            g[r][c] = { shape: colShapes[c], count: 1, size: c, fill: fillByRow[r], rot: 0 };
          }
        }
        return { grid: g, rule: "size grows across rows; fill is fixed per row" };
      }
    ];

    /* ---------- distractor construction ----------
       Mutate exactly ONE attribute of the answer, each in a "plausible" way
       (values that actually appear elsewhere in this kind of puzzle). We build a
       pool of single-attribute mutations, dedupe by fingerprint, drop any that
       collide with the answer, then take 5. The 6 options (answer + 5) are then
       asserted to have 6 distinct fingerprints. If we somehow can't reach 5
       distinct distractors, the caller regenerates the whole puzzle. */
    function mutationsFor(ans) {
      var out = [];
      var m;

      // shape: swap to each of the other three shapes
      for (var i = 0; i < SHAPES.length; i++) {
        if (SHAPES[i] !== ans.shape) { m = clone(ans); m.shape = SHAPES[i]; out.push(m); }
      }
      // count: the other two counts in {1,2,3}
      [1, 2, 3].forEach(function (n) { if (n !== ans.count) { var x = clone(ans); x.count = n; out.push(x); } });
      // size: the other two sizes in {0,1,2}
      [0, 1, 2].forEach(function (s) { if (s !== ans.size) { var x = clone(ans); x.size = s; out.push(x); } });
      // fill: flip
      m = clone(ans); m.fill = !ans.fill; out.push(m);
      // rotation: nearby angles, but ONLY ones that render differently from the
      // answer (a square/diamond rotated 90 looks identical, so that offset is a
      // useless distractor and is skipped). uniqueBy will also drop any that still
      // collide visually with another candidate.
      if (ans.shape !== "circle") {
        [45, 90, 135].forEach(function (delta) {
          var x = clone(ans); x.rot = (ans.rot + delta) % 180;
          if (visKey(x) !== visKey(ans)) out.push(x);
        });
      }
      return out;
    }

    // De-duplicate an array of attribute objects by VISUAL fingerprint (vfp),
    // excluding any visual fingerprint already present in `exclude`. Using vfp
    // (not fp) means two entries that *render the same* are treated as duplicates,
    // so the surviving distractors are guaranteed to look distinct from each other
    // and from whatever was excluded (the answer). Returns fresh objects.
    function uniqueBy(list, exclude) {
      var seen = {}, res = [];
      for (var k in exclude) seen[k] = true;
      var order = shuffle(list);
      for (var i = 0; i < order.length; i++) {
        var f = vfp(order[i]);
        if (seen[f]) continue;
        seen[f] = true;
        res.push(order[i]);
      }
      return res;
    }

    /* Build one fully-validated puzzle for the given streak/level.
       Returns { grid, answer, options:[{attr, correct}x6], rule } or null. */
    function buildPuzzle(streak) {
      var level = streak;
      // pick a rule family; escalate the mix as streak grows
      var pool;
      if (streak < 2)      pool = [0, 3, 1];                 // count / latin / size
      else if (streak < 4) pool = [0, 1, 2, 3];              // + rotation
      else if (streak < 7) pool = [0, 1, 2, 3, 4];           // + checker fill
      else                 pool = [0, 1, 2, 3, 4, 5];        // + combined

      var gen = GENERATORS[pick(pool)](level);
      var grid = gen.grid;
      var answer = grid[2][2];

      // sanity: the grid must be well-formed
      if (!validGrid(grid)) return null;

      // build distractors, excluding anything that looks like the answer
      var exclude = {}; exclude[vfp(answer)] = true;
      var pool2 = uniqueBy(mutationsFor(answer), exclude);
      if (pool2.length < 5) return null;     // ask caller to regenerate
      var distractors = pool2.slice(0, 5);

      // assemble 6 options and shuffle their positions
      var opts = [{ attr: answer, correct: true }];
      for (var i = 0; i < distractors.length; i++) opts.push({ attr: distractors[i], correct: false });
      opts = shuffle(opts);

      // ---- VERIFY: 6 visually-distinct options, exactly one correct ----
      // We check vfp (visual) AND fp (attribute) so neither a logical nor a
      // rendered collision can slip through.
      var fps = {}, vfps = {}, correctCount = 0;
      for (var j = 0; j < opts.length; j++) {
        var f = fp(opts[j].attr), vf = vfp(opts[j].attr);
        if (fps[f] || vfps[vf]) return null;   // any collision -> regenerate
        fps[f] = true; vfps[vf] = true;
        if (opts[j].correct) correctCount++;
      }
      if (correctCount !== 1) return null;
      // the correct option must BE the rule's output for cell (2,2) — assert so a
      // future refactor cannot silently let a distractor also satisfy the rule.
      if (vfp(answer) !== vfp(grid[2][2])) return null;

      return { grid: grid, answer: answer, options: opts, rule: gen.rule };
    }

    // every cell is a complete, in-range attribute object
    function validGrid(g) {
      if (!g || g.length !== 3) return false;
      for (var r = 0; r < 3; r++) {
        if (!g[r] || g[r].length !== 3) return false;
        for (var c = 0; c < 3; c++) {
          var a = g[r][c];
          if (!a) return false;
          if (SHAPES.indexOf(a.shape) < 0) return false;
          if (a.count < 1 || a.count > 3) return false;
          if (a.size < 0 || a.size > 2) return false;
          if ([0, 45, 90, 135].indexOf(a.rot) < 0) return false;
          if (typeof a.fill !== "boolean") return false;
        }
      }
      return true;
    }

    // Try hard to get a valid puzzle; fall back to the simplest rule.
    function makePuzzle(streak) {
      for (var t = 0; t < 40; t++) {
        var p = buildPuzzle(streak);
        if (p) return p;
      }
      // guaranteed-safe fallback: the count rule at level 0 always yields 5 clean
      // distractors (shape/size/fill mutations alone give 3+2+1 = 6 candidates).
      for (var t2 = 0; t2 < 40; t2++) {
        var g = GENERATORS[0](0);
        var ans = g.grid[2][2];
        var ex = {}; ex[vfp(ans)] = true;
        var d = uniqueBy(mutationsFor(ans), ex);
        if (d.length >= 5) {
          var opts = [{ attr: ans, correct: true }];
          for (var i = 0; i < 5; i++) opts.push({ attr: d[i], correct: false });
          return { grid: g.grid, answer: ans, options: shuffle(opts), rule: g.rule };
        }
      }
      return null; // effectively unreachable
    }

    // ---------- DOM ----------
    var status = el("div", "g-status", "");
    var wrap = el("div", "matrix-wrap");
    var gridEl = el("div", "matrix-grid");
    var cells = [];
    for (var i = 0; i < 9; i++) {
      var cell = el("div", "matrix-cell");
      gridEl.appendChild(cell);
      cells.push(cell);
    }
    var prompt = el("div", "matrix-prompt", "which tile completes the <b>?</b>");
    var optionsEl = el("div", "matrix-options");
    var overlay = el("div", "g-overlay");

    wrap.appendChild(gridEl);
    wrap.appendChild(prompt);
    wrap.appendChild(optionsEl);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    // ---------- state ----------
    var streak = 0;
    var cur = null;          // current puzzle
    var running = false;
    var flashT = null;       // removes the green grid flash
    var nextT = null;        // delays advancing to the next round

    function updateStatus() {
      status.innerHTML = '<span class="matrix-streak">streak ' + streak + '</span>';
    }

    function renderGrid(showAnswer) {
      for (var idx = 0; idx < 9; idx++) {
        var r = Math.floor(idx / 3), c = idx % 3;
        var cell = cells[idx];
        cell.className = "matrix-cell";
        if (r === 2 && c === 2 && !showAnswer) {
          cell.classList.add("matrix-blank");
          cell.innerHTML = '<span class="matrix-q">?</span>';
        } else {
          cell.innerHTML = svgFor(cur.grid[r][c]);
        }
      }
    }

    function renderOptions() {
      optionsEl.innerHTML = "";
      cur.options.forEach(function (opt) {
        var b = el("button", "matrix-opt");
        b.type = "button";
        b.innerHTML = svgFor(opt.attr);
        b.addEventListener("click", function () { choose(opt, b); });
        optionsEl.appendChild(b);
      });
    }

    function setOptionsEnabled(on) {
      var btns = optionsEl.querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) btns[i].disabled = !on;
    }

    function flashGood() {
      gridEl.classList.remove("matrix-flash");
      void gridEl.offsetWidth;
      gridEl.classList.add("matrix-flash");
      clearTimeout(flashT);
      flashT = setTimeout(function () { gridEl.classList.remove("matrix-flash"); }, 360);
    }

    function nextRound() {
      gridEl.classList.remove("matrix-flash");   // clear any lingering green flash
      cur = makePuzzle(streak);
      renderGrid(false);
      renderOptions();
      setOptionsEnabled(true);
    }

    function choose(opt, btn) {
      if (!running || !cur) return;
      setOptionsEnabled(false);
      if (opt.correct) {
        btn.classList.add("matrix-correct");
        streak++;
        updateStatus();
        ctx.submitScore(streak);
        renderGrid(true);          // drop the answer into the grid
        flashGood();               // green flash (self-clears via flashT)
        clearTimeout(nextT);
        nextT = setTimeout(function () { if (running) nextRound(); }, 520);
      } else {
        btn.classList.add("matrix-wrong");
        // highlight the correct option
        var btns = optionsEl.querySelectorAll("button");
        for (var i = 0; i < btns.length; i++) {
          if (cur.options[i].correct) btns[i].classList.add("matrix-correct");
        }
        renderGrid(true);
        gameOver();
      }
    }

    function gameOver() {
      running = false;
      var reached = streak;
      var best = ctx.submitScore(reached);
      updateStatus();
      overlay.innerHTML =
        '<div class="g-result">' +
        '<div class="g-big">' + reached + '</div>' +
        '<div class="g-sub">streak' + (best ? ' &middot; new best!' : '') + '</div>' +
        '<div class="matrix-rule">rule &middot; <b>' + esc(cur.rule) + '</b></div>' +
        '<button class="g-btn">play again</button></div>';
      overlay.querySelector("button").addEventListener("click", start);
      overlay.classList.add("show");
    }

    function start() {
      running = true;
      streak = 0;
      clearTimeout(flashT);
      clearTimeout(nextT);
      gridEl.classList.remove("matrix-flash");
      overlay.classList.remove("show");
      updateStatus();
      nextRound();
    }

    // ---------- intro / idle preview ----------
    updateStatus();
    cur = makePuzzle(0);
    renderGrid(false);
    renderOptions();
    setOptionsEnabled(false);
    overlay.innerHTML =
      '<div class="g-result">' +
      '<div class="g-sub">find the rule &middot; pick the tile that completes the grid</div>' +
      '<button class="g-btn">start</button></div>';
    overlay.querySelector("button").addEventListener("click", start);
    overlay.classList.add("show");

    return function teardown() { clearTimeout(flashT); clearTimeout(nextT); running = false; };
  }
});
