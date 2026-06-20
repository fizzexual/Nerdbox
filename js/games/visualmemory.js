/* Visual Memory — a grid of tiles flashes a pattern; click the tiles that lit up.
   Each level the grid and the lit-count grow. Three lives. scoreMode "max" =
   highest level reached. Self-contained: one injectStyle + one register. */
NERDBOX.injectStyle("visualmemory", `
.visualmemory-wrap { position: relative; width: 100%; max-width: 380px; margin: 0 auto; }
.visualmemory-grid {
  display: grid;
  gap: 8px;
  width: 100%;
}
.visualmemory-cell {
  position: relative;
  border: none;
  padding: 0;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  background: var(--bg-alt);
  cursor: pointer;
  transition: background 0.16s ease, transform 0.08s ease, box-shadow 0.16s ease;
}
.visualmemory-cell:hover { transform: translateY(-1px); }
.visualmemory-cell:active { transform: translateY(1px); }
.visualmemory-cell.flash {
  background: var(--accent);
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 55%, transparent);
}
.visualmemory-cell.good {
  background: var(--go);
  box-shadow: 0 0 16px color-mix(in srgb, var(--go) 55%, transparent);
}
.visualmemory-cell.bad {
  background: var(--error);
  box-shadow: 0 0 16px color-mix(in srgb, var(--error) 55%, transparent);
}
.visualmemory-grid.locked .visualmemory-cell { cursor: default; pointer-events: none; }
.visualmemory-bar {
  display: flex;
  gap: 1.6rem;
  justify-content: center;
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.95rem;
  margin-bottom: 1rem;
  min-height: 1.4em;
}
.visualmemory-bar b { color: var(--text); font-weight: 500; }
.visualmemory-bar .lives { letter-spacing: 0.15em; color: var(--error); }
.visualmemory-bar .lives .lost { color: var(--sub-alt); }
.visualmemory-msg { color: var(--go); font-family: "JetBrains Mono", monospace; }
`);

NERDBOX.register({
  id: "visualmemory",
  name: "Visual Memory",
  tagline: "remember which tiles lit up",
  category: "memory",
  scoreMode: "max",
  formatScore: function (v) { return v + " level"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M16.5 17.5l1.5 1.5 3-3"/></svg>',
  mount: function (root, ctx) {
    var MAX_LIVES = 3;
    var level = 1;
    var lives = MAX_LIVES;
    var lit = [];          // indices of tiles lit this level
    var found = 0;         // correct tiles clicked this level
    var size = 3;          // current grid side length
    var btns = [];         // current cell <button> elements
    var phase = "idle";    // idle | flash | input | between | over
    var timers = [];       // EVERY timer id — cleared on teardown

    var bar = ctx.util.el("div", "visualmemory-bar");
    var grid = ctx.util.el("div", "visualmemory-grid");
    var overlay = ctx.util.el("div", "g-overlay");
    var wrap = ctx.util.el("div", "visualmemory-wrap");
    wrap.appendChild(grid);
    wrap.appendChild(overlay);
    root.appendChild(bar);
    root.appendChild(wrap);

    function after(ms, fn) {
      var id = setTimeout(function () {
        // drop this id from the list, then run
        var k = timers.indexOf(id);
        if (k >= 0) timers.splice(k, 1);
        fn();
      }, ms);
      timers.push(id);
      return id;
    }
    function clearTimers() {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers = [];
    }

    function gridSize(lvl) { return Math.min(3 + Math.floor(lvl / 2), 7); }
    function litCount(lvl, cells) { return Math.min(lvl + 2, cells - 1); }

    function updateBar(msg) {
      if (msg) { bar.innerHTML = '<span class="visualmemory-msg">' + msg + "</span>"; return; }
      var hearts = "";
      for (var i = 0; i < MAX_LIVES; i++) {
        hearts += '<span class="' + (i < lives ? "" : "lost") + '">●</span>';
      }
      bar.innerHTML =
        "<span>level&nbsp;<b>" + level + "</b></span>" +
        '<span>lives&nbsp;<span class="lives">' + hearts + "</span></span>";
    }

    // build the grid for the current level and pick the lit tiles
    function buildLevel() {
      size = gridSize(level);
      var cells = size * size;
      var count = litCount(level, cells);
      var order = [];
      for (var i = 0; i < cells; i++) order.push(i);
      lit = ctx.util.shuffle(order).slice(0, count);
      found = 0;

      grid.style.gridTemplateColumns = "repeat(" + size + ", 1fr)";
      grid.innerHTML = "";
      btns = [];
      for (var c = 0; c < cells; c++) {
        var b = ctx.util.el("button", "visualmemory-cell");
        b.dataset.i = c;
        b.setAttribute("aria-label", "tile");
        b.addEventListener("click", onCell);
        grid.appendChild(b);
        btns.push(b);
      }
    }

    function isLit(i) { return lit.indexOf(i) >= 0; }

    // flash the lit tiles for ~1s, then hide and accept input
    function flashLevel() {
      phase = "flash";
      grid.classList.add("locked");
      updateBar();
      for (var i = 0; i < lit.length; i++) btns[lit[i]].classList.add("flash");
      after(1000, function () {
        for (var j = 0; j < lit.length; j++) btns[lit[j]].classList.remove("flash");
        phase = "input";
        grid.classList.remove("locked");
      });
    }

    function startLevel() {
      buildLevel();
      flashLevel();
    }

    function onCell() {
      if (phase !== "input") return;
      var i = Number(this.dataset.i);
      if (this.classList.contains("good") || this.classList.contains("bad")) return;

      if (isLit(i)) {
        this.classList.add("good");
        found++;
        if (found === lit.length) levelSolved();
      } else {
        this.classList.add("bad");
        lives--;
        updateBar();
        if (lives <= 0) { gameOver(); return; }
        // briefly mark the miss, then clear it so the tile is usable again
        var cell = this;
        after(420, function () { cell.classList.remove("bad"); });
      }
    }

    function levelSolved() {
      phase = "between";
      grid.classList.add("locked");
      ctx.submitScore(level);          // max -> highest level reached
      updateBar("level " + level + " cleared ✓");
      after(800, function () {
        level++;
        startLevel();
      });
    }

    function gameOver() {
      phase = "over";
      grid.classList.add("locked");
      // reveal the tiles that were missed so the result reads clearly
      for (var i = 0; i < lit.length; i++) {
        if (!btns[lit[i]].classList.contains("good")) btns[lit[i]].classList.add("flash");
      }
      updateBar();
      overlay.innerHTML =
        '<div class="g-result">' +
        '<div class="g-big">' + level + "</div>" +
        '<div class="g-sub">level reached</div>' +
        '<button class="g-btn">play again</button>' +
        "</div>";
      overlay.querySelector("button").addEventListener("click", startGame);
      overlay.classList.add("show");
    }

    function startGame() {
      clearTimers();
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      level = 1;
      lives = MAX_LIVES;
      startLevel();
    }

    function showStart() {
      overlay.innerHTML = '<button class="g-btn">start</button>';
      overlay.querySelector("button").addEventListener("click", startGame);
      overlay.classList.add("show");
    }

    // idle preview behind the start overlay
    level = 1;
    lives = MAX_LIVES;
    updateBar();
    buildLevel();
    grid.classList.add("locked");
    showStart();

    return function () { clearTimers(); };
  }
});
