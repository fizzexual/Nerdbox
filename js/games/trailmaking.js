/* Trail Making B — connect 1-A-2-B-3-C... in alternating order, fast.
   Executive / task-switching test. Score = seconds (one decimal), MIN is better. */
NERDBOX.injectStyle("trailmaking", `
  .trailmaking-wrap { width: 100%; display: flex; flex-direction: column; align-items: center; }
  .trailmaking-status { font-family: "JetBrains Mono", monospace; color: var(--sub); font-size: 1rem; margin-bottom: 0.9rem; min-height: 1.4em; display: flex; gap: 1.6rem; justify-content: center; align-items: baseline; flex-wrap: wrap; }
  .trailmaking-status b { color: var(--text); font-weight: 500; }
  .trailmaking-target { color: var(--accent); font-weight: 700; }
  .trailmaking-time { color: var(--sub); min-width: 4.2em; text-align: right; }
  .trailmaking-stage { position: relative; width: 100%; max-width: 720px; height: 62vh; max-height: 480px; background: var(--bg-alt); border-radius: 16px; overflow: hidden; }
  .trailmaking-node {
    position: absolute; width: 46px; height: 46px; border-radius: 50%;
    border: 2px solid var(--sub-alt); background: var(--bg);
    color: var(--text); font-family: "JetBrains Mono", monospace;
    font-size: 1.15rem; font-weight: 700; line-height: 1;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: transform 0.08s, border-color 0.12s, background 0.12s, color 0.12s;
    user-select: none; padding: 0;
  }
  .trailmaking-node:hover { transform: scale(1.08); }
  .trailmaking-node.is-next { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent); }
  .trailmaking-node.is-done { background: var(--go); border-color: var(--go); color: var(--bg); cursor: default; }
  .trailmaking-node.is-done:hover { transform: none; }
  .trailmaking-node.is-wrong { animation: trailmaking-flash 0.32s ease; border-color: var(--error); }
  @keyframes trailmaking-flash {
    0%, 100% { background: var(--bg); }
    30% { background: var(--error); color: var(--bg); border-color: var(--error); }
  }
  .trailmaking-hint { color: var(--sub); font-size: 0.95rem; margin-top: 0.4rem; }
`);

