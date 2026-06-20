/* Tap the Colour — a 60-second perceptual/response-speed sprint.
   A big TARGET swatch is shown above a row of ~6 colour-swatch buttons.
   Tap the button whose colour matches the target as fast as you can:
   correct → +1 and an instant next trial; wrong → a brief red flash, next
   trial (no point). Swatch positions are SHUFFLED every trial so you can't
   memorise a position. As the score climbs the palette tightens to closer
   shades, so it gets harder. Live score + 60s countdown; on time-up the
   score is submitted.

   Timers: every active timeout id lives in `timers` (a Set) and is cleared
   on finish AND teardown. A `running` flag plus a `round` token make any
   stale callback a no-op, so nothing fires after a round ends or the game
   is unmounted. */
NERDBOX.injectStyle("tapcolor", `
.tapcolor-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.1rem;
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
  position: relative;
}
.tapcolor-status { width: 100%; }
.tapcolor-status .tapcolor-score { color: var(--accent); font-weight: 700; }
.tapcolor-status .tapcolor-time { color: var(--sub); }
.tapcolor-status .tapcolor-time.tapcolor-low { color: var(--error); }

.tapcolor-prompt {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.85rem;
  letter-spacing: 0.04em;
  text-transform: lowercase;
}
/* the big TARGET swatch the player has to match */
.tapcolor-target {
  width: 100%;
  max-width: 320px;
  aspect-ratio: 16 / 7;
  border-radius: 16px;
  border: 3px solid var(--sub-alt);
  box-shadow: inset 0 6px 18px rgba(0, 0, 0, 0.28);
  transition: border-color 0.12s ease, transform 0.06s ease;
}
.tapcolor-target.tapcolor-bad {
  border-color: var(--error);
  animation: tapcolor-shake 0.22s ease;
}
@keyframes tapcolor-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}

/* the row of choices */
.tapcolor-choices {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: clamp(8px, 2.4vw, 14px);
  width: 100%;
  touch-action: manipulation;
}
@media (min-width: 460px) {
  .tapcolor-choices { grid-template-columns: repeat(6, 1fr); }
}
.tapcolor-swatch {
  aspect-ratio: 1 / 1;
  border-radius: 12px;
  border: 2px solid var(--sub-alt);
  cursor: pointer;
  padding: 0;
  user-select: none;
  -webkit-user-select: none;
  box-shadow: inset 0 4px 10px rgba(0, 0, 0, 0.22);
  transition: transform 0.06s ease, border-color 0.12s ease;
}
.tapcolor-choices.tapcolor-live .tapcolor-swatch:hover { border-color: var(--text); }
.tapcolor-choices.tapcolor-live .tapcolor-swatch:active { transform: scale(0.94); }
.tapcolor-swatch.tapcolor-hit { border-color: var(--go); }

.tapcolor-hint {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.85rem;
  text-align: center;
  line-height: 1.5;
}
`);

