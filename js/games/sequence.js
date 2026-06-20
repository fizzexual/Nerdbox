/* Sequence Memory — watch the pattern, then repeat it. It grows each round. */
NERDBOX.register({
  id: "sequence",
  name: "Sequence Memory",
  tagline: "repeat the growing pattern",
  category: "memory",
  scoreMode: "max",
  formatScore: function (v) { return v + " rounds"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  mount: function (root, ctx) {
    var level = 0, seq = [], pos = 0, accepting = false, timers = [];
    var status = ctx.util.el("div", "g-status", "round 1");
    var board = ctx.util.el("div", "seq-board");
    var tiles = [];
    for (var i = 0; i < 4; i++) {
      var tile = ctx.util.el("button", "seq-tile seq-t" + i);
      tile.dataset.i = i;
      tile.addEventListener("click", onTile);
      board.appendChild(tile);
      tiles.push(tile);
    }
    var overlay = ctx.util.el("div", "g-overlay");
    overlay.innerHTML = '<button class="g-btn">start</button>';
    overlay.querySelector("button").addEventListener("click", function () { overlay.classList.remove("show"); startGame(); });
    var wrap = ctx.util.el("div", "seq-wrap");
    wrap.appendChild(board); wrap.appendChild(overlay);
    root.appendChild(status); root.appendChild(wrap);

    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }
    function flash(i, cls) { tiles[i].classList.add(cls || "lit"); later(function () { tiles[i].classList.remove(cls || "lit"); }, 320); }

    function startGame() { clearTimers(); level = 0; seq = []; nextRound(); }
    function nextRound() {
      level++; seq.push(ctx.util.rand(4)); pos = 0;
      status.textContent = "round " + level + " — watch";
      accepting = false;
      var i = 0;
      function step() {
        if (i >= seq.length) { accepting = true; status.textContent = "your turn"; return; }
        flash(seq[i]); i++; later(step, 600);
      }
      later(step, 550);
    }
    function onTile() {
      if (!accepting) return;
      var i = Number(this.dataset.i);
      flash(i, "lit-user");
      if (i === seq[pos]) {
        pos++;
        if (pos >= seq.length) {
          accepting = false;
          ctx.submitScore(level);
          status.textContent = "round " + level + " cleared ✓";
          later(nextRound, 750);
        }
      } else {
        accepting = false;
        gameOver();
      }
    }
    function gameOver() {
      status.textContent = "game over";
      overlay.innerHTML = '<div class="g-result"><div class="g-big">' + (level - 1) + '</div><div class="g-sub">rounds cleared</div><button class="g-btn">play again</button></div>';
      overlay.querySelector("button").addEventListener("click", function () { overlay.classList.remove("show"); startGame(); });
      overlay.classList.add("show");
    }

    overlay.classList.add("show");
    return function () { clearTimers(); };
  }
});
