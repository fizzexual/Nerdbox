/* Tilt — orientation-discrimination threshold (a real psychophysics test).
   Each trial a grating of several parallel line segments is drawn on a <canvas>,
   tilted slightly from vertical either CLOCKWISE or COUNTER-CLOCKWISE by the
   current angle (chosen 50/50). It FLASHES for ~600ms then hides, so this is a
   perceptual judgement — you cannot line a ruler up against it. You then answer
   which way it leaned: "F"/ArrowLeft / ↺ = counter-clockwise, "J"/ArrowRight / ↻
   = clockwise.

   The tilt angle follows a 2-down / 1-up adaptive staircase: start 12°, two
   consecutive CORRECT answers shrink it ×0.8 (harder, closer to vertical), a
   single WRONG answer grows it ×1.25 (easier), clamped to [0.3°, 25°]. The run
   ends after 8 reversals or 60 trials. The reported THRESHOLD is the mean tilt
   over the last 6 reversals (degrees, one decimal) — lower = sharper orientation
   acuity. ctx.submitScore is called exactly once with that number.

   Anti-spam: the staircase converges on your actual discrimination limit. Only
   consistent correctness drives the angle down; always pressing the same key (or
   guessing) is right ~50% of the time, which keeps triggering the "one wrong →
   ×1.25" rule, so the angle floats high and the threshold stays large. There is
   no mash path to a low (good) score, and because the stimulus is flashed it
   must be perceived rather than measured. Self-contained: one injectStyle + one
   register, every setTimeout handle is tracked and the rAF id is cancelled on
   teardown, and the single document keydown listener is removed there too. */
NERDBOX.injectStyle("tilt", `
  .tilt-wrap {
    position: relative; width: 100%; max-width: 460px;
    display: flex; flex-direction: column; align-items: center; gap: 1.3rem;
    margin: 0 auto;
  }
  .tilt-stage {
    position: relative; width: 100%; max-width: 320px; aspect-ratio: 1 / 1;
    background: var(--bg-alt);
    border: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
    border-radius: 18px; overflow: hidden;
    transition: box-shadow 0.14s, border-color 0.14s;
  }
  /* keep a square even where aspect-ratio is unsupported */
  .tilt-stage::before { content: ""; display: block; padding-top: 100%; }
  .tilt-canvas {
    position: absolute; inset: 0; width: 100%; height: 100%; display: block;
  }
  .tilt-stage.tilt-good { border-color: var(--go); box-shadow: 0 0 0 1px var(--go), 0 0 26px -8px var(--go); }
  .tilt-stage.tilt-bad  { border-color: var(--error); box-shadow: 0 0 0 1px var(--error), 0 0 26px -8px var(--error); }
  .tilt-controls { display: flex; gap: 0.9rem; width: 100%; max-width: 320px; }
  .tilt-choice {
    flex: 1 1 0; border: 1px solid var(--sub-alt); background: transparent;
    color: var(--text); border-radius: 12px; padding: 0.8rem 0.6rem;
    font-family: "JetBrains Mono", monospace; font-size: 1.4rem; line-height: 1;
    cursor: pointer; transition: color 0.14s, border-color 0.14s, background 0.14s, transform 0.08s;
  }
  .tilt-choice:hover { border-color: var(--accent); background: var(--bg-alt); }
  .tilt-choice:active { transform: translateY(1px); }
  .tilt-choice .tilt-key {
    display: block; margin-top: 0.3rem; font-size: 0.62rem; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--sub);
  }
  .tilt-controls.tilt-locked .tilt-choice { pointer-events: none; opacity: 0.55; }
  .tilt-hint {
    font-family: "JetBrains Mono", monospace; font-size: 0.85rem;
    color: var(--sub); text-align: center; min-height: 1.2em;
  }
  .tilt-hint b { color: var(--accent); font-weight: 500; }
`);

