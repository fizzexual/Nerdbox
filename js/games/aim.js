/* Aim Trainer — pop 30 targets as fast as you can; score = avg ms per target. */
NERDBOX.register({
  id: "aim",
  name: "Aim Trainer",
  tagline: "pop 30 targets, fast",
  category: "reflex",
  scoreMode: "min",
  formatScore: function (v) { return v + " ms"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/></svg>',
  mount: function (root, ctx) {
    var TARGETS = 30, SIZE = 46;
    var info = ctx.util.el("div", "aim-info", "");
    var stage = ctx.util.el("div", "aim-stage");
    root.appendChild(info);
    root.appendChild(stage);

    var count = 0, total = 0, spawnT = 0, running = false;

    function showStart(label) {
      info.textContent = "click the targets the moment they appear";
      stage.innerHTML = '<button class="g-btn aim-start">' + label + "</button>";
      stage.querySelector(".aim-start").addEventListener("click", start);
    }
    function start() {
      running = true; count = 0; total = 0;
      stage.innerHTML = "";
      info.textContent = "0 / " + TARGETS;
      spawn();
    }
    function spawn() {
      var r = stage.getBoundingClientRect();
      var maxX = Math.max(0, r.width - SIZE), maxY = Math.max(0, r.height - SIZE);
      var t = ctx.util.el("button", "aim-target");
      t.style.left = (Math.random() * maxX) + "px";
      t.style.top = (Math.random() * maxY) + "px";
      t.style.width = t.style.height = SIZE + "px";
      spawnT = performance.now();
      t.addEventListener("click", function (e) { e.stopPropagation(); hit(t); });
      stage.appendChild(t);
    }
    function hit(t) {
      if (!running) return;
      total += performance.now() - spawnT;
      count++;
      t.remove();
      if (count >= TARGETS) finish();
      else { info.textContent = count + " / " + TARGETS; spawn(); }
    }
    function finish() {
      running = false;
      var avg = Math.round(total / TARGETS);
      var best = ctx.submitScore(avg);
      info.textContent = "done!";
      stage.innerHTML =
        '<div class="g-result"><div class="g-big">' + avg + ' ms</div>' +
        '<div class="g-sub">avg per target' + (best ? " · new best!" : "") + "</div>" +
        '<button class="g-btn aim-start">play again</button></div>';
      stage.querySelector(".aim-start").addEventListener("click", start);
    }

    showStart("start");
    return function () { running = false; };
  }
});
