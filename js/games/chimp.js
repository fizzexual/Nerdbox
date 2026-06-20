/* Chimp Test — numbers appear, then hide. Click them in order. Are you smarter than a chimp? */
NERDBOX.register({
  id: "chimp",
  name: "Chimp Test",
  tagline: "click the numbers in order, from memory",
  category: "memory",
  scoreMode: "max",
  formatScore: function (v) { return v + " tiles"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3M4 12h3M4 17h3"/><path d="M11 5l3 14"/><path d="M20 7l-4 10"/></svg>',
  mount: function (root, ctx) {
    var TOTAL = 40, N = 4, expecting = 1, hidden = false;
    var status = ctx.util.el("div", "g-status", "");
    var grid = ctx.util.el("div", "chimp-grid");
    var overlay = ctx.util.el("div", "g-overlay");
    var wrap = ctx.util.el("div", "chimp-wrap");
    wrap.appendChild(grid); wrap.appendChild(overlay);
    root.appendChild(status); root.appendChild(wrap);

    function startBtn(label, sub, onClick) {
      overlay.innerHTML = '<div class="g-result">' + (sub ? '<div class="g-big">' + sub.big + '</div><div class="g-sub">' + sub.text + "</div>" : "") +
        '<button class="g-btn">' + label + "</button></div>";
      overlay.querySelector("button").addEventListener("click", onClick);
      overlay.classList.add("show");
    }
    function layout() {
      overlay.classList.remove("show");
      hidden = false; expecting = 1;
      var spots = ctx.util.shuffle(Array.apply(null, { length: TOTAL }).map(function (_, i) { return i; })).slice(0, N);
      grid.innerHTML = "";
      for (var i = 0; i < TOTAL; i++) {
        var cell = ctx.util.el("button", "chimp-cell");
        var n = spots.indexOf(i);
        if (n >= 0) {
          cell.classList.add("filled");
          cell.textContent = String(n + 1);
          cell.dataset.n = n + 1;
          cell.addEventListener("click", onCell);
        } else {
          cell.classList.add("empty");
        }
        grid.appendChild(cell);
      }
      status.textContent = "click 1 → " + N + " in order";
    }
    function hide() {
      hidden = true;
      var fs = grid.querySelectorAll(".filled");
      for (var i = 0; i < fs.length; i++) {
        if (!fs[i].classList.contains("done")) { fs[i].classList.add("covered"); fs[i].textContent = ""; }
      }
    }
    function onCell() {
      if (this.classList.contains("done")) return;
      var n = Number(this.dataset.n);
      if (n === expecting) {
        if (expecting === 1 && !hidden) { hide(); }
        this.classList.add("done"); this.classList.remove("covered"); this.textContent = "";
        expecting++;
        if (expecting > N) {
          ctx.submitScore(N);
          N++;
          status.textContent = "nice — next round";
          setTimeout(layout, 550);
        }
      } else {
        gameOver();
      }
    }
    function gameOver() {
      status.textContent = "game over";
      startBtn("play again", { big: N - 1, text: "tiles remembered" }, function () { N = 4; layout(); });
    }

    status.textContent = "ready?";
    startBtn("start", null, function () { N = 4; layout(); });
    return function () {};
  }
});