NERDBOX.register({
  id: "tapcolor",
  name: "Tap the Colour",
  tagline: "match the colour, fast",
  category: "reflex",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 11a7 7 0 1 0-7 7"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="8" cy="14" r="1"/><path d="M14 17l2.5 2.5L22 13"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand, shuffle = ctx.util.shuffle;

    /* ---- config ---- */
    var ROUND_MS = 60000;     // 60-second round
    var SWATCHES = 6;         // choices shown each trial
    // fixed palette of distinct base colours (as [r,g,b])
    var PALETTE = [
      [230, 75, 75],    // red    #e64b4b
      [79, 141, 240],   // blue   #4f8df0
      [76, 175, 114],   // green  #4caf72
      [226, 183, 20],   // yellow #e2b714
      [176, 114, 224],  // purple #b072e0
      [224, 140, 58]    // orange #e08c3a
    ];

    /* ---- timers: every active id lives here, cleared on finish/teardown ---- */
    var timers = new Set();
    function later(fn, ms) {
      var id = setTimeout(function () {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    }
    function clearTimers() {
      timers.forEach(function (id) { clearTimeout(id); });
      timers.clear();
    }

    /* ---- state ---- */
    var running = false;
    var round = 0;            // bumped each start/finish/teardown; stale guard
    var score = 0;
    var startTime = 0;
    var endTimer = null;      // master 60s timer (also tracked in `timers`)
    var tickTimer = null;     // countdown display tick (also tracked in `timers`)
    var targetIndex = -1;     // index in `choices` that matches the target
    var choices = [];         // current trial colours, parallel to buttons

    /* ---- layout ---- */
    var wrap = el("div", "tapcolor-wrap");
    var status = el("div", "g-status tapcolor-status");
    var prompt = el("div", "tapcolor-prompt", "tap this colour");
    var target = el("div", "tapcolor-target");
    var row = el("div", "tapcolor-choices");
    var btns = [];
    for (var i = 0; i < SWATCHES; i++) {
      var b = el("button", "tapcolor-swatch");
      b.type = "button";
      (function (idx) {
        b.addEventListener("click", function () { pick(idx); });
      })(i);
      row.appendChild(b);
      btns.push(b);
    }
    var hint = el("div", "tapcolor-hint", "60 seconds — tap the swatch that matches the target");
    var overlay = el("div", "g-overlay");
    wrap.appendChild(status);
    wrap.appendChild(prompt);
    wrap.appendChild(target);
    wrap.appendChild(row);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    function css(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }

    function progress() {
      var p = (performance.now() - startTime) / ROUND_MS;
      return p < 0 ? 0 : p > 1 ? 1 : p;
    }
    function remainingSec() {
      var ms = ROUND_MS - (performance.now() - startTime);
      return Math.max(0, Math.ceil(ms / 1000));
    }
    function renderStatus() {
      var secs = running ? remainingSec() : 60;
      var low = running && secs <= 5;
      status.innerHTML =
        '<span class="tapcolor-score">' + score + ' pts</span>' +
        '<span class="tapcolor-time' + (low ? ' tapcolor-low' : '') + '">' + secs + 's</span>';
    }

    // nudge a colour toward another by `amt` (0..1) — used to tighten shades
    function blend(c, toward, amt) {
      return [
        Math.round(c[0] + (toward[0] - c[0]) * amt),
        Math.round(c[1] + (toward[1] - c[1]) * amt),
        Math.round(c[2] + (toward[2] - c[2]) * amt)
      ];
    }

    function nextTrial() {
      if (!running) return;
      // difficulty: as score climbs, pull every swatch a little toward a shared
      // neutral grey so the colours sit closer together (harder to tell apart).
      var amt = Math.min(0.42, score * 0.012);
      var grey = [150, 150, 150];

      var order = shuffle(PALETTE);            // SHUFFLE so position can't be learned
      choices = order.slice(0, SWATCHES).map(function (c) {
        return amt > 0 ? blend(c, grey, amt) : c.slice();
      });
      targetIndex = rand(SWATCHES);            // which swatch is the answer

      target.style.background = css(choices[targetIndex]);
      target.classList.remove("tapcolor-bad");
      for (var i = 0; i < SWATCHES; i++) {
        btns[i].style.background = css(choices[i]);
        btns[i].classList.remove("tapcolor-hit");
      }
    }

    function pick(idx) {
      if (!running) return;
      if (idx === targetIndex) {
        score++;
        btns[idx].classList.add("tapcolor-hit");
        renderStatus();
        nextTrial();                            // instant next trial
      } else {
        // brief red flash on the target, then a fresh trial (no point)
        target.classList.add("tapcolor-bad");
        var myRound = round;
        later(function () {
          if (!running || myRound !== round) return;
          nextTrial();
        }, 220);
      }
    }

    function tick() {
      if (!running) return;
      renderStatus();
      var myRound = round;
      tickTimer = later(function () {
        if (!running || myRound !== round) return;
        tick();
      }, 200);
    }

    function start() {
      clearTimers();
      round++;
      running = true;
      score = 0;
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      row.classList.add("tapcolor-live");
      startTime = performance.now();
      renderStatus();

      var myRound = round;
      endTimer = later(function () {
        if (!running || myRound !== round) return;
        finish();
      }, ROUND_MS);

      tick();
      nextTrial();
    }

    function finish() {
      running = false;
      round++;                  // invalidate any callback still holding the old token
      clearTimers();
      endTimer = null;
      tickTimer = null;
      row.classList.remove("tapcolor-live");
      target.classList.remove("tapcolor-bad");

      var best = ctx.submitScore(score);
      status.innerHTML =
        '<span class="tapcolor-score">' + score + ' pts</span>' +
        '<span class="tapcolor-time">0s</span>';

      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + score + '</div>' +
          '<div class="g-sub">' + (best ? "new best! · " : "") + 'matched in 60s</div>' +
          '<button class="g-btn">play again</button>' +
        '</div>'
      );
    }

    function showOverlay(html) {
      overlay.innerHTML = html;
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", start);
      overlay.classList.add("show");
    }

    /* ---- initial idle state ---- */
    renderStatus();
    showOverlay(
      '<div class="g-result">' +
        '<div class="g-sub" style="margin-bottom:.4rem">60 seconds · match as many colours as you can</div>' +
        '<button class="g-btn">start</button>' +
      '</div>'
    );

    /* ---- teardown: stop the round and clear EVERY timer so nothing fires later ---- */
    return function () {
      running = false;
      round++;                  // any in-flight callback sees a stale token and bails
      clearTimers();            // clears end + tick + wrong-flash timers
      endTimer = null;
      tickTimer = null;
    };
  }
});
