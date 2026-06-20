/* Visual Search — selective-attention drill. Each round the stage fills with many
   DISTRACTOR glyphs ("L" at assorted rotations) and exactly ONE TARGET that differs
   ("T", or — as you climb — a rotated "L" that's the odd man out among look-alikes).
   Click the odd one out. Correct → found++ and a harder round (MORE items, SUBTLER
   difference). One wrong click → game over: the target is revealed, best is shown.
   Score = rounds found in a run (MAX). formatScore -> e.g. "9 found". */
NERDBOX.injectStyle("visualsearch", `
.visualsearch-wrap { width: 100%; max-width: 600px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; }
.visualsearch-status {
  font-family: "JetBrains Mono", monospace; color: var(--sub); font-size: 1rem;
  margin-bottom: 1rem; min-height: 1.4em; display: flex; gap: 1.6rem;
  justify-content: center; align-items: baseline; flex-wrap: wrap;
}
.visualsearch-status b { color: var(--text); font-weight: 500; }
.visualsearch-found { color: var(--accent); font-weight: 700; font-size: 1.25rem; min-width: 1.4em; display: inline-block; text-align: center; }

.visualsearch-stage { position: relative; width: 100%; }
.visualsearch-grid {
  display: grid; gap: clamp(2px, 0.9vw, 7px); width: 100%;
  background: var(--bg-alt); border: 1px solid var(--sub-alt);
  border-radius: 12px; padding: clamp(6px, 1.6vw, 12px);
}
.visualsearch-cell {
  position: relative; border: 0; padding: 0; margin: 0;
  width: 100%; aspect-ratio: 1 / 1; border-radius: 7px;
  background: transparent; cursor: pointer; user-select: none;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.1s ease, transform 0.05s ease;
}
.visualsearch-cell:hover { background: rgba(127,127,127,0.12); }
.visualsearch-cell:active { transform: scale(0.92); }
.visualsearch-cell svg { width: 64%; height: 64%; display: block; overflow: visible; }
.visualsearch-cell svg path { stroke-linecap: round; stroke-linejoin: round; }
.visualsearch-grid.locked .visualsearch-cell { pointer-events: none; }

/* reveal states shown on game-over */
.visualsearch-cell.is-target { background: var(--go); }
.visualsearch-cell.is-target svg path { stroke: var(--bg); }
.visualsearch-cell.is-miss { background: var(--error); }
.visualsearch-cell.is-miss svg path { stroke: var(--bg); }
.visualsearch-cell.is-dim svg path { opacity: 0.28; }
.visualsearch-cell.pulse { animation: visualsearch-pulse 0.9s ease infinite; }
@keyframes visualsearch-pulse {
  0%, 100% { background: var(--go); }
  50% { background: var(--bg-alt); }
}

.visualsearch-foot { font-family: "JetBrains Mono", monospace; color: var(--sub); font-size: 0.9rem; margin-top: 1rem; }
.visualsearch-restart {
  border: 1px solid var(--sub-alt); background: transparent; color: var(--sub);
  border-radius: 8px; padding: 0.5rem 1.2rem;
  font-family: "JetBrains Mono", monospace; font-size: 0.9rem; cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.visualsearch-restart:hover { color: var(--text); border-color: var(--accent); background: var(--bg-alt); }
`);

