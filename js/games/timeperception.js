/* Time Perception — your internal clock. Stop the run at the target
   duration with NO visual timer running. Smaller error (ms) is better. */
NERDBOX.injectStyle("timeperception", `
.timeperception-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  position: relative;
}
.timeperception-target {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 1rem;
  text-align: center;
  min-height: 1.4em;
}
.timeperception-target b {
  color: var(--accent);
  font-weight: 700;
  font-size: 1.25rem;
}
.timeperception-pad {
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
  transition: border-color 0.12s ease, background 0.12s ease, transform 0.06s ease;
  user-select: none;
}
.timeperception-pad:hover { border-color: var(--accent); }
.timeperception-pad:active { transform: translateY(1px); }
.timeperception-pad.timeperception-running {
  border-color: var(--go);
  background: color-mix(in srgb, var(--go) 12%, var(--bg-alt));
}
.timeperception-pad.timeperception-done { cursor: default; }
.timeperception-main {
  font-size: 2.4rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-align: center;
}
.timeperception-sub {
  font-size: 1rem;
  color: var(--sub);
}
.timeperception-dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: var(--go);
  margin-top: 0.2rem;
  animation: timeperception-pulse 1s ease-in-out infinite;
}
@keyframes timeperception-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.15); }
}
.timeperception-hint {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.85rem;
  text-align: center;
}
.timeperception-rows {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  align-items: center;
  font-family: "JetBrains Mono", monospace;
  font-size: 0.95rem;
  color: var(--sub);
}
.timeperception-rows .timeperception-num { color: var(--text); font-weight: 700; }
`);

NERDBOX.register({
  id: "timeperception",
  name: "Time Perception",
  tagline: "stop the clock at the target time",
  category: "reflex",
  scoreMode: "min",
  formatScore: function (v) { return v + " ms off"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 13V9"/><path d="M9 2h6"/><path d="M19 5l1.5-1.5"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;

    // state: "ready" (awaiting first click) | "running" (timing, no display) | "done"
    var state = "ready";
    var startT = 0;
    var target = 0;          // seconds, one decimal
    var clearGuard = null;   // any pending timer, cleared on teardown

    var wrap = el("div", "timeperception-wrap");
    var targetLine = el("div", "timeperception-target");
    var pad = el("button", "timeperception-pad");
    var hint = el("div", "timeperception-hint",
      "no clock is shown while it runs — trust your internal sense of time");
    var overlay = el("div", "g-overlay");

    wrap.appendChild(targetLine);
    wrap.appendChild(pad);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    function pickTarget() {
      // 3.0 – 8.0 seconds, one decimal (30..80 tenths)
      var tenths = 30 + ctx.util.rand(51);
      target = tenths / 10;
    }

    function fmtSec(s) { return s.toFixed(1) + " s"; }

    function paintTargetLine() {
      targetLine.innerHTML = 'target &middot; <b>stop at ' + fmtSec(target) + '</b>';
    }

    function paintPad(cls, main, sub, withDot) {
      pad.className = "timeperception-pad" + (cls ? " " + cls : "");
      var html = '<div class="timeperception-main">' + main + "</div>";
      if (sub) html += '<div class="timeperception-sub">' + sub + "</div>";
      if (withDot) html += '<div class="timeperception-dot"></div>';
      pad.innerHTML = html;
    }

    function newRound() {
      overlay.classList.remove("show");
      state = "ready";
      pickTarget();
      paintTargetLine();
      paintPad("", "click to START", "stop it at " + fmtSec(target), false);
    }

    function start() {
      state = "running";
      startT = performance.now();               // begin timing
      // NB: deliberately NO interval / elapsed display — the point is no visual timer.
      paintPad("timeperception-running", "click to STOP", "feel out " + fmtSec(target), true);
    }

    function stop() {
      var elapsed = performance.now() - startT;          // ms elapsed
      var targetMs = target * 1000;
      var error = Math.round(Math.abs(elapsed - targetMs));   // ms off, rounded
      state = "done";
      var best = ctx.submitScore(error);                 // scoreMode "min" — smaller better
      pad.className = "timeperception-pad timeperception-done";
      pad.innerHTML = "";
      showResult(elapsed, error, best);
    }

    function showResult(elapsedMs, error, best) {
      var yours = (elapsedMs / 1000).toFixed(2);
      var html =
        '<div class="g-result">' +
          '<div class="g-big">' + error + ' ms</div>' +
          '<div class="g-sub">' + (best ? "new best! &middot; " : "") + 'off the target</div>' +
          '<div class="timeperception-rows">' +
            '<div>target&nbsp;<span class="timeperception-num">' + fmtSec(target) + '</span></div>' +
            '<div>you&nbsp;stopped&nbsp;at&nbsp;<span class="timeperception-num">' + yours + ' s</span></div>' +
          '</div>' +
          '<button class="g-btn">next round</button>' +
        '</div>';
      overlay.innerHTML = html;
      overlay.querySelector("button").addEventListener("click", newRound);
      overlay.classList.add("show");
    }

    function onClick() {
      if (state === "ready") { start(); }
      else if (state === "running") { stop(); }
      // "done" → clicks ignored; use the overlay's "next round" button
    }

    pad.addEventListener("click", onClick);

    // first round
    newRound();

    // teardown — clear any pending timer (none persistent, but guard defensively)
    return function () {
      if (clearGuard !== null) { clearTimeout(clearGuard); clearGuard = null; }
    };
  }
});
