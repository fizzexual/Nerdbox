/* Go / No-Go — tap the GREEN circle, freeze on RED. 25-trial round.
   Measures response inhibition: hitting GO targets while withholding on
   NO-GO targets. Accuracy over 25 trials is the score (higher = better). */
NERDBOX.injectStyle("gonogo", `
.gonogo-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  position: relative;
}
.gonogo-pad {
  position: relative;
  width: 100%;
  min-height: 300px;
  height: min(56vh, 380px);
  border-radius: 18px;
  background: var(--bg-alt);
  border: 2px solid var(--sub-alt);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: border-color 0.12s ease, background 0.12s ease;
  touch-action: manipulation;
}
.gonogo-pad.gonogo-right { border-color: var(--go); }
.gonogo-pad.gonogo-wrong { border-color: var(--error); }
.gonogo-circle {
  width: clamp(120px, 38vw, 200px);
  height: clamp(120px, 38vw, 200px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: "JetBrains Mono", monospace;
  font-weight: 700;
  font-size: clamp(1.4rem, 6vw, 2.1rem);
  letter-spacing: 0.06em;
  color: #fff;
  transform: scale(0.6);
  opacity: 0;
  transition: transform 0.1s ease, opacity 0.1s ease;
  pointer-events: none;
}
.gonogo-circle.gonogo-on { transform: scale(1); opacity: 1; }
.gonogo-circle.gonogo-go { background: var(--go); }
.gonogo-circle.gonogo-nogo { background: var(--error); }
.gonogo-cue {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: clamp(1rem, 4vw, 1.3rem);
  letter-spacing: 0.04em;
  pointer-events: none;
}
.gonogo-hint {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.85rem;
  text-align: center;
  line-height: 1.5;
}
.gonogo-hint b { color: var(--go); font-weight: 700; }
.gonogo-hint i { color: var(--error); font-style: normal; font-weight: 700; }
.gonogo-break b { color: var(--go); font-weight: 700; }
.gonogo-break i { color: var(--error); font-weight: 700; }
`);