NERDBOX.register({
  id: "visualsearch",
  name: "Visual Search",
  tagline: "find the odd one out, fast",
  category: "attention",
  scoreMode: "max",
  formatScore: function (v) { return v + " found"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M11 8v6M8.5 8h5"/></svg>',
  mount: function (root, ctx) {
    // ---- glyph geometry (drawn in a 0..24 box, centered) ----
    // an "L": vertical stroke + short foot. A "T": vertical stroke + top bar.
    var L_PATH = "M9 4 V20 H18";          // corner bottom-left
    var T_PATH = "M5 5 H19 M12 5 V20";    // bar on top, stem down

    var stroke = (ctx.themeColor && ctx.themeColor("text")) || "currentColor";

    // build one rotated glyph svg. `path` is the shape, `deg` its rotation,
    // `tint` lets the subtle-colour round shift the target a touch.
    function glyphSVG(path, deg, tint) {
      var col = tint || stroke;
      return '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="' + path + '" fill="none" stroke="' + col +
        '" stroke-width="2.4" transform="rotate(' + deg + ' 12 12)"/></svg>';
    }

    var START = 16;   // items in round 1
    var found = 0;
    var locked = true;
    var cells = [];        // { btn, isTarget }
    var targetIdx = -1;
    var overTimer = null;

    var wrap = ctx.util.el("div", "visualsearch-wrap");
    var status = ctx.util.el("div", "visualsearch-status",
      '<span>found <span class="visualsearch-found">0</span></span>' +
      '<span>items <b class="visualsearch-count">—</b></span>');
    var stage = ctx.util.el("div", "visualsearch-stage");
    var grid = ctx.util.el("div", "visualsearch-grid");
    var overlay = ctx.util.el("div", "g-overlay");
    stage.appendChild(grid);
    stage.appendChild(overlay);

    var foot = ctx.util.el("div", "visualsearch-foot");
    var restartBtn = ctx.util.el("button", "visualsearch-restart", "restart");
    restartBtn.type = "button";
    foot.appendChild(restartBtn);

    wrap.appendChild(status);
    wrap.appendChild(stage);
    wrap.appendChild(foot);
    root.appendChild(wrap);

    var foundEl = status.querySelector(".visualsearch-found");
    var countEl = status.querySelector(".visualsearch-count");

    // how many items this round (grows with score, capped so it stays clickable)
    function itemsFor(n) { return Math.min(START + n * 4, 100); }

    // pick the nearest perfect-ish columns for `total` cells -> squarish grid
    function colsFor(total) {
      var c = Math.ceil(Math.sqrt(total));
      return Math.max(4, c);
    }

    // ---- difference model: gets subtler as `n` (found) climbs ----
    // Round 0..2  : T among L   — very obvious (different shape).
    // Round 3..6  : odd-rotation L among uniform L — orientation pop-out, shrinking gap.
    // Round 7+    : odd-rotation L + the gap keeps tightening toward hard.
    function roundConfig(n) {
      if (n < 3) {
        // shape difference: distractor L (random rotations), target T.
        return { mode: "shape" };
      }
      // rotation difference: every distractor shares one base rotation;
      // the target is the same L rotated by `delta` degrees. Smaller delta = harder.
      var delta = Math.max(18, 90 - (n - 3) * 9); // 90,81,...down to a floor of 18
      return { mode: "rot", delta: delta };
    }

    function buildRound() {
      clearTimeout(overTimer);
      grid.innerHTML = "";
      grid.classList.remove("locked");
      cells = [];

      var total = itemsFor(found);
      var cols = colsFor(total);
      grid.style.gridTemplateColumns = "repeat(" + cols + ", 1fr)";
      countEl.textContent = String(total);

      var cfg = roundConfig(found);
      targetIdx = ctx.util.rand(total);

      // precompute distractor look for "rot" mode so every distractor matches
      var baseRot = ctx.util.rand(360);
      var sign = ctx.util.rand(2) ? 1 : -1;

      for (var i = 0; i < total; i++) {
        var isTarget = (i === targetIdx);
        var html;
        if (cfg.mode === "shape") {
          if (isTarget) {
            html = glyphSVG(T_PATH, ctx.util.rand(4) * 90, null); // a T (clearly odd)
          } else {
            html = glyphSVG(L_PATH, ctx.util.rand(360), null);    // L at any angle
          }
        } else {
          // rotation pop-out: all distractors identical, target offset by delta
          if (isTarget) {
            html = glyphSVG(L_PATH, baseRot + sign * cfg.delta, null);
          } else {
            html = glyphSVG(L_PATH, baseRot, null);
          }
        }

        var btn = ctx.util.el("button", "visualsearch-cell", html);
        btn.type = "button";
        btn.setAttribute("aria-label", isTarget ? "target" : "distractor");
        (function (target, b) {
          b.addEventListener("click", function () { onPick(target, b); });
        })(isTarget, btn);
        grid.appendChild(btn);
        cells.push({ btn: btn, isTarget: isTarget });
      }

      locked = false;
    }

    function onPick(isTarget, btn) {
      if (locked) return;
      if (isTarget) {
        found++;
        foundEl.textContent = String(found);
        ctx.submitScore(found);          // MAX = rounds found this run
        buildRound();                    // harder next round
      } else {
        gameOver(btn);                   // clicked a distractor
      }
    }

    function gameOver(missBtn) {
      locked = true;
      grid.classList.add("locked");
      // reveal: dim everything, flash the wrong pick, spotlight the real target
      cells.forEach(function (c) {
        if (c.isTarget) { c.btn.classList.add("is-target", "pulse"); }
        else { c.btn.classList.add("is-dim"); }
      });
      if (missBtn) { missBtn.classList.remove("is-dim"); missBtn.classList.add("is-miss"); }

      var best = ctx.submitScore(found);
      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-big">' + found + ' found</div>' +
          '<div class="g-sub">that wasn\'t the odd one out' +
            (best ? ' · new best!' : '') + ' — the target is glowing</div>' +
          '<button class="g-btn" type="button" data-act="again">play again</button>' +
        '</div>';
      overlay.classList.add("show");
      overlay.querySelector('[data-act="again"]')
        .addEventListener("click", reset);
    }

    function reset() {
      clearTimeout(overTimer);
      overlay.classList.remove("show");
      found = 0;
      foundEl.textContent = "0";
      buildRound();
    }

    restartBtn.addEventListener("click", reset);

    function showStart() {
      // calm preview round behind the overlay
      buildRound();
      locked = true;
      grid.classList.add("locked");
      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-sub">one glyph is different — a "T" hiding among "L"s, ' +
            'then odd rotations. click it. each round adds more items and a subtler ' +
            'difference. one wrong click ends the run.</div>' +
          '<button class="g-btn" type="button" data-act="start">start</button>' +
        '</div>';
      overlay.classList.add("show");
      overlay.querySelector('[data-act="start"]')
        .addEventListener("click", function () {
          overlay.classList.remove("show");
          buildRound(); // fresh, unlocked
        });
    }

    showStart();

    // teardown: kill any pending timer
    return function () {
      clearTimeout(overTimer);
    };
  }
});
