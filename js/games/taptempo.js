/* Steady Beat — motor timing / consistency. Tap a big pad (or spacebar) at
   YOUR own chosen speed, but keep the rhythm perfectly even. We record each
   tap with performance.now(), take the 11 intervals between 12 taps (the
   first tap just starts the clock and is ignored for interval timing), and
   score = round(100 * (1 - stddev/mean)) of those intervals, clamped 0..100
   (the coefficient of variation — lower spread = higher %). */
NERDBOX.injectStyle("taptempo", `
.taptempo-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  position: relative;
}
.taptempo-count {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 1.05rem;
  text-align: center;
  min-height: 1.4em;
}
.taptempo-count b { color: var(--accent); font-weight: 700; }
.taptempo-pad {
  width: 100%;
  min-height: 340px;
  border: 2px solid var(--sub-alt);
  border-radius: 18px;
  background: var(--bg-alt);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  cursor: pointer;
  color: var(--text);
  font-family: "JetBrains Mono", monospace;
  transition: border-color 0.12s ease, background 0.12s ease, transform 0.04s ease;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.taptempo-pad:hover { border-color: var(--accent); }
.taptempo-pad.taptempo-armed { border-color: var(--go); }
.taptempo-pad.taptempo-done { cursor: default; }
.taptempo-pad.taptempo-pulse {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, var(--bg-alt));
  transform: scale(0.985);
}
.taptempo-main {
  font-size: 2.3rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-align: center;
}
.taptempo-sub {
  font-size: 1rem;
  color: var(--sub);
  text-align: center;
}
.taptempo-ring {
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  border: 3px solid var(--accent);
  margin-top: 0.3rem;
  opacity: 0.35;
}
.taptempo-pad.taptempo-pulse .taptempo-ring {
  animation: taptempo-ping 0.34s ease-out;
}
@keyframes taptempo-ping {
  0%   { transform: scale(0.6); opacity: 0.9; }
  100% { transform: scale(1.9); opacity: 0; }
}
.taptempo-hint {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.85rem;
  text-align: center;
}
.taptempo-rows {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  align-items: center;
  font-family: "JetBrains Mono", monospace;
  font-size: 0.95rem;
  color: var(--sub);
}
.taptempo-rows .taptempo-num { color: var(--text); font-weight: 700; }
`);