NERDBOX.register({
  id: "gonogo",
  name: "Go / No-Go",
  tagline: "tap green, freeze on red",
  category: "attention",
  scoreMode: "max",
  formatScore: function (v) { return v + "%"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="12" r="4"/><path d="M16 8v8M19.5 9.5l-7 5"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;

    /* ---- config ---- */
    var TOTAL = 25;          // trials per round
    var GAP_MIN = 400;       // random pre-stimulus gap, ms
    var GAP_MAX = 1100;
    var STIM_MS = 900;       // window the stimulus is shown / clicks count
    var FEEDBACK_MS = 240;   // green/red border flash after a trial resolves
    var NOGO_RATE = 0.25;    // ~25% of trials are NO-GO (red)

    /* ---- timers: every active id is tracked and cleared on finish/teardown ---- */
    var gapTimer = null;     // gap -> show stimulus
    var stimTimer = null;    // stimulus window -> resolve (miss / correct-stop)
    var feedbackTimer = null;// clears the border flash + advances to next trial

    /* ---- state machine ---- */
    var running = false;     // a round is in progress
    var trial = 0;           // trials completed so far (0..TOTAL)
    var correct = 0;         // running correct count
    var hits = 0;            // GO + clicked in time
    var stops = 0;           // NO-GO + correctly withheld
    var isGo = true;         // current trial type
    var accepting = false;   // clicks only count while this is true
    var responded = false;   // guards against double clicks within a trial
    // token bumped each trial; every timer callback checks it so a stale
    // timer (after teardown/finish) can never mutate state.
    var token = 0;

    /* ---- layout ---- */
    var wrap = el("div", "gonogo-wrap");
    var status = el("div", "g-status");
    var pad = el("div", "gonogo-pad");
    var cue = el("div", "gonogo-cue", "");
    var circle = el("div", "gonogo-circle");
    pad.appendChild(cue);
    pad.appendChild(circle);
    var hint = el("div", "gonogo-hint",
      'tap the pad on <b>GREEN</b> &nbsp;·&nbsp; do <i>NOT</i> tap on red');
    var overlay = el("div", "g-overlay");

    wrap.appendChild(status);
    wrap.appendChild(pad);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    function clearTimers() {
      if (gapTimer !== null) { clearTimeout(gapTimer); gapTimer = null; }
      if (stimTimer !== null) { clearTimeout(stimTimer); stimTimer = null; }
      if (feedbackTimer !== null) { clearTimeout(feedbackTimer); feedbackTimer = null; }
    }

    function renderStatus() {
      status.innerHTML =
        '<span>trial ' + Math.min(trial + (running ? 1 : 0), TOTAL) + ' / ' + TOTAL + '</span>' +
        '<span class="gl-score">correct ' + correct + '</span>';
    }

    function hideStimulus() {
      circle.className = "gonogo-circle";
      circle.textContent = "";
    }

    function flash(cls) {
      pad.classList.remove("gonogo-right", "gonogo-wrong");
      void pad.offsetWidth; // reflow so re-adding re-triggers the transition
      pad.classList.add(cls);
    }

    // Resolve the current trial with the outcome, flash feedback, then
    // schedule the next trial. `good` => correct response for this trial.
    function resolveTrial(good, kind) {
      accepting = false;
      responded = true;
      var myToken = token; // freeze: only THIS trial's feedback timer should advance
      trial++;
      if (good) {
        correct++;
        if (kind === "hit") hits++;
        else if (kind === "stop") stops++;
      }
      hideStimulus();
      cue.textContent = "";
      flash(good ? "gonogo-right" : "gonogo-wrong");
      renderStatus();

      if (feedbackTimer !== null) { clearTimeout(feedbackTimer); }
      feedbackTimer = setTimeout(function () {
        feedbackTimer = null;
        if (!running || myToken !== token) return; // stale (torn down / restarted)
        pad.classList.remove("gonogo-right", "gonogo-wrong");
        if (trial >= TOTAL) finish();
        else nextTrial();
      }, FEEDBACK_MS);
    }

    // Begin a trial: blank gap, then reveal the stimulus for a fixed window.
    function nextTrial() {
      if (!running) return;
      token++;
      var myToken = token;
      accepting = false;
      responded = false;
      hideStimulus();
      cue.textContent = "ready…";
      renderStatus();

      var gap = GAP_MIN + ctx.util.rand(GAP_MAX - GAP_MIN + 1);
      if (gapTimer !== null) { clearTimeout(gapTimer); }
      gapTimer = setTimeout(function () {
        gapTimer = null;
        if (!running || myToken !== token) return; // stale guard
        showStimulus(myToken);
      }, gap);
    }

    function showStimulus(myToken) {
      if (!running || myToken !== token) return;
      isGo = Math.random() >= NOGO_RATE; // ~75% GO, ~25% NO-GO
      cue.textContent = "";
      circle.textContent = isGo ? "GO" : "STOP";
      circle.className = "gonogo-circle " + (isGo ? "gonogo-go" : "gonogo-nogo") + " gonogo-on";
      accepting = true;
      responded = false;

      if (stimTimer !== null) { clearTimeout(stimTimer); }
      stimTimer = setTimeout(function () {
        stimTimer = null;
        if (!running || myToken !== token) return; // stale guard
        // window elapsed with no click:
        //   GO  -> miss (incorrect)
        //   NO-GO -> correct inhibition (correct stop)
        resolveTrial(!isGo, isGo ? "miss" : "stop");
      }, STIM_MS);
    }

    // The pad click — only counts during the current trial's stimulus window.
    function onClick() {
      if (!running || !accepting || responded) return;
      // valid response: stop the stimulus-window timer so it can't double-fire
      if (stimTimer !== null) { clearTimeout(stimTimer); stimTimer = null; }
      if (isGo) {
        resolveTrial(true, "hit");        // GO + clicked = hit (correct)
      } else {
        resolveTrial(false, "falsealarm"); // NO-GO + clicked = false alarm (incorrect)
      }
    }

    function start() {
      clearTimers();
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      running = true;
      trial = 0;
      correct = 0;
      hits = 0;
      stops = 0;
      responded = false;
      accepting = false;
      pad.classList.remove("gonogo-right", "gonogo-wrong");
      renderStatus();
      nextTrial();
    }

    function finish() {
      running = false;
      accepting = false;
      clearTimers();
      hideStimulus();
      cue.textContent = "";
      pad.classList.remove("gonogo-right", "gonogo-wrong");

      var accuracy = Math.round((100 * correct) / TOTAL);
      var best = ctx.submitScore(accuracy);
      // recompute status as completed
      status.innerHTML =
        '<span>trial ' + TOTAL + ' / ' + TOTAL + '</span>' +
        '<span class="gl-score">correct ' + correct + '</span>';

      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + accuracy + '%</div>' +
          '<div class="g-sub gonogo-break">' +
            (best ? "new best! · " : "") +
            '<b>' + hits + '</b> hits · <i>' + stops + '</i> correct-stops' +
          '</div>' +
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

    pad.addEventListener("click", onClick);

    /* ---- initial idle state ---- */
    hideStimulus();
    cue.textContent = "";
    renderStatus();
    showOverlay(
      '<div class="g-result">' +
        '<div class="g-sub" style="margin-bottom:.4rem">25 trials · tap green, freeze on red</div>' +
        '<button class="g-btn">start</button>' +
      '</div>'
    );

    /* ---- teardown: stop the round and clear EVERY timer so nothing fires later ---- */
    return function () {
      running = false;
      accepting = false;
      responded = true;
      token++;            // invalidate any callback still holding an old token
      clearTimers();
      pad.removeEventListener("click", onClick);
    };
  }
});