NERDBOX.register({
  id: "tilt",
  name: "Tilt",
  tagline: "clockwise or counter — to the degree",
  category: "perception",
  test: true,                 // assessment: one comparable threshold, difficulty intentionally unset
  scoreMode: "min",           // lower threshold (degrees) = sharper orientation acuity
  formatScore: function (v) { return v + "°"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="21" x2="9" y2="3"/><line x1="13" y1="21" x2="14" y2="3"/><line x1="19" y1="21" x2="21" y2="5"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;

    // ---- protocol constants ----
    var START_ANGLE = 12;       // starting tilt from vertical, in degrees
    var MIN_ANGLE = 0.3;        // hardest (most vertical) the staircase may go
    var MAX_ANGLE = 25;         // easiest (most tilted) the staircase may go
    var DOWN_FACTOR = 0.8;      // 2 correct in a row -> angle * 0.8 (harder)
    var UP_FACTOR = 1.25;       // 1 wrong -> angle * 1.25 (easier)
    var MAX_REVERSALS = 8;      // stop after this many staircase reversals
    var MAX_TRIALS = 60;        // hard cap on trials regardless of reversals
    var REV_FOR_MEAN = 6;       // average the tilt over the last N reversals
    var FLASH_MS = 600;         // how long the grating is visible before hiding
    var LEAD_MS = 550;          // blank pause before each flash
    var FEEDBACK_MS = 420;      // green/red border flash after each answer
    var N_LINES = 7;            // parallel segments in the grating

    // ---- state ----
    var angle = START_ANGLE;    // current tilt magnitude (degrees)
    var dir = 0;                // this trial's true tilt: -1 counter, +1 clockwise
    var trials = 0;             // completed trials so far
    var consecCorrect = 0;      // run of correct answers (drives the 2-down rule)
    var lastStep = 0;           // last staircase move: -1 down, +1 up, 0 none yet
    var reversals = [];         // tilt magnitude recorded at each reversal
    var phase = "idle";         // "idle" | "lead" | "show" | "answer" | "feedback" | "over"
    var alive = true;           // guards async callbacks after teardown

    // ---- timer / raf tracking (every handle lands here; teardown releases all) ----
    var timers = [];
    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    function clearTimers() {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers = [];
    }
    var rafId = null;
    function cancelRaf() {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }

    // ---- DOM ----
    var status = el("div", "g-status", "");
    var wrap = el("div", "tilt-wrap");

    var stage = el("div", "tilt-stage");
    var canvas = document.createElement("canvas");
    canvas.className = "tilt-canvas";
    canvas.width = 320;         // backing resolution; CSS scales it to the square
    canvas.height = 320;
    stage.appendChild(canvas);
    var cctx = canvas.getContext("2d");

    var controls = el("div", "tilt-controls");
    var ccwBtn = el("button", "tilt-choice",
      "↺<span class=\"tilt-key\">F / ← counter</span>");
    var cwBtn = el("button", "tilt-choice",
      "↻<span class=\"tilt-key\">J / → clockwise</span>");
    ccwBtn.type = "button";
    cwBtn.type = "button";
    controls.appendChild(ccwBtn);
    controls.appendChild(cwBtn);

    var hint = el("div", "tilt-hint", "which way did it lean?");

    var overlay = el("div", "g-overlay");

    wrap.appendChild(stage);
    wrap.appendChild(controls);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    // ---- drawing ----
    // Draw a centred grating of parallel segments, rotated `deg` from vertical.
    // Positive deg leans clockwise (top tips toward the right), negative counter.
    function drawGrating(deg) {
      var W = canvas.width, H = canvas.height;
      var cx = W / 2, cy = H / 2;
      cctx.clearRect(0, 0, W, H);

      var theme = (ctx && ctx.themeColor) ? ctx.themeColor : null;
      var line = readVar("--text", "#d1d0c5");
      cctx.save();
      cctx.translate(cx, cy);
      cctx.rotate(deg * Math.PI / 180);   // canvas rotates the whole grating rigidly
      cctx.strokeStyle = theme || line;
      cctx.lineCap = "round";
      cctx.lineWidth = 4;

      var half = (N_LINES - 1) / 2;
      var spacing = 26;                   // gap between adjacent segments (px)
      var lenHalf = 96;                   // half-length of each segment (px)
      for (var i = 0; i < N_LINES; i++) {
        var x = (i - half) * spacing;
        cctx.beginPath();
        cctx.moveTo(x, -lenHalf);
        cctx.lineTo(x, lenHalf);
        cctx.stroke();
      }
      cctx.restore();
    }

    function clearCanvas() {
      cctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // resolve a CSS theme variable to a concrete colour for canvas strokes
    function readVar(name, fallback) {
      try {
        var v = getComputedStyle(document.documentElement).getPropertyValue(name);
        v = v ? v.replace(/^\s+|\s+$/g, "") : "";
        return v || fallback;
      } catch (e) { return fallback; }
    }

    // ---- helpers ----
    function setStatus() {
      var best = NERDBOX.getBest("tilt");
      status.innerHTML =
        '<span class="gl-score">trial ' + (trials + 1) + '</span>' +
        '<span class="gl-time">reversals ' + reversals.length + '/' + MAX_REVERSALS + '</span>' +
        (best === null ? "" : '<span class="gl-time">best ' + best + '°</span>');
    }

    function lockControls(locked) {
      if (locked) controls.classList.add("tilt-locked");
      else controls.classList.remove("tilt-locked");
    }

    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", function () {
        overlay.classList.remove("show");
        onPlay();
      });
      overlay.classList.add("show");
    }

    function clearFlash() {
      stage.classList.remove("tilt-good", "tilt-bad");
    }

    // ---- trial flow ----
    function nextTrial() {
      if (!alive || phase === "over") return;
      if (trials >= MAX_TRIALS || reversals.length >= MAX_REVERSALS) { finish(); return; }
      phase = "lead";
      lockControls(true);
      clearFlash();
      clearCanvas();
      setStatus();
      hint.textContent = "watch…";
      later(function () {
        if (!alive || phase !== "lead") return;
        showStimulus();
      }, LEAD_MS);
    }

    function showStimulus() {
      phase = "show";
      dir = rand(2) === 0 ? -1 : 1;       // 50/50 counter vs clockwise
      drawGrating(dir * angle);
      // hide after the flash window, then open the response phase
      later(function () {
        if (!alive || phase !== "show") return;
        clearCanvas();
        openAnswer();
      }, FLASH_MS);
    }

    function openAnswer() {
      phase = "answer";
      lockControls(false);
      hint.innerHTML = 'which way did it lean? <b>↺</b> or <b>↻</b>';
    }

    // record one answer, run the staircase, then advance
    function answer(saidDir) {
      if (!alive || phase !== "answer") return;
      phase = "feedback";
      lockControls(true);

      var correct = (saidDir === dir);
      stepStaircase(correct);
      trials++;

      stage.classList.add(correct ? "tilt-good" : "tilt-bad");
      hint.textContent = correct ? "correct" : "the other way";

      later(function () {
        if (!alive) return;
        clearFlash();
        nextTrial();
      }, FEEDBACK_MS);
    }

    // 2-down / 1-up staircase on the tilt magnitude, with reversal tracking.
    function stepStaircase(correct) {
      var step = 0;                       // -1 = harder (down), +1 = easier (up)
      if (correct) {
        consecCorrect++;
        if (consecCorrect >= 2) {         // two in a row -> make it harder
          consecCorrect = 0;
          angle = clampAngle(angle * DOWN_FACTOR);
          step = -1;
        }
      } else {
        consecCorrect = 0;                // any miss -> make it easier at once
        angle = clampAngle(angle * UP_FACTOR);
        step = 1;
      }
      // a reversal is a change of staircase direction; record the angle there
      if (step !== 0) {
        if (lastStep !== 0 && step !== lastStep) reversals.push(angle);
        lastStep = step;
      }
    }

    function clampAngle(a) {
      if (a < MIN_ANGLE) return MIN_ANGLE;
      if (a > MAX_ANGLE) return MAX_ANGLE;
      return a;
    }

    // ---- end of test: compute & submit the threshold exactly once ----
    function finish() {
      phase = "over";
      clearTimers();
      cancelRaf();
      clearCanvas();
      clearFlash();
      lockControls(true);

      var threshold = computeThreshold();
      ctx.submitScore(threshold);         // the ONE score: orientation threshold (deg)

      var best = NERDBOX.getBest("tilt");
      var isBest = best !== null && best === threshold;
      status.innerHTML = '<span class="gl-score">done</span>' +
        (best === null ? "" : '<span class="gl-time">best ' + best + '°</span>');
      hint.textContent = "";
      showOverlay(
        '<div class="g-result">' +
        '<div class="g-big">' + threshold + '°</div>' +
        '<div class="g-sub">' + (isBest ? "new best · " : "") + 'orientation threshold</div>' +
        '<div class="g-sub">smallest tilt you could reliably call — lower is sharper</div>' +
        '<button class="g-btn">retake</button>' +
        '</div>',
        startTest
      );
    }

    // mean tilt over the last REV_FOR_MEAN reversals; falls back to whatever
    // reversals exist (or the current angle if somehow none), rounded to 0.1°.
    function computeThreshold() {
      var src = reversals;
      if (src.length > REV_FOR_MEAN) src = src.slice(src.length - REV_FOR_MEAN);
      var sum = 0, n = src.length, i;
      if (n === 0) { sum = angle; n = 1; }
      else for (i = 0; i < src.length; i++) sum += src[i];
      return Math.round((sum / n) * 10) / 10;
    }

    function startTest() {
      clearTimers();
      cancelRaf();
      overlay.classList.remove("show");
      clearFlash();
      clearCanvas();
      angle = START_ANGLE;
      dir = 0;
      trials = 0;
      consecCorrect = 0;
      lastStep = 0;
      reversals = [];
      phase = "idle";
      setStatus();
      later(nextTrial, LEAD_MS);
    }

    // ---- input ----
    function pressCCW() { answer(-1); }   // counter-clockwise
    function pressCW() { answer(1); }     // clockwise

    function onKey(e) {
      if (phase !== "answer") return;
      var k = e.key;
      if (k === "f" || k === "F" || k === "ArrowLeft") {
        e.preventDefault();
        pressCCW();
      } else if (k === "j" || k === "J" || k === "ArrowRight") {
        e.preventDefault();
        pressCW();
      }
    }

    // ---- wiring ----
    ccwBtn.addEventListener("click", pressCCW);
    cwBtn.addEventListener("click", pressCW);
    document.addEventListener("keydown", onKey);

    // ---- intro screen ----
    status.textContent = "orientation threshold — adaptive staircase";
    lockControls(true);
    showOverlay(
      '<div class="g-result">' +
      '<div class="g-sub" style="margin-bottom:.4rem">a grating flashes tilted from vertical — was it <b>↺</b> or <b>↻</b>?</div>' +
      '<div class="g-sub">keys F / ← = counter, J / → = clockwise · the tilt shrinks as you get it right</div>' +
      '<button class="g-btn">start</button>' +
      '</div>',
      startTest
    );

    // ---- teardown: stop the run, release every timer + the rAF id, and detach
    // the one document listener, so nothing fires or leaks after unmount ----
    return function teardown() {
      alive = false;
      phase = "over";
      clearTimers();
      cancelRaf();
      document.removeEventListener("keydown", onKey);
    };
  }
});
