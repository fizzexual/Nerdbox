/* Schulte Table — a square S×S grid holds the numbers 1..S² in random order.
   Click them in ascending order (1,2,3,…) as fast as you can. Clearing a grid
   advances to a BIGGER one (S+1, up to 8). Classic attention / visual-search drill.
   Score = the largest grid size cleared (MAX). formatScore -> e.g. "7×7". */
NERDBOX.injectStyle("schulte", `
.schulte-wrap { width: 100%; max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; }
.schulte-status {
  font-family: "JetBrains Mono", monospace; color: var(--sub); font-size: 1rem;
  margin-bottom: 1rem; min-height: 1.4em; display: flex; gap: 1.6rem;
  justify-content: center; align-items: baseline; flex-wrap: wrap;
}
.schulte-status b { color: var(--text); font-weight: 500; }
.schulte-find { color: var(--sub); }
.schulte-target {
  color: var(--accent); font-weight: 700; font-size: 1.5rem;
  min-width: 1.6em; display: inline-block; text-align: center;
}
.schulte-time { color: var(--sub); min-width: 4.6em; text-align: right; font-variant-numeric: tabular-nums; }

.schulte-stage { position: relative; width: 100%; }
.schulte-grid {
  display: grid; gap: clamp(4px, 1.2vw, 9px); width: 100%;
}
.schulte-cell {
  position: relative; border: 1px solid var(--sub-alt); padding: 0; margin: 0;
  width: 100%; aspect-ratio: 1 / 1; border-radius: 10px;
  background: var(--bg-alt); color: var(--text);
  font-family: "JetBrains Mono", monospace; font-weight: 700; line-height: 1;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; user-select: none;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease, transform 0.06s ease;
}
.schulte-cell:hover { border-color: var(--accent); }
.schulte-cell:active { transform: translateY(1px); }
.schulte-cell.is-found {
  background: var(--go); border-color: var(--go); color: var(--bg);
  cursor: default; opacity: 0.55;
}
.schulte-cell.is-found:hover { border-color: var(--go); }
.schulte-cell.is-wrong { animation: schulte-flash 0.34s ease; }
@keyframes schulte-flash {
  0%, 100% { background: var(--bg-alt); border-color: var(--sub-alt); }
  30% { background: var(--error); border-color: var(--error); color: var(--bg); }
}
.schulte-grid.locked .schulte-cell { pointer-events: none; }

/* font scales down as the grid grows so big tables stay legible & responsive */
.schulte-grid[data-s="5"] .schulte-cell { font-size: clamp(1rem, 6vw, 1.7rem); }
.schulte-grid[data-s="6"] .schulte-cell { font-size: clamp(0.9rem, 5vw, 1.45rem); }
.schulte-grid[data-s="7"] .schulte-cell { font-size: clamp(0.8rem, 4.3vw, 1.25rem); }
.schulte-grid[data-s="8"] .schulte-cell { font-size: clamp(0.72rem, 3.8vw, 1.1rem); }

.schulte-foot { font-family: "JetBrains Mono", monospace; color: var(--sub); font-size: 0.9rem; margin-top: 1rem; }
.schulte-restart {
  border: 1px solid var(--sub-alt); background: transparent; color: var(--sub);
  border-radius: 8px; padding: 0.5rem 1.2rem;
  font-family: "JetBrains Mono", monospace; font-size: 0.9rem; cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.schulte-restart:hover { color: var(--text); border-color: var(--accent); background: var(--bg-alt); }
`);