NERDBOX.register({
  id: "trailmaking",
  name: "Trail Making",
  tagline: "connect 1-A-2-B-3-C in order, fast",
  category: "attention",
  scoreMode: "min",
  formatScore: function (v) { return v + "s"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="9" r="2"/><circle cx="8" cy="18" r="2"/><path d="M6.7 6.9l10.6 1.4M17.5 10.8l-8 5.6" stroke-linecap="round"/></svg>',
  mount: function (root, ctx) {
    var SEQ = ["1", "A", "2", "B", "3", "C", "4", "D", "5", "E", "6", "F"];
    var NODE = 46;            // node diameter (px) — matches CSS
    var MARGIN = 8;           // keep nodes off the stage edge
    var MIN_GAP = NODE + 14;  // center-to-center spacing for non-overlap

    var wrap = ctx.util.el("div", "trailmaking-wrap");
    var status = ctx.util.el("div", "trailmaking-status",
      'next: <span class="trailmaking-target">—</span>' +
      '<span class="trailmaking-time">0.0s</span>');
    var stage = ctx.util.el("div", "trailmaking-stage");
    var overlay = ctx.util.el("div", "g-overlay");
    stage.appendChild(overlay);
    wrap.appendChild(status);
    wrap.appendChild(stage);
    root.appendChild(wrap);

    var targetEl = status.querySelector(".trailmaking-target");
    var timeEl = status.querySelector(".trailmaking-time");

    var nodes = [];        // { value, btn }
    var expected = 0;      // index into SEQ of the next node to click
    var startMs = 0;       // timer start (set on first correct click)
    var running = false;   // true once node "1" is clicked, false when done/idle
    var rafId = null;

    function clearTimerLoop() {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }
    function elapsedSeconds() {
      return Math.round((performance.now() - startMs) / 100) / 10;
    }
    function tick() {
      if (!running) return;
      timeEl.textContent = (Math.floor((performance.now() - startMs) / 100) / 10).toFixed(1) + "s";
      rafId = requestAnimationFrame(tick);
    }

    // Reject-sample non-overlapping center positions within current stage size.
    function layout(count) {
      var r = stage.getBoundingClientRect();
      var w = r.width, h = r.height;
      var minC = MARGIN + NODE / 2;
      var maxX = Math.max(minC + 1, w - MARGIN - NODE / 2);
      var maxY = Math.max(minC + 1, h - MARGIN - NODE / 2);
      var pts = [];
      var gap = MIN_GAP;
      for (var i = 0; i < count; i++) {
        var placed = false;
        for (var attempt = 0; attempt < 400 && !placed; attempt++) {
          var cx = minC + Math.random() * (maxX - minC);
          var cy = minC + Math.random() * (maxY - minC);
          var ok = true;
          for (var j = 0; j < pts.length; j++) {
            var dx = cx - pts[j].x, dy = cy - pts[j].y;
            if (dx * dx + dy * dy < gap * gap) { ok = false; break; }
          }
          if (ok) { pts.push({ x: cx, y: cy }); placed = true; }
        }
        // Relax spacing if the stage is too small to fit everything cleanly.
        if (!placed) { gap = Math.max(NODE, gap - 6); i--; }
      }
      return pts;
    }

    function buildBoard() {
      clearTimerLoop();
      overlay.classList.remove("show");
      stage.querySelectorAll(".trailmaking-node").forEach(function (n) { n.remove(); });
      nodes = [];
      expected = 0;
      running = false;
      startMs = 0;
      timeEl.textContent = "0.0s";

      var pts = layout(SEQ.length);
      for (var i = 0; i < SEQ.length; i++) {
        var btn = ctx.util.el("button", "trailmaking-node", SEQ[i]);
        btn.type = "button";
        btn.style.left = (pts[i].x - NODE / 2) + "px";
        btn.style.top = (pts[i].y - NODE / 2) + "px";
        (function (idx) {
          btn.addEventListener("click", function () { onClick(idx); });
        })(i);
        stage.appendChild(btn);
        nodes.push({ value: SEQ[i], btn: btn });
      }
      refreshTarget();
    }

    function refreshTarget() {
      nodes.forEach(function (n) { n.btn.classList.remove("is-next"); });
      if (expected < SEQ.length) {
        targetEl.textContent = SEQ[expected];
        nodes[expected].btn.classList.add("is-next");
      } else {
        targetEl.textContent = "done";
      }
    }

    function onClick(idx) {
      if (expected >= SEQ.length) return;       // already finished
      var node = nodes[idx];
      if (node.btn.classList.contains("is-done")) return;

      if (idx === expected) {
        // Correct next node.
        if (expected === 0) { running = true; startMs = performance.now(); tick(); }
        node.btn.classList.add("is-done");
        node.btn.classList.remove("is-next", "is-wrong");
        expected++;
        if (expected >= SEQ.length) finish();
        else refreshTarget();
      } else {
        // Wrong click — flash red, otherwise ignore.
        var b = node.btn;
        b.classList.remove("is-wrong");
        void b.offsetWidth; // restart animation
        b.classList.add("is-wrong");
      }
    }

    function finish() {
      var seconds = elapsedSeconds();
      running = false;
      clearTimerLoop();
      timeEl.textContent = seconds.toFixed(1) + "s";
      targetEl.textContent = "done";
      var best = ctx.submitScore(seconds);

      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-big">' + seconds.toFixed(1) + 's</div>' +
          '<div class="g-sub">1-A-2-B-3-C…F' + (best ? ' · new best!' : '') + '</div>' +
          '<button class="g-btn trailmaking-again" type="button">play again</button>' +
        '</div>';
      overlay.classList.add("show");
      overlay.querySelector(".trailmaking-again").addEventListener("click", buildBoard);
    }

    function showStart() {
      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-sub">click 1, then A, then 2, then B… alternating to F</div>' +
          '<button class="g-btn trailmaking-start" type="button">new board</button>' +
        '</div>';
      overlay.classList.add("show");
      overlay.querySelector(".trailmaking-start").addEventListener("click", buildBoard);
    }

    showStart();

    return function () {
      running = false;
      clearTimerLoop();
    };
  }
});
