/* Number Line — numerical estimation. A horizontal line spans the stage, labeled
   with its min (0) at the left and max at the right. A TARGET number is shown; click
   the point on the line where it belongs. The click is converted to a value:
     value = min + (clickX - lineLeft) / lineWidth * (max - min)
   and the error is the absolute miss as a fraction of the range:
     error = |value - target| / (max - min)
   Within tolerance (starts <=4% of the range, tightens each round, floor ~2%) -> the
   streak grows and the next round gets a wider / trickier range; miss -> game over,
   with a marker showing your click vs the true position. scoreMode "max" = longest
   streak. Self-contained: one injectStyle + one register. */
NERDBOX.injectStyle("numberline", `
.numberline-wrap { position: relative; width: 100%; max-width: 640px; margin: 0 auto; }
.numberline-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 5 / 2;
  background: var(--bg-alt);
  border-radius: 16px;
  overflow: hidden;
}
/* the clickable horizontal line — its getBoundingClientRect drives the conversion */
.numberline-line {
  position: absolute;
  left: 8%;
  right: 8%;
  top: 50%;
  height: 4px;
  background: var(--sub-alt);
  border-radius: 4px;
  transform: translateY(-50%);
  cursor: crosshair;
}
.numberline-line.locked { cursor: default; }
/* generous click target sitting over the thin line */
.numberline-hit {
  position: absolute;
  left: 0; right: 0;
  top: -22px; height: 44px;
}
/* end caps */
.numberline-tick {
  position: absolute;
  top: 50%;
  width: 2px;
  height: 16px;
  background: var(--sub);
  transform: translate(-50%, -50%);
}
.numberline-tick.start { left: 0; }
.numberline-tick.end { left: 100%; }
.numberline-label {
  position: absolute;
  top: calc(50% + 16px);
  color: var(--sub);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.85rem;
  white-space: nowrap;
  transform: translateX(-50%);
}
.numberline-label.start { left: 0; }
.numberline-label.end { left: 100%; }
/* marker for the player's click (shown on miss) */
.numberline-mark {
  position: absolute;
  top: 50%;
  width: 3px;
  height: 30px;
  border-radius: 3px;
  transform: translate(-50%, -50%);
  z-index: 3;
}
.numberline-mark.guess { background: var(--error); }
.numberline-mark.truth { background: var(--go); }
.numberline-mark .numberline-flag {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 4px);
  transform: translateX(-50%);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.72rem;
  white-space: nowrap;
}
.numberline-mark.guess .numberline-flag { color: var(--error); }
.numberline-mark.truth .numberline-flag { color: var(--go); }
.numberline-mark.truth .numberline-flag { bottom: auto; top: calc(100% + 4px); }
/* the TARGET prompt floating above the line */
.numberline-target {
  position: absolute;
  left: 0; right: 0;
  top: 16%;
  text-align: center;
  pointer-events: none;
}
.numberline-target .numberline-t-label {
  display: block;
  color: var(--sub);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 1.5px;
}
.numberline-target .numberline-t-val {
  display: block;
  color: var(--accent);
  font-family: "JetBrains Mono", monospace;
  font-size: 2rem;
  line-height: 1.1;
  margin-top: 0.15rem;
}
.numberline-hint {
  position: absolute;
  left: 0; right: 0;
  bottom: 12%;
  text-align: center;
  color: var(--sub);
  font-family: "JetBrains Mono", monospace;
  font-size: 0.85rem;
  pointer-events: none;
  padding: 0 1rem;
}
.numberline-msg { color: var(--go); }
.numberline-msg.miss { color: var(--error); }
.numberline-result-line { color: var(--sub); font-size: 0.95rem; }
.numberline-result-line b { color: var(--text); font-family: "JetBrains Mono", monospace; }
`);

