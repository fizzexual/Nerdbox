/* Bisect — spatial perception / line bisection.
   A horizontal line of random LENGTH and random horizontal POSITION is drawn
   inside the stage (margins kept on both ends). The player clicks where they
   think the MIDPOINT is — a single click anywhere in the stage. We convert the
   click to a stage-local X with getBoundingClientRect:  clickX = clientX - rect.left.
   The line's true middle is  trueMidX = (x1 + x2) / 2 , so the error as a
   percentage of the line is  err% = |clickX - trueMidX| / lineLength * 100.
   Land inside the tolerance (4% of the line on round 1, tightening toward a ~2%
   floor) and the streak grows + a fresh line appears; miss and it's game over,
   with markers revealing your click vs. the true middle and the error.
   scoreMode "max" = longest streak. One injectStyle + one register, vanilla JS. */
NERDBOX.injectStyle("bisect", `
.bisect-wrap { position: relative; width: 100%; max-width: 560px; margin: 0 auto; }
.bisect-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 2;
  background: var(--bg-alt);
  border-radius: 16px;
  overflow: hidden;
  cursor: crosshair;
  touch-action: none;
}
/* the line to be bisected */
.bisect-line {
  position: absolute;
  height: 4px;
  border-radius: 4px;
  background: var(--text);
  transform: translateY(-50%);
  pointer-events: none;
}
/* faint end-caps so the line's extent reads clearly */
.bisect-line::before, .bisect-line::after {
  content: "";
  position: absolute;
  top: 50%;
  width: 4px; height: 18px;
  border-radius: 2px;
  background: var(--sub-alt);
  transform: translateY(-50%);
}
.bisect-line::before { left: 0; }
.bisect-line::after { right: 0; }
.bisect-stage .bisect-hint {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--sub); font-family: "JetBrains Mono", monospace; font-size: 1rem;
  pointer-events: none; text-align: center; padding: 0 1rem;
}
/* a full-height vertical marker pinned to an X on the line's row */
.bisect-mark {
  position: absolute;
  top: 0; bottom: 0;
  width: 2px;
  transform: translateX(-50%);
  pointer-events: none;
}
.bisect-mark.guess { background: var(--text); }
.bisect-mark.guess.hit { background: var(--go); }
.bisect-mark.guess.miss { background: var(--error); }
.bisect-mark.truth { background: var(--accent); border-left: 2px dashed var(--accent); width: 0; }
/* little labels riding the markers */
.bisect-mark .bisect-tag {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.7rem;
  white-space: nowrap;
  padding: 1px 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--bg) 80%, transparent);
}
.bisect-mark.guess .bisect-tag { color: var(--text); }
.bisect-mark.truth .bisect-tag { color: var(--accent); top: 28px; }
.bisect-msg { color: var(--go); }
.bisect-msg.miss { color: var(--error); }
.bisect-result-line { color: var(--sub); font-size: 0.95rem; }
.bisect-result-line b { color: var(--text); font-family: "JetBrains Mono", monospace; }
`);

