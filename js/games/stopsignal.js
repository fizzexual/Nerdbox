/* Stop-Signal — a stop-signal task that estimates inhibition speed (SSRT).
   48 trials. Each trial: a fixation cross, then a GO stimulus — a large arrow
   pointing LEFT or RIGHT. Respond with the matching key as fast as you can:
   Left = "F" / ArrowLeft, Right = "J" / ArrowRight. Reaction time is recorded
   for CORRECT go responses (a wrong-direction press is an error and counts
   against go-accuracy).

   On ~25% of trials (~12 of 48, chosen randomly) a STOP SIGNAL fires: a short
   delay (SSD) AFTER the arrow appears, the arrow turns RED and "STOP" shows —
   the player must WITHHOLD (press nothing). The SSD is STAIRCASED (tracking):
   start 250ms; +50ms after a successful stop (harder), -50ms after a failed
   stop (easier), clamped to [50, 700]. This converges to ~50% inhibition.

   Metric (scoreMode "min", lower = better):
     SSRT = mean(correct go-RT) - mean(SSD over stop trials), rounded to ms.
   submitScore is called exactly once, at the end, with that SSRT.

   ANTI-SPAM: wrong-direction go presses are errors that tank go-accuracy;
   mashing both keys fails stop trials (SSD drops) AND tanks go-accuracy. A
   minimum count of valid go-RTs is required before SSRT is computed, go-RT
   below 100ms is rejected, and very low go-accuracy marks the run invalid.

   Cleanup: every setTimeout id (fixation, SSD delay, go-window, inter-trial)
   is tracked and cleared on finish AND teardown. A single document keydown
   listener is removed on teardown. A `token` is bumped on every trial / start
   / finish / teardown, so any in-flight callback that fires late sees a stale
   token and bails — nothing can fire or mutate state after unmount. */
NERDBOX.injectStyle("stopsignal", `
.ss-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.3rem;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  position: relative;
}
.ss-stage {
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
  user-select: none;
  -webkit-user-select: none;
  transition: border-color 0.12s ease;
  overflow: hidden;
}
.ss-stage.ss-right { border-color: var(--go); }
.ss-stage.ss-wrong { border-color: var(--error); }
/* fixation cross — shown during the pre-stimulus gap */
.ss-fix {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: clamp(2rem, 9vw, 3rem);
  line-height: 1;
  pointer-events: none;
}
/* the GO arrow */
.ss-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--go);
  transform: scale(0.7);
  opacity: 0;
  transition: transform 0.08s ease, opacity 0.08s ease, color 0.08s ease;
  pointer-events: none;
}
.ss-arrow.ss-on { transform: scale(1); opacity: 1; }
.ss-arrow.ss-stop { color: var(--error); }
.ss-arrow svg {
  width: clamp(120px, 40vw, 200px);
  height: clamp(120px, 40vw, 200px);
  display: block;
}
/* "STOP" label that accompanies the red arrow */
.ss-stoplabel {
  position: absolute;
  bottom: clamp(14px, 5vw, 28px);
  left: 0;
  right: 0;
  text-align: center;
  font-family: "JetBrains Mono", monospace;
  font-weight: 700;
  letter-spacing: 0.14em;
  font-size: clamp(1.1rem, 5vw, 1.6rem);
  color: var(--error);
  opacity: 0;
  transition: opacity 0.06s ease;
  pointer-events: none;
}
.ss-stoplabel.ss-on { opacity: 1; }
.ss-cue {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: clamp(0.95rem, 4vw, 1.15rem);
  letter-spacing: 0.04em;
  min-height: 1.4em;
  text-align: center;
}
.ss-cue.ss-cuestop { color: var(--error); font-weight: 700; }
.ss-hint {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.85rem;
  text-align: center;
  line-height: 1.5;
}
.ss-hint b { color: var(--go); font-weight: 700; }
.ss-hint i { color: var(--error); font-style: normal; font-weight: 700; }
.ss-break b { color: var(--go); font-weight: 700; }
.ss-break i { color: var(--error); font-style: normal; font-weight: 700; }
`);