NERDBOX.register({
  id: "taptempo",
  name: "Steady Beat",
  tagline: "tap a perfectly even rhythm",
  category: "motor",
  scoreMode: "max",
  formatScore: function (v) { return v + "%"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18"/><path d="M12 3v18"/><path d="M19 3v18"/><circle cx="5" cy="9" r="0.6"/><circle cx="12" cy="9" r="0.6"/><circle cx="19" cy="9" r="0.6"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;

    var TOTAL = 12;            // taps to collect → 11 intervals
    var MIN_INTERVALS = 2;     // need at least ~2 intervals to score meaningfully

    // state: "ready" (no taps yet) | "tapping" (1..TOTAL-1 taps in) | "done"
    var state = "ready";
    var times = [];            // performance.now() timestamps, one per tap
    var pulseTimer = null;     // clears the per-tap pulse class

    var wrap = el("div", "taptempo-wrap");
    var count = el("div", "taptempo-count");
    var pad = el("button", "taptempo-pad");
    var hint = el("div", "taptempo-hint",
      "pick any speed — just keep every gap the same. tap the pad or press space.");
    var overlay = el("div", "g-overlay");

    wrap.appendChild(count);
    wrap.appendChild(pad);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    function paintCount() {
      // taps registered so far, clamped to TOTAL for display
      var n = Math.min(times.length, TOTAL);
      count.innerHTML = 'tap <b>' + n + '</b> / ' + TOTAL;
    }

    function paintPad(cls, main, sub, withRing) {
      pad.className = "taptempo-pad" + (cls ? " " + cls : "");
      var html = '<div class="taptempo-main">' + main + "</div>";
      if (sub) html += '<div class="taptempo-sub">' + sub + "</div>";
      if (withRing) html += '<div class="taptempo-ring"></div>';
      pad.innerHTML = html;
    }

    function newRound() {
      overlay.classList.remove("show");
      if (pulseTimer !== null) { clearTimeout(pulseTimer); pulseTimer = null; }
      state = "ready";
      times = [];
      paintCount();
      paintPad("", "TAP TO START", "find your steady rhythm", false);
    }

    function flashPulse() {
      // retrigger the CSS ping animation cleanly each tap
      pad.classList.remove("taptempo-pulse");
      void pad.offsetWidth; // force reflow so the animation restarts
      pad.classList.add("taptempo-pulse");
      if (pulseTimer !== null) clearTimeout(pulseTimer);
      pulseTimer = setTimeout(function () {
        pad.classList.remove("taptempo-pulse");
        pulseTimer = null;
      }, 340);
    }

    function tap() {
      if (state === "done") return;          // ignore taps after finishing
      var now = performance.now();
      times.push(now);

      if (state === "ready") {
        // first tap only starts the clock — no interval yet
        state = "tapping";
        paintCount();
        flashPulse();
        paintPad("taptempo-armed", "KEEP TAPPING", "tap " + 1 + " / " + TOTAL, true);
        return;
      }

      // state === "tapping": this is tap #times.length (2..TOTAL)
      paintCount();
      flashPulse();

      if (times.length >= TOTAL) {
        finish();
      } else {
        paintPad("taptempo-armed", "KEEP TAPPING", "tap " + times.length + " / " + TOTAL, true);
      }
    }

    function finish() {
      state = "done";

      // intervals between consecutive taps; first tap merely started the clock,
      // so the 12 timestamps yield 11 inter-tap intervals.
      var intervals = [];
      for (var i = 1; i < times.length; i++) {
        intervals.push(times[i] - times[i - 1]);
      }

      var n = intervals.length;
      var consistency = 0;
      var meanMs = 0;
      var ok = n >= MIN_INTERVALS;

      if (ok) {
        var sum = 0, j;
        for (j = 0; j < n; j++) sum += intervals[j];
        meanMs = sum / n;

        if (meanMs > 0) {
          var varSum = 0, d;
          for (j = 0; j < n; j++) { d = intervals[j] - meanMs; varSum += d * d; }
          var stddev = Math.sqrt(varSum / n);            // population stddev
          var cv = stddev / meanMs;                       // coefficient of variation
          consistency = Math.round(100 * (1 - cv));
          if (consistency < 0) consistency = 0;
          if (consistency > 100) consistency = 100;
        }
      }

      var best = ok ? ctx.submitScore(consistency) : false;

      pad.className = "taptempo-pad taptempo-done";
      pad.innerHTML = "";
      paintCount();
      showResult(consistency, meanMs, n, ok, best);
    }

    function showResult(consistency, meanMs, n, ok, best) {
      var html = '<div class="g-result">';
      if (ok) {
        var bpm = meanMs > 0 ? Math.round(60000 / meanMs) : 0;
        html +=
          '<div class="g-big">' + consistency + '%</div>' +
          '<div class="g-sub">' + (best ? "new best! &middot; " : "") + 'rhythm consistency</div>' +
          '<div class="taptempo-rows">' +
            '<div>your&nbsp;tempo&nbsp;&middot;&nbsp;<span class="taptempo-num">' + bpm + ' bpm</span></div>' +
            '<div>over&nbsp;<span class="taptempo-num">' + n + '</span>&nbsp;intervals</div>' +
          '</div>';
      } else {
        html +=
          '<div class="g-big">—</div>' +
          '<div class="g-sub">not enough taps to score</div>';
      }
      html += '<button class="g-btn">play again</button></div>';
      overlay.innerHTML = html;
      overlay.querySelector("button").addEventListener("click", newRound);
      overlay.classList.add("show");
    }

    function onClick() { tap(); }

    function onKey(e) {
      if (e.code === "Space" || e.key === " " || e.keyCode === 32) {
        e.preventDefault();   // stop the page from scrolling / the pad re-firing
        if (state !== "done") tap();
      }
    }

    pad.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);

    newRound();

    // teardown — remove the spacebar listener and clear any pending timer
    return function () {
      document.removeEventListener("keydown", onKey);
      pad.removeEventListener("click", onClick);
      if (pulseTimer !== null) { clearTimeout(pulseTimer); pulseTimer = null; }
    };
  }
});