NERDBOX.register({
  id: "bisect",
  name: "Bisect",
  tagline: "click the exact middle of the line",
  category: "perception",
  scoreMode: "max",
  formatScore: function (v) { return v + " streak"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="6" x2="12" y2="18"/></svg>',
  mount: function (root, ctx) {
    var TOL_START = 4;     // tolerance on round 1: 4% of the line length
    var TOL_STEP = 0.25;   // tighten by 0.25% per streak
    var TOL_FLOOR = 2;     // never demand better than ~2%
    var MARGIN = 36;       // px kept clear at each end of the stage
    var MIN_LEN = 140;     // shortest line (px)

    var streak = 0;
    var phase = "idle";    // idle | aim | between | over
    var timers = [];       // every setTimeout id — all cleared on teardown

    // current line geometry (stage-local px)
    var x1 = 0, x2 = 0, lineY = 0, lineLen = 0, trueMid = 0;

    // ---- timer helpers: track every id so teardown can clear them all ----
    function after(ms, fn) {
      var id = setTimeout(function () {
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

    // tolerance (in % of line length) for the current streak
    function tolFor(s) { return Math.max(TOL_FLOOR, TOL_START - s * TOL_STEP); }

    // ---- DOM ----
    var status = ctx.util.el("div", "g-status");
    var wrap = ctx.util.el("div", "bisect-wrap");
    var stage = ctx.util.el("div", "bisect-stage");
    var hint = ctx.util.el("div", "bisect-hint");
    var line = ctx.util.el("div", "bisect-line");
    var overlay = ctx.util.el("div", "g-overlay");

    line.style.display = "none";
    stage.appendChild(hint);
    stage.appendChild(line);
    wrap.appendChild(stage);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    function setStatus(msg, miss) {
      var s = '<span>streak&nbsp;<b style="color:var(--text);font-weight:500">' + streak + "</b></span>";
      if (msg) s += '<span class="bisect-msg' + (miss ? " miss" : "") + '">' + msg + "</span>";
      else if (phase === "aim") s += "<span>find the middle — no measuring!</span>";
      status.innerHTML = s;
    }

    // remove any guess/truth markers left from a previous round
    function clearMarks() {
      var olds = stage.querySelectorAll(".bisect-mark");
      for (var i = 0; i < olds.length; i++) olds[i].remove();
    }

    // place a vertical marker at stage-local X, with an optional label
    function addMark(x, cls, tag) {
      var m = ctx.util.el("div", "bisect-mark " + cls);
      m.style.left = x + "px";
      if (tag) m.appendChild(ctx.util.el("div", "bisect-tag", tag));
      stage.appendChild(m);
      return m;
    }

    // draw a fresh random line: random length, random horizontal slot (margins kept)
    function newLine() {
      clearMarks();
      var r = stage.getBoundingClientRect();
      var w = r.width, h = r.height;

      // longest line that still leaves MARGIN at both ends; clamp the min sensibly
      var maxLen = w - 2 * MARGIN;
      var minLen = Math.min(MIN_LEN, maxLen);
      if (maxLen < minLen) maxLen = minLen;     // tiny-stage safety
      lineLen = minLen + Math.random() * (maxLen - minLen);

      // random left edge such that the whole line stays inside the margins
      var slack = (w - 2 * MARGIN) - lineLen;   // >= 0
      if (slack < 0) slack = 0;
      x1 = MARGIN + Math.random() * slack;
      x2 = x1 + lineLen;
      trueMid = (x1 + x2) / 2;                   // == x1 + lineLen / 2

      // vertical position: keep clear of the very top/bottom so markers + tags fit
      lineY = h * (0.32 + Math.random() * 0.36);

      line.style.display = "block";
      line.style.left = x1 + "px";
      line.style.width = lineLen + "px";
      line.style.top = lineY + "px";
    }

    function startRound() {
      phase = "aim";
      hint.textContent = "";
      newLine();
      setStatus();
    }

    function onStageClick(e) {
      if (phase !== "aim") return;

      // convert the click to a stage-local X: clientX minus the stage's left edge
      var r = stage.getBoundingClientRect();
      var clickX = e.clientX - r.left;

      // error as a percentage of the line's length
      var errPx = Math.abs(clickX - trueMid);
      var errPct = (errPx / lineLen) * 100;
      var tol = tolFor(streak);
      var hit = errPct <= tol;

      // reveal where you clicked vs. the true middle (snap the guess to the line row)
      addMark(clickX, "guess " + (hit ? "hit" : "miss"), "you");
      addMark(trueMid, "truth", "middle");

      if (hit) {
        streak++;
        ctx.submitScore(streak);   // max -> longest streak
        phase = "between";
        setStatus("dead on — off " + errPct.toFixed(1) + "%");
        after(800, function () { if (phase === "between") startRound(); });
      } else {
        gameOver(errPct, errPx);
      }
    }

    function gameOver(errPct, errPx) {
      phase = "over";
      clearTimers();
      line.style.display = "none";
      hint.textContent = "";
      setStatus("off by " + errPct.toFixed(1) + "%", true);
      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-big">' + streak + "</div>" +
          '<div class="g-sub">best streak</div>' +
          '<div class="bisect-result-line">your click was <b>' +
            errPct.toFixed(1) + "%</b> off (" + Math.round(errPx) + "px)</div>" +
          '<button class="g-btn">play again</button>' +
        "</div>";
      overlay.querySelector("button").addEventListener("click", startGame);
      overlay.classList.add("show");
    }

    function startGame() {
      clearTimers();
      clearMarks();
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      streak = 0;
      startRound();
    }

    function showStart() {
      phase = "idle";
      clearTimers();
      clearMarks();
      line.style.display = "none";
      hint.textContent = "a line appears — click its exact midpoint. no measuring!";
      setStatus();
      overlay.innerHTML = '<button class="g-btn">start</button>';
      overlay.querySelector("button").addEventListener("click", startGame);
      overlay.classList.add("show");
    }

    // ---- wiring ----
    stage.addEventListener("click", onStageClick);

    showStart();

    return function () {
      clearTimers();
      stage.removeEventListener("click", onStageClick);
    };
  }
});
