/* Reaction Time — click the instant the screen turns green. */
NERDBOX.register({
  id: "reaction",
  name: "Reaction Time",
  tagline: "click the instant it turns green",
  category: "reflex",
  scoreMode: "min",
  formatScore: function (v) { return v + " ms"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  mount: function (root, ctx) {
    var state = "idle", timer = null, startT = 0;
    var pad = ctx.util.el("button", "rt-pad rt-idle");
    root.appendChild(pad);

    function paint(cls, main, sub) {
      pad.className = "rt-pad " + cls;
      pad.innerHTML = '<div class="rt-main">' + main + "</div><div class=\"rt-sub\">" + sub + "</div>";
    }
    function arm() {
      state = "wait";
      paint("rt-wait", "wait for green", "...");
      timer = setTimeout(function () {
        state = "go"; startT = performance.now();
        paint("rt-go", "CLICK!", "now!");
      }, 1200 + Math.random() * 2800);
    }
    function click() {
      if (state === "idle") { arm(); }
      else if (state === "wait") { clearTimeout(timer); state = "idle"; paint("rt-soon", "too soon!", "click to try again"); }
      else if (state === "go") {
        var ms = Math.round(performance.now() - startT);
        var best = ctx.submitScore(ms);
        state = "idle";
        paint("rt-result", ms + " ms", (best ? "new best! · " : "") + "click to go again");
      }
    }
    pad.addEventListener("click", click);
    paint("rt-idle", "Reaction Time", "click to start");
    return function () { clearTimeout(timer); };
  }
});
