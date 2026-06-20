/* Lights Out — click a cell to toggle it and its 4 neighbors. Turn every light off. */
NERDBOX.injectStyle("lightsout", `
.lightsout-wrap { position: relative; width: 100%; max-width: 360px; margin: 0 auto; }
.lightsout-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  width: 100%;
}
.lightsout-cell {
  position: relative;
  border: none;
  padding: 0;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  background: var(--bg-alt);
  cursor: pointer;
  transition: background 0.18s ease, transform 0.08s ease, box-shadow 0.18s ease;
}
.lightsout-cell:hover { transform: translateY(-1px); }
.lightsout-cell:active { transform: translateY(1px); }
.lightsout-cell.on {
  background: var(--accent);
  box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 55%, transparent);
}
.lightsout-grid.locked .lightsout-cell { cursor: default; pointer-events: none; }
.lightsout-bar {
  display: flex;
  gap: 1.4rem;
  justify-content: center;
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.95rem;
  margin-top: 1rem;
}
.lightsout-bar b { color: var(--text); font-weight: 500; }
.lightsout-actions { display: flex; justify-content: center; margin-top: 1.1rem; }
.lightsout-reset {
  border: 1px solid var(--sub-alt);
  background: transparent;
  color: var(--sub);
  border-radius: 8px;
  padding: 0.5rem 1.2rem;
  font-family: "JetBrains Mono", monospace;
  font-size: 0.9rem;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.lightsout-reset:hover { color: var(--text); border-color: var(--accent); background: var(--bg-alt); }
.lightsout-solved { color: var(--go) !important; }
`);

NERDBOX.register({
  id: "lightsout",
  name: "Lights Out",
  tagline: "turn every light off",
  category: "puzzle",
  scoreMode: "max",
  formatScore: function (v) { return v + " solved"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z"/></svg>',
  mount: function (root, ctx) {
    var SIZE = 5;
    var cells = SIZE * SIZE;
    var board = [];        // boolean[] length 25, true = lit
    var btns = [];         // cell <button> elements
    var streak = 0;
    var level = 1;
    var moves = 0;
    var solved = false;    // current level cleared (lock input during transition)
    var started = false;
    var timer = null;

    var bar = ctx.util.el("div", "lightsout-bar");
    var grid = ctx.util.el("div", "lightsout-grid");
    var overlay = ctx.util.el("div", "g-overlay");
    var wrap = ctx.util.el("div", "lightsout-wrap");
    wrap.appendChild(grid);
    wrap.appendChild(overlay);

    var actions = ctx.util.el("div", "lightsout-actions");
    var resetBtn = ctx.util.el("button", "lightsout-reset", "reset level");
    actions.appendChild(resetBtn);

    root.appendChild(bar);
    root.appendChild(wrap);
    root.appendChild(actions);

    // build the 25 cell buttons once
    for (var i = 0; i < cells; i++) {
      var b = ctx.util.el("button", "lightsout-cell");
      b.dataset.i = i;
      b.setAttribute("aria-label", "light");
      b.addEventListener("click", onCell);
      grid.appendChild(b);
      btns.push(b);
    }

    function later(fn, ms) { clearTimeout(timer); timer = setTimeout(fn, ms); }

    function idx(r, c) { return r * SIZE + c; }

    // toggle a cell and its 4 orthogonal neighbors, staying within bounds
    function press(r, c) {
      var deltas = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
      for (var d = 0; d < deltas.length; d++) {
        var nr = r + deltas[d][0];
        var nc = c + deltas[d][1];
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
          var k = idx(nr, nc);
          board[k] = !board[k];
        }
      }
    }

    function isAllOff() {
      for (var i = 0; i < cells; i++) if (board[i]) return false;
      return true;
    }

    // Build a guaranteed-solvable board: start all-off, apply `clicks` random
    // valid presses. Because each press is its own inverse, replaying those same
    // presses solves it — so any board reachable this way is solvable.
    function scramble(clicks) {
      board = [];
      for (var i = 0; i < cells; i++) board.push(false);
      var tries = 0;
      // re-scramble if we happen to land on an already-solved board
      do {
        for (var k = 0; k < cells; k++) board[k] = false;
        for (var n = 0; n < clicks; n++) {
          press(ctx.util.rand(SIZE), ctx.util.rand(SIZE));
        }
        tries++;
      } while (isAllOff() && tries < 20);
    }

    function scrambleCount(lvl) {
      // grows with level: lvl 1 -> 3, then +2 each level, capped so it stays sane
      return Math.min(3 + (lvl - 1) * 2, 18);
    }

    function render() {
      for (var i = 0; i < cells; i++) {
        if (board[i]) btns[i].classList.add("on");
        else btns[i].classList.remove("on");
      }
    }

    function updateBar(msg, msgClass) {
      if (msg) {
        bar.innerHTML = '<span class="' + (msgClass || "") + '">' + msg + "</span>";
      } else {
        bar.innerHTML =
          "<span>level&nbsp;<b>" + level + "</b></span>" +
          "<span>streak&nbsp;<b>" + streak + "</b></span>" +
          "<span>moves&nbsp;<b>" + moves + "</b></span>";
      }
    }

    // load (or reload) the current level. resetStreak=false keeps the streak,
    // it only re-scrambles the SAME level number.
    function loadLevel() {
      solved = false;
      moves = 0;
      grid.classList.remove("locked");
      scramble(scrambleCount(level));
      render();
      updateBar();
    }

    function onCell() {
      if (!started || solved) return;
      var i = Number(this.dataset.i);
      press(Math.floor(i / SIZE), i % SIZE);
      moves++;
      render();
      updateBar();
      if (isAllOff()) win();
    }

    function win() {
      solved = true;
      grid.classList.add("locked");
      streak++;
      ctx.submitScore(streak);
      updateBar("solved! ✓", "lightsout-solved");
      later(function () {
        level++;
        loadLevel();
      }, 850);
    }

    function startGame() {
      overlay.classList.remove("show");
      started = true;
      streak = 0;
      level = 1;
      loadLevel();
    }

    resetBtn.addEventListener("click", function () {
      if (!started || solved) return;
      // re-scramble the same level; streak unchanged
      loadLevel();
    });

    function showStart() {
      overlay.innerHTML = '<button class="g-btn">start</button>';
      overlay.querySelector("button").addEventListener("click", startGame);
      overlay.classList.add("show");
    }

    // initial idle state
    updateBar("turn every light off", "");
    // seed a calm preview board behind the overlay
    scramble(scrambleCount(1));
    render();
    grid.classList.add("locked");
    showStart();

    return function () { clearTimeout(timer); };
  }
});