NERDBOX.register({
  id: "schulte",
  name: "Schulte Table",
  tagline: "find the numbers in order, fast",
  category: "attention",
  difficulty: "hard",
  scoreMode: "max",
  formatScore: function (v) { return v + "×" + v; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>',
  mount: function (root, ctx) {
    var START = 5;     // classic Schulte is 5×5
    var MAX = 8;       // cap — 8×8 is brutal

    var size = START;  // current grid side length S
    var target = 1;    // next number to click (1..size*size)
    var cells = [];    // { value, btn } indexed by DOM position
    var locked = true; // input disabled (idle / between-grid transition)
    var running = false;
    var startMs = 0;
    var rafId = null;
    var transTimer = null;

    var wrap = ctx.util.el("div", "schulte-wrap");
    var status = ctx.util.el("div", "schulte-status",
      '<span class="schulte-find">find <span class="schulte-target">—</span></span>' +
      '<span>grid <b class="schulte-size">—</b></span>' +
      '<span class="schulte-time">0.0s</span>');
    var stage = ctx.util.el("div", "schulte-stage");
    var grid = ctx.util.el("div", "schulte-grid");
    var overlay = ctx.util.el("div", "g-overlay");
    stage.appendChild(grid);
    stage.appendChild(overlay);

    var foot = ctx.util.el("div", "schulte-foot");
    var restartBtn = ctx.util.el("button", "schulte-restart", "restart at 5×5");
    restartBtn.type = "button";
    foot.appendChild(restartBtn);

    wrap.appendChild(status);
    wrap.appendChild(stage);
    wrap.appendChild(foot);
    root.appendChild(wrap);

    var targetEl = status.querySelector(".schulte-target");
    var sizeEl = status.querySelector(".schulte-size");
    var timeEl = status.querySelector(".schulte-time");

    /* ---------- timer (rAF, flavour only; starts on first click) ---------- */
    function stopTimerLoop() {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }
    function fmt(ms) { return (Math.floor(ms / 100) / 10).toFixed(1) + "s"; }
    function tick() {
      if (!running) return;
      timeEl.textContent = fmt(performance.now() - startMs);
      rafId = requestAnimationFrame(tick);
    }

    /* ---------- build an S×S grid of 1..S² in random order ---------- */
    function buildGrid() {
      clearTimeout(transTimer);
      stopTimerLoop();
      running = false;
      startMs = 0;
      target = 1;
      cells = [];
      grid.innerHTML = "";
      grid.dataset.s = size;
      grid.style.gridTemplateColumns = "repeat(" + size + ", 1fr)";

      var total = size * size;
      var values = [];
      for (var i = 1; i <= total; i++) values.push(i);
      values = ctx.util.shuffle(values);

      for (var k = 0; k < total; k++) {
        var v = values[k];
        var btn = ctx.util.el("button", "schulte-cell", String(v));
        btn.type = "button";
        btn.dataset.value = v;
        (function (val) {
          btn.addEventListener("click", function () { onClick(val, this); });
        })(v);
        grid.appendChild(btn);
        cells.push({ value: v, btn: btn });
      }

      locked = false;
      grid.classList.remove("locked");
      sizeEl.textContent = size + "×" + size;
      timeEl.textContent = "0.0s";
      refreshTarget();
    }

    function refreshTarget() {
      targetEl.textContent = target <= size * size ? String(target) : "✓";
    }

    function onClick(value, btn) {
      if (locked) return;                              // idle / between-grid / solved
      if (target > size * size) return;                // grid already cleared
      if (btn.classList.contains("is-found")) return;  // already taken

      if (value === target) {
        // correct next number
        if (target === 1) { running = true; startMs = performance.now(); tick(); }
        btn.classList.add("is-found");
        btn.classList.remove("is-wrong");
        target++;
        refreshTarget();
        if (target > size * size) solved();
      } else {
        // wrong — brief red flash, otherwise ignored
        btn.classList.remove("is-wrong");
        void btn.offsetWidth; // restart the animation
        btn.classList.add("is-wrong");
      }
    }

    /* ---------- a full grid cleared ---------- */
    function solved() {
      running = false;
      stopTimerLoop();
      locked = true;
      grid.classList.add("locked");

      var seconds = (Math.floor((performance.now() - startMs) / 100) / 10);
      timeEl.textContent = seconds.toFixed(1) + "s";
      targetEl.textContent = "✓";

      var isBest = ctx.submitScore(size); // MAX = largest grid cleared

      if (size >= MAX) {
        // beat the hardest table — show a finale, restart goes back to 5×5
        overlay.innerHTML =
          '<div class="g-result">' +
            '<div class="g-big">' + MAX + '×' + MAX + '</div>' +
            '<div class="g-sub">maxed out the table' + (isBest ? ' · new best!' : '') +
              ' — ' + seconds.toFixed(1) + 's</div>' +
            '<button class="g-btn" type="button" data-act="reset">play again</button>' +
          '</div>';
        overlay.classList.add("show");
        overlay.querySelector('[data-act="reset"]')
          .addEventListener("click", function () { reset(); });
        return;
      }

      // brief "solved" beat, then grow to the next bigger grid
      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-big">' + size + '×' + size + ' ✓</div>' +
          '<div class="g-sub">' + seconds.toFixed(1) + 's' +
            (isBest ? ' · new best!' : '') + ' — next: ' + (size + 1) + '×' + (size + 1) + '</div>' +
        '</div>';
      overlay.classList.add("show");
      transTimer = setTimeout(function () {
        overlay.classList.remove("show");
        size += 1;
        buildGrid();
      }, 1100);
    }

    /* ---------- (re)start the whole run at 5×5 ---------- */
    function reset() {
      clearTimeout(transTimer);
      stopTimerLoop();
      overlay.classList.remove("show");
      size = START;
      buildGrid();
    }

    restartBtn.addEventListener("click", reset);

    function showStart() {
      // calm preview grid behind the overlay
      size = START;
      buildGrid();
      locked = true;
      grid.classList.add("locked");
      targetEl.textContent = "1";
      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-sub">click the numbers in order — 1, 2, 3 … grids grow up to 8×8</div>' +
          '<button class="g-btn" type="button" data-act="start">start</button>' +
        '</div>';
      overlay.classList.add("show");
      overlay.querySelector('[data-act="start"]')
        .addEventListener("click", function () {
          overlay.classList.remove("show");
          buildGrid(); // fresh shuffle, unlocked
        });
    }

    showStart();

    /* ---------- teardown: kill every timer ---------- */
    return function () {
      running = false;
      stopTimerLoop();
      clearTimeout(transTimer);
    };
  }
});