NERDBOX.register({
  id: "stopsignal",
  name: "Stop-Signal",
  tagline: "go fast — but stop when told",
  category: "attention",
  test: true,
  scoreMode: "min",
  formatScore: function (v) { return v + " ms"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 11h9M7 7l-4 4 4 4"/><path d="M14 8.5l3.2-2.4a1.1 1.1 0 0 1 1.8.9V14a4 4 0 0 1-4 4h-1.2a3 3 0 0 1-2.3-1.1"/><path d="M14 8.5V5a1.2 1.2 0 0 1 2.4 0v3"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;

    /* ---- config ---- */
    var TOTAL = 48;          // fixed trial count
    var STOP_TARGET = 12;    // ~25% of trials carry a stop signal
    var GAP_MIN = 450;       // random pre-stimulus fixation gap, ms
    var GAP_MAX = 900;
    var GO_WINDOW = 1500;    // window the arrow stays up / go presses count, ms
    var ITI_MS = 480;        // inter-trial feedback flash before the next trial
    var SSD_START = 250;     // staircase starting stop-signal delay, ms
    var SSD_STEP = 50;       // staircase step
    var SSD_MIN = 50;
    var SSD_MAX = 700;
    var MIN_GO_RT = 100;     // go-RTs faster than this are rejected (anticipation)
    var MIN_VALID_GO = 8;    // need at least this many valid go-RTs for a score
    var MIN_GO_ACC = 0.6;    // below this go-accuracy the run is invalid

    var LEFT = "left", RIGHT = "right";
    // F / J are the home-row response keys; arrows are accepted too.
    var KEY_TO_DIR = {
      f: LEFT, ArrowLeft: LEFT,
      j: RIGHT, ArrowRight: RIGHT
    };
    var ARROW_SVG = {
      left:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12H4M11 19l-7-7 7-7"/></svg>',
      right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h17M13 5l7 7-7 7"/></svg>'
    };

    /* ---- timers: each outstanding id is tracked and cleared on finish AND
       teardown. At most one of gap/go is live at a time; stopTimer overlaps the
       go-window on stop trials. ---- */
    var gapTimer = null;     // fixation gap -> show arrow
    var stopTimer = null;    // SSD delay -> turn arrow red (stop signal)
    var goTimer = null;      // go-window elapsed -> resolve (miss / correct-stop)
    var itiTimer = null;     // feedback flash -> advance to next trial

    /* ---- state machine ---- */
    var running = false;     // a round is in progress
    var trial = 0;           // trials completed so far (0..TOTAL)
    var isStop = false;      // current trial carries a stop signal
    var stopShown = false;   // the red stop signal has appeared this trial
    var dir = LEFT;          // current arrow direction
    var accepting = false;   // key input counts only while true
    var responded = false;   // guards a trial against a second response
    var cueTime = 0;         // performance.now() when the arrow appeared
    var ssd = SSD_START;     // current staircased stop-signal delay
    var stopSchedule = [];   // per-trial booleans: which trials carry a stop

    /* ---- tallies ---- */
    var goRTs = [];          // valid correct go-RTs (>= MIN_GO_RT)
    var goCorrect = 0;       // correct-direction go responses (go trials)
    var goErrors = 0;        // wrong-direction / anticipatory presses (go trials)
    var goMiss = 0;          // go trials with no response in the window
    var stopSSDs = [];       // SSD used on each stop trial (for SSRT)
    var stopSuccess = 0;     // stop trials where the player withheld
    var stopFail = 0;        // stop trials where the player pressed
    // token bumped each trial / start / finish / teardown; every timer callback
    // captures it and bails if it no longer matches → no stale mutation.
    var token = 0;

    /* ---- layout ---- */
    var wrap = el("div", "ss-wrap");
    var status = el("div", "g-status");
    var stage = el("div", "ss-stage");
    var fix = el("div", "ss-fix", "+");
    var arrow = el("div", "ss-arrow");
    var stopLabel = el("div", "ss-stoplabel", "STOP");
    stage.appendChild(fix);
    stage.appendChild(arrow);
    stage.appendChild(stopLabel);
    var cue = el("div", "ss-cue", "");
    var hint = el("div", "ss-hint",
      'left arrow → press <b>F</b> &nbsp;·&nbsp; right arrow → press <b>J</b><br>' +
      'if it turns <i>RED</i>, press <i>nothing</i>');
    var overlay = el("div", "g-overlay");

    wrap.appendChild(status);
    wrap.appendChild(stage);
    wrap.appendChild(cue);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    function clearTimers() {
      if (gapTimer !== null) { clearTimeout(gapTimer); gapTimer = null; }
      if (stopTimer !== null) { clearTimeout(stopTimer); stopTimer = null; }
      if (goTimer !== null) { clearTimeout(goTimer); goTimer = null; }
      if (itiTimer !== null) { clearTimeout(itiTimer); itiTimer = null; }
    }

    // Build a stop schedule: STOP_TARGET stop trials placed randomly among TOTAL,
    // avoiding a stop on the very first trial so there is always a go baseline.
    function buildSchedule() {
      var sched = [];
      var i;
      for (i = 0; i < TOTAL; i++) sched.push(false);
      var placed = 0;
      var guard = 0; // bounded: cap attempts so the loop can never run away
      var maxGuard = TOTAL * 40;
      while (placed < STOP_TARGET && guard < maxGuard) {
        guard++;
        var idx = 1 + ctx.util.rand(TOTAL - 1); // never index 0
        if (!sched[idx]) { sched[idx] = true; placed++; }
      }
      // Fallback (defensive): if randomness under-filled, sweep deterministically.
      for (i = 1; i < TOTAL && placed < STOP_TARGET; i++) {
        if (!sched[i]) { sched[i] = true; placed++; }
      }
      return sched;
    }

    function mean(arr) {
      if (!arr.length) return 0;
      var sum = 0;
      for (var i = 0; i < arr.length; i++) sum += arr[i];
      return sum / arr.length;
    }

    function renderStatus() {
      var shown = running ? Math.min(trial + 1, TOTAL) : Math.min(trial, TOTAL);
      var goSeen = goCorrect + goErrors + goMiss;
      var accTxt = goSeen ? Math.round((100 * goCorrect) / goSeen) + "%" : "—";
      status.innerHTML =
        '<span>trial ' + shown + ' / ' + TOTAL + '</span>' +
        '<span class="gl-score">go-acc ' + accTxt + '</span>';
    }

    function hideStimulus() {
      arrow.className = "ss-arrow";
      arrow.innerHTML = "";
      stopLabel.className = "ss-stoplabel";
      fix.style.opacity = "0";
    }

    function flash(cls) {
      stage.classList.remove("ss-right", "ss-wrong");
      void stage.offsetWidth; // reflow so re-adding re-triggers the transition
      stage.classList.add(cls);
    }

    // Resolve the current trial with a feedback flash, then schedule the next.
    // `good` => correct outcome (correct go press, or a successful stop).
    function resolveTrial(good, cueText, cueStop) {
      accepting = false;
      responded = true;
      var myToken = token; // freeze: only THIS trial's ITI timer advances
      trial++;
      hideStimulus();
      cue.className = "ss-cue" + (cueStop ? " ss-cuestop" : "");
      cue.textContent = cueText || "";
      flash(good ? "ss-right" : "ss-wrong");
      renderStatus();

      if (itiTimer !== null) { clearTimeout(itiTimer); }
      itiTimer = setTimeout(function () {
        itiTimer = null;
        if (!running || myToken !== token) return; // stale (torn down / restarted)
        stage.classList.remove("ss-right", "ss-wrong");
        if (trial >= TOTAL) finish();
        else nextTrial();
      }, ITI_MS);
    }

    // Begin a trial: show the fixation cross for a random gap, then the arrow.
    function nextTrial() {
      if (!running) return;
      token++;
      var myToken = token;
      accepting = false;
      responded = false;
      stopShown = false;
      isStop = !!stopSchedule[trial];
      dir = (ctx.util.rand(2) === 0) ? LEFT : RIGHT;

      arrow.className = "ss-arrow";
      arrow.innerHTML = "";
      stopLabel.className = "ss-stoplabel";
      fix.style.opacity = "1";
      cue.className = "ss-cue";
      cue.textContent = "ready…";
      renderStatus();

      var gap = GAP_MIN + ctx.util.rand(GAP_MAX - GAP_MIN + 1);
      if (gapTimer !== null) { clearTimeout(gapTimer); }
      gapTimer = setTimeout(function () {
        gapTimer = null;
        if (!running || myToken !== token) return; // stale guard
        showArrow(myToken);
      }, gap);
    }

    function showArrow(myToken) {
      if (!running || myToken !== token) return;
      fix.style.opacity = "0";
      arrow.innerHTML = ARROW_SVG[dir];
      arrow.className = "ss-arrow ss-on";
      cue.className = "ss-cue";
      cue.textContent = "go!";
      accepting = true;
      responded = false;
      cueTime = performance.now();

      // On a stop trial, schedule the stop signal after the current SSD.
      if (isStop) {
        if (stopTimer !== null) { clearTimeout(stopTimer); }
        stopTimer = setTimeout(function () {
          stopTimer = null;
          if (!running || myToken !== token) return; // stale guard
          if (responded) return; // already answered before the signal fired
          stopShown = true;
          arrow.className = "ss-arrow ss-on ss-stop";
          stopLabel.className = "ss-stoplabel ss-on";
          cue.className = "ss-cue ss-cuestop";
          cue.textContent = "STOP!";
        }, ssd);
      }

      // Go-window timeout: no response within the window.
      if (goTimer !== null) { clearTimeout(goTimer); }
      goTimer = setTimeout(function () {
        goTimer = null;
        if (!running || myToken !== token) return; // stale guard
        if (responded) return;
        // window elapsed with no press
        if (isStop) {
          onStopOutcome(true);  // correctly withheld → success, SSD up
        } else {
          goMiss++;
          resolveTrial(false, "missed", false); // go trial with no response
        }
      }, GO_WINDOW);
    }

    // Staircase + tally for a stop trial. `withheld` => the player pressed nothing.
    function onStopOutcome(withheld) {
      // cancel the still-pending stop signal if the trial resolved before it fired
      if (stopTimer !== null) { clearTimeout(stopTimer); stopTimer = null; }
      stopSSDs.push(ssd);
      if (withheld) {
        stopSuccess++;
        ssd += SSD_STEP;                 // make the next stop harder
        if (ssd > SSD_MAX) ssd = SSD_MAX;
        resolveTrial(true, "stopped ✓", true);
      } else {
        stopFail++;
        ssd -= SSD_STEP;                 // make the next stop easier
        if (ssd < SSD_MIN) ssd = SSD_MIN;
        resolveTrial(false, "didn't stop", true);
      }
    }

    // A key response arrives. Only counts during the current go-window.
    function respond(pressedDir) {
      if (!running || !accepting || responded) return;
      var rt = Math.round(performance.now() - cueTime);
      // a press ends the trial: stop the go-window timer immediately
      if (goTimer !== null) { clearTimeout(goTimer); goTimer = null; }

      if (isStop) {
        // any press on a stop trial = failed inhibition (staircase eases)
        onStopOutcome(false);
        return;
      }

      // go trial
      if (pressedDir !== dir) {
        // wrong direction → error, counts against go-accuracy
        goErrors++;
        resolveTrial(false, "wrong way", false);
        return;
      }
      if (rt < MIN_GO_RT) {
        // too fast to be a real reaction → treated as an anticipatory error,
        // not banked as a valid RT (anti-spam: mashing can't farm fast RTs)
        goErrors++;
        resolveTrial(false, "too fast", false);
        return;
      }
      goCorrect++;
      goRTs.push(rt);
      resolveTrial(true, rt + " ms", false);
    }

    /* ---- keyboard input: a single document keydown listener ---- */
    function onKeyDown(e) {
      var pressedDir = KEY_TO_DIR[e.key];
      if (!pressedDir) {
        // accept upper-case F / J too, regardless of caps/shift state
        if (e.key === "F") pressedDir = LEFT;
        else if (e.key === "J") pressedDir = RIGHT;
      }
      if (!pressedDir) return;
      if (running && accepting && !responded) {
        e.preventDefault(); // stop the page scrolling on arrow keys mid-trial
        respond(pressedDir);
      }
    }

    function start() {
      clearTimers();
      token++;             // invalidate any pending callback before resetting
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      running = true;
      trial = 0;
      isStop = false;
      stopShown = false;
      accepting = false;
      responded = false;
      ssd = SSD_START;
      stopSchedule = buildSchedule();
      goRTs = [];
      goCorrect = 0;
      goErrors = 0;
      goMiss = 0;
      stopSSDs = [];
      stopSuccess = 0;
      stopFail = 0;
      stage.classList.remove("ss-right", "ss-wrong");
      hideStimulus();
      renderStatus();
      nextTrial();
    }

    function finish() {
      running = false;
      accepting = false;
      responded = true;
      token++;             // any in-flight callback now sees a stale token
      clearTimers();
      hideStimulus();
      stage.classList.remove("ss-right", "ss-wrong");
      cue.className = "ss-cue";
      cue.textContent = "";

      var goSeen = goCorrect + goErrors + goMiss;
      var goAcc = goSeen ? goCorrect / goSeen : 0;
      var stopSeen = stopSuccess + stopFail;
      var goAccPct = Math.round(100 * goAcc);
      var stopPct = stopSeen ? Math.round((100 * stopSuccess) / stopSeen) : 0;

      // Validity gates (anti-spam): enough clean go-RTs AND acceptable accuracy.
      var valid = (goRTs.length >= MIN_VALID_GO) && (goAcc >= MIN_GO_ACC);

      var ssrt;
      if (valid) {
        ssrt = Math.round(mean(goRTs) - mean(stopSSDs));
        if (ssrt < 0) ssrt = 0; // SSRT cannot be negative; clamp the estimate
      } else {
        // invalid run: submit a deliberately poor (high) score so it can't beat
        // a real attempt, and label the result "test invalid".
        ssrt = GO_WINDOW; // worst plausible value
      }

      var best = ctx.submitScore(ssrt);
      renderStatus();

      var resultBig, resultSub;
      if (valid) {
        resultBig = ssrt + ' ms';
        resultSub =
          (best ? "new best! · " : "") +
          'SSRT · <b>' + goAccPct + '%</b> go-acc · <i>' + stopPct + '%</i> stops';
      } else {
        resultBig = 'test invalid';
        resultSub =
          'too few clean responses · ' +
          '<b>' + goAccPct + '%</b> go-acc · <i>' + stopPct + '%</i> stops';
      }

      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + resultBig + '</div>' +
          '<div class="g-sub ss-break">' + resultSub + '</div>' +
          '<button class="g-btn">retake</button>' +
        '</div>'
      );
    }

    function showOverlay(html) {
      overlay.innerHTML = html;
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", start);
      overlay.classList.add("show");
    }

    document.addEventListener("keydown", onKeyDown);

    /* ---- initial idle state ---- */
    hideStimulus();
    fix.style.opacity = "0";
    renderStatus();
    showOverlay(
      '<div class="g-result">' +
        '<div class="g-sub" style="margin-bottom:.4rem">48 trials · press F / J for the arrow — but freeze if it turns red</div>' +
        '<button class="g-btn">start</button>' +
      '</div>'
    );

    /* ---- teardown: stop the round, clear EVERY timer, drop the key listener ---- */
    return function () {
      running = false;
      accepting = false;
      responded = true;
      token++;            // any in-flight callback bails on the stale token
      clearTimers();      // fixation, SSD delay, go-window, inter-trial
      document.removeEventListener("keydown", onKeyDown);
    };
  }
});