NERDBOX.register({
  id: "numberline",
  name: "Number Line",
  tagline: "place the number on the line",
  category: "reasoning",
  scoreMode: "max",
  formatScore: function (v) { return v + " streak"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="4" y1="9" x2="4" y2="15"/><line x1="20" y1="9" x2="20" y2="15"/><line x1="13" y1="7" x2="13" y2="17"/></svg>',
  mount: function (root, ctx) {
    var MIN = 0;            // left end of the line, always 0
    var TOL_START = 0.04;   // first round: within 4% of the range counts
    var TOL_FLOOR = 0.02;   // never tighter than 2%
    var TOL_STEP = 0.0025;  // tighten a little each cleared round

    var streak = 0;         // current run length (max -> best)
    var max = 100;          // right end of the line this round
    var target = 0;         // number the player must place
    var tol = TOL_START;    // current tolerance (fraction of range)
    var phase = "idle";     // idle | play | over
    var timers = [];        // EVERY timer id — cleared on teardown

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

    // ---- range growth: 100 -> 1000 -> 10000 ... then non-round maxima ----
    function maxFor(s) {
      if (s < 3) return 100;
      if (s < 6) return 1000;
      if (s < 9) return 10000;
      if (s < 12) return 100000;
      // beyond round powers of ten: jagged maxima that don't end in zeros,
      // so the player can't lean on tidy landmarks.
      var base = Math.pow(10, 5 + Math.floor((s - 12) / 3));
      var jitter = 1 + (ctx.util.rand(80) + 11) / 100;   // 1.11 .. 1.90
      return Math.round(base * jitter);
    }

    // a target strictly inside (MIN, max); rounded so it reads cleanly but isn't
    // pinned to obvious fractions of the range.
    function pickTarget(mx) {
      var span = mx - MIN;
      var t = MIN + 1 + ctx.util.rand(span - 1);   // 1 .. span-1
      return t;
    }

    function tolFor(s) {
      return Math.max(TOL_FLOOR, TOL_START - s * TOL_STEP);
    }

    function fmt(n) { return n.toLocaleString("en-US"); }

    // ---- DOM ----
    var status = ctx.util.el("div", "g-status");
    var wrap = ctx.util.el("div", "numberline-wrap");
    var stage = ctx.util.el("div", "numberline-stage");

    var targetBox = ctx.util.el("div", "numberline-target",
      '<span class="numberline-t-label">target</span>' +
      '<span class="numberline-t-val">—</span>');
    var targetVal = targetBox.querySelector(".numberline-t-val");

    var line = ctx.util.el("div", "numberline-line");
    var hit = ctx.util.el("div", "numberline-hit");
    var tickStart = ctx.util.el("div", "numberline-tick start");
    var tickEnd = ctx.util.el("div", "numberline-tick end");
    var labelStart = ctx.util.el("div", "numberline-label start", "0");
    var labelEnd = ctx.util.el("div", "numberline-label end", "100");
    line.appendChild(hit);
    line.appendChild(tickStart);
    line.appendChild(tickEnd);
    line.appendChild(labelStart);
    line.appendChild(labelEnd);

    var hint = ctx.util.el("div", "numberline-hint", "click where it belongs");

    stage.appendChild(targetBox);
    stage.appendChild(line);
    stage.appendChild(hint);

    var overlay = ctx.util.el("div", "g-overlay");

    wrap.appendChild(stage);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    function setStatus(msg, miss) {
      var s = '<span>streak&nbsp;<b style="color:var(--text);font-weight:500">' + streak + "</b></span>";
      if (msg) s += '<span class="numberline-msg' + (miss ? " miss" : "") + '">' + msg + "</span>";
      else if (phase === "play") s += "<span>within " + (tol * 100).toFixed(1) + "% of " + fmt(max) + "</span>";
      status.innerHTML = s;
    }

    // remove any markers left over from a previous miss
    function clearMarks() {
      var marks = line.querySelectorAll(".numberline-mark");
      for (var i = 0; i < marks.length; i++) line.removeChild(marks[i]);
    }

    // place a marker at a given fraction (0..1) along the line
    function addMark(frac, kind, label) {
      var m = ctx.util.el("div", "numberline-mark " + kind);
      m.style.left = (frac * 100) + "%";
      if (label != null) {
        var f = ctx.util.el("div", "numberline-flag");
        f.textContent = label;
        m.appendChild(f);
      }
      line.appendChild(m);
      return m;
    }

    function lockLine(lock) {
      line.classList.toggle("locked", lock);
    }

    // ---- start a round: set range, target, tolerance, labels ----
    function startRound() {
      phase = "play";
      max = maxFor(streak);
      tol = tolFor(streak);
      target = pickTarget(max);

      clearMarks();
      labelStart.textContent = fmt(MIN);
      labelEnd.textContent = fmt(max);
      targetVal.textContent = fmt(target);
      hint.textContent = "click where it belongs";
      lockLine(false);
      setStatus();
    }

    // ---- convert a click on the line to a value, then judge it ----
    function onLineClick(e) {
      if (phase !== "play") return;

      // use the LINE element's own box for the conversion
      var rect = line.getBoundingClientRect();
      var lineLeft = rect.left;
      var lineWidth = rect.width;
      if (lineWidth <= 0) return;

      var rawFrac = (e.clientX - lineLeft) / lineWidth;
      var frac = rawFrac < 0 ? 0 : (rawFrac > 1 ? 1 : rawFrac);   // clamp for the value
      var value = MIN + frac * (max - MIN);
      var error = Math.abs(value - target) / (max - MIN);         // fraction of range

      phase = "judge";
      lockLine(true);

      if (error <= tol) {
        streak++;
        ctx.submitScore(streak);          // max -> longest streak
        hint.textContent = "✓";
        setStatus("nice! off by " + (error * 100).toFixed(1) + "%");
        after(800, function () { startRound(); });
      } else {
        gameOver(rawFrac, value, error);
      }
    }

    function gameOver(rawFrac, value, error) {
      phase = "over";
      lockLine(true);
      hint.textContent = "";

      // where the player clicked (clamped onto the line) vs the true position
      var guessFrac = rawFrac < 0 ? 0 : (rawFrac > 1 ? 1 : rawFrac);
      var truthFrac = (target - MIN) / (max - MIN);
      addMark(guessFrac, "guess", "you: " + fmt(Math.round(value)));
      addMark(truthFrac, "truth", fmt(target));

      setStatus("off by " + (error * 100).toFixed(1) + "%", true);
      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-big">' + streak + "</div>" +
          '<div class="g-sub">best streak</div>' +
          '<div class="numberline-result-line">target <b>' + fmt(target) +
            "</b> — you placed <b>" + fmt(Math.round(value)) + "</b></div>" +
          '<button class="g-btn">play again</button>' +
        "</div>";
      overlay.querySelector("button").addEventListener("click", startGame);
      overlay.classList.add("show");
    }

    function startGame() {
      clearTimers();
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      streak = 0;
      startRound();
    }

    function showStart() {
      phase = "idle";
      lockLine(true);
      clearMarks();
      targetVal.textContent = "—";
      labelStart.textContent = "0";
      labelEnd.textContent = "100";
      hint.textContent = "place the target on the line";
      setStatus();
      overlay.innerHTML = '<button class="g-btn">start</button>';
      overlay.querySelector("button").addEventListener("click", startGame);
      overlay.classList.add("show");
    }

    // ---- wiring ----
    line.addEventListener("click", onLineClick);

    showStart();

    return function () { clearTimers(); };
  }
});
