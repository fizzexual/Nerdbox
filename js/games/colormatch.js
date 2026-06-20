/* Color Match — spot the one tile that's a slightly different shade. It gets harder. */
NERDBOX.register({
  id: "colormatch",
  name: "Color Match",
  tagline: "spot the odd shade out",
  category: "knowledge",
  scoreMode: "max",
  formatScore: function (v) { return v + " streak"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="11.5" r="2.5"/><circle cx="17.5" cy="13.5" r="2.5"/><path d="M12 22a10 10 0 1 1 0-20 6 6 0 0 0 0 12 4 4 0 0 1 0 8z"/></svg>',
  mount: function (root, ctx) {
    var rand = ctx.util.rand, shuffle = ctx.util.shuffle;
    var streak = 0, oddTile = null;
    var status = ctx.util.el("div", "g-status", "");
    var grid = ctx.util.el("div", "cm-grid");
    var overlay = ctx.util.el("div", "g-overlay");
    var wrap = ctx.util.el("div", "cm-wrap");
    wrap.appendChild(grid); wrap.appendChild(overlay);
    root.appendChild(status); root.appendChild(wrap);

    function rc() { return [rand(256), rand(256), rand(256)]; }
    function css(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }
    function perturb(c, d) {
      var out = c.slice();
      var chans = shuffle([0, 1, 2]).slice(0, 1 + rand(2));
      chans.forEach(function (ch) {
        var sign = c[ch] + d > 255 ? -1 : (c[ch] - d < 0 ? 1 : (rand(2) ? 1 : -1));
        out[ch] = Math.max(0, Math.min(255, c[ch] + sign * d));
      });
      return out;
    }
    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      overlay.querySelector("button").addEventListener("click", function () { overlay.classList.remove("show"); onPlay(); });
      overlay.classList.add("show");
    }
    function start() { streak = 0; round(); }
    function round() {
      overlay.classList.remove("show");
      var cols = Math.min(2 + Math.floor(streak / 2), 6);
      var count = cols * cols;
      var delta = Math.max(8, 90 - streak * 5);
      var base = rc(), odd = perturb(base, delta), oddIndex = rand(count);
      grid.style.gridTemplateColumns = "repeat(" + cols + ", 1fr)";
      grid.innerHTML = "";
      for (var i = 0; i < count; i++) {
        var t = ctx.util.el("button", "cm-tile");
        t.style.background = css(i === oddIndex ? odd : base);
        if (i === oddIndex) oddTile = t;
        t.addEventListener("click", pick);
        grid.appendChild(t);
      }
      status.innerHTML = '<span class="gl-score">streak ' + streak + "</span>";
    }
    function pick() {
      if (this === oddTile) {
        streak++;
        ctx.submitScore(streak);
        round();
      } else {
        oddTile.classList.add("cm-reveal");
        showOverlay('<div class="g-result"><div class="g-big">' + streak + '</div><div class="g-sub">best streak this run</div><button class="g-btn">play again</button></div>', start);
      }
    }

    status.textContent = "find the tile that doesn't match";
    showOverlay('<button class="g-btn">start</button>', start);
    return function () {};
  }
});
