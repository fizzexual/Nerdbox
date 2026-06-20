/* Motion Sense — Random-Dot Kinematogram (RDK), coherence threshold via staircase.
   A circular aperture of ~120 small dots drifts for ~1.2s. On each trial a fraction
   = COHERENCE of the dots move together LEFT or RIGHT (chosen at random); the rest
   are "noise" with a fresh random heading every frame. Dots leaving the aperture
   respawn on the far side. After the motion stops the player reports the direction
   (F / ArrowLeft / ◀ , or J / ArrowRight / ▶).

   Adaptive 2-down/1-up staircase on coherence -> converges near 71% correct:
   two consecutive CORRECT -> coherence x0.8 (harder); one WRONG -> x1.25 (easier),
   clamped to [2%, 90%]. Runs until 8 reversals or 60 trials. Threshold = mean
   coherence over the last 6 reversals, rounded. submitScore(threshold), lower=better.

   Anti-spam: always picking one side is right ~50%, so the 2-down rule almost never
   fires twice in a row at low coherence — the staircase stops descending and the
   threshold settles high. You must genuinely SEE the motion to drive it down. */
NERDBOX.injectStyle("motioncoh", `
.mc-wrap { width: 100%; max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 1rem; }
.mc-status { font-family: "JetBrains Mono", monospace; color: var(--sub); font-size: 1rem; min-height: 1.4em; display: flex; gap: 1.6rem; justify-content: center; align-items: baseline; flex-wrap: wrap; text-align: center; }
.mc-status b { color: var(--text); font-weight: 500; }
.mc-rev { color: var(--accent); font-weight: 700; font-size: 1.25rem; min-width: 1.2em; display: inline-block; text-align: center; }
.mc-host { position: relative; width: min(380px, 92vw); }
.mc-canvas { display: block; width: 100%; height: auto; background: var(--bg-alt); border: 2px solid var(--sub-alt); border-radius: 50%; touch-action: none; user-select: none; -webkit-user-select: none; }
.mc-choices { display: flex; gap: 1rem; width: 100%; justify-content: center; }
.mc-arrow { font-family: "JetBrains Mono", monospace; font-size: 1.7rem; line-height: 1; padding: 0.6rem 1.4rem; min-width: 4.5rem; border-radius: 12px; border: 2px solid var(--sub-alt); background: var(--bg-alt); color: var(--text); cursor: pointer; transition: border-color 0.08s ease, background 0.08s ease, transform 0.08s ease; }
.mc-arrow:hover { border-color: var(--accent); }
.mc-arrow:active { transform: scale(0.96); }
.mc-arrow:disabled { opacity: 0.4; cursor: default; }
.mc-arrow.mc-flash-ok { border-color: var(--go); background: color-mix(in srgb, var(--go) 22%, transparent); }
.mc-arrow.mc-flash-bad { border-color: var(--error); background: color-mix(in srgb, var(--error) 22%, transparent); }
.mc-arrow .mc-key { display: block; font-size: 0.72rem; color: var(--sub); margin-top: 0.3rem; letter-spacing: 0.06em; }
.mc-hint { font-family: "JetBrains Mono", monospace; color: var(--sub); font-size: 0.82rem; text-align: center; line-height: 1.5; }
.mc-hint b { color: var(--text); font-weight: 700; }
`);

NERDBOX.register({
  id: "motioncoh",
  name: "Motion Sense",
  tagline: "which way do the dots drift",
  category: "perception",
  test: true,
  scoreMode: "min",
  formatScore: function (v) { return v + "% coh"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="7" r="1" fill="currentColor"/><circle cx="6" cy="16" r="1" fill="currentColor"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="11" cy="18" r="1" fill="currentColor"/><path d="M14 12h7M18 9l3 3-3 3"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;
    // ctx.util.rand(n) returns an int 0..n-1; for [0,1) floats we use Math.random()
    // directly (the same approach pursuit.js / mot.js use for angles and positions).
    var rnd = function () { return Math.random(); };

    /* ---- config ---- */
    var N_DOTS = 120;          // dots in the aperture
    var DOT_R = 2.2;           // dot radius (canvas px)
    var SPEED = 1.5;           // dot step length per frame (canvas px)
    var MOTION_MS = 1200;      // how long each trial's motion plays
    var FLASH_MS = 420;        // correct/incorrect flash before next trial
    var SIZE = 320;            // canvas backing size (square, px)
    var RADIUS = SIZE / 2 - 6; // aperture radius (px)

    var START_COH = 50;        // starting coherence (%)
    var DOWN_FACTOR = 0.8;     // x after two consecutive correct (harder)
    var UP_FACTOR = 1.25;      // x after one wrong (easier)
    var MIN_COH = 2;           // clamp floor (%)
    var MAX_COH = 90;          // clamp ceiling (%)
    var MAX_REVERSALS = 8;     // stop after this many staircase reversals
    var MAX_TRIALS = 60;       // hard cap on trials
    var LAST_REVERSALS = 6;    // average this many trailing reversals for threshold

    /* ---- state ---- */
    var running = false;       // rAF motion loop active
    var rafId = null;          // current animation-frame handle
    var trialTimer = null;     // setTimeout: end-of-motion
    var flashTimer = null;     // setTimeout: post-answer flash -> next trial
    var awaiting = false;      // motion stopped, waiting for L/R answer
    var finished = false;      // whole test complete

    var coh = START_COH;       // current coherence (%)
    var dir = 1;               // this trial's signal direction: -1 left, +1 right
    var trials = 0;            // trials completed
    var correctRun = 0;        // consecutive correct count (for 2-down)
    var lastStep = 0;          // last staircase move: -1 down, +1 up, 0 none
    var reversals = [];        // coherence values recorded at each reversal

    var dots = [];             // { x, y, vx, vy } in canvas coords

    /* ---- layout ---- */
    var wrap = el("div", "mc-wrap");
    var status = el("div", "mc-status",
      '<span>reversals <span class="mc-rev">0</span>/' + MAX_REVERSALS + '</span>' +
      '<span><b class="mc-msg">tap start</b></span>');
    var host = el("div", "mc-host");
    var canvas = el("canvas", "mc-canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    var overlay = el("div", "g-overlay");
    host.appendChild(canvas);
    host.appendChild(overlay);

    var choices = el("div", "mc-choices");
    var leftBtn = el("button", "mc-arrow",
      '◀<span class="mc-key">F / ←</span>');
    leftBtn.type = "button";
    var rightBtn = el("button", "mc-arrow",
      '▶<span class="mc-key">J / →</span>');
    rightBtn.type = "button";
    choices.appendChild(leftBtn);
    choices.appendChild(rightBtn);

    var hint = el("div", "mc-hint",
      'watch the dots, then pick the way <b>most</b> of them drifted');

    wrap.appendChild(status);
    wrap.appendChild(host);
    wrap.appendChild(choices);
    wrap.appendChild(hint);
    root.appendChild(wrap);

    var revEl = status.querySelector(".mc-rev");
    var msgEl = status.querySelector(".mc-msg");
    var cctx = canvas.getContext("2d");

    function setMsg(text) { msgEl.textContent = text; }
    function setButtons(on) { leftBtn.disabled = !on; rightBtn.disabled = !on; }

    /* ---- timers ---- */
    function clearTrialTimer() {
      if (trialTimer !== null) { clearTimeout(trialTimer); trialTimer = null; }
    }
    function clearFlashTimer() {
      if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
    }
    function stopLoop() {
      running = false;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }

    /* ---- aperture / dots ---- */
    function randAngle() { return rnd() * Math.PI * 2; }

    // place a dot at a uniformly random point inside the circular aperture
    function placeInside(d) {
      var r = Math.sqrt(rnd()) * RADIUS;
      var a = randAngle();
      d.x = SIZE / 2 + Math.cos(a) * r;
      d.y = SIZE / 2 + Math.sin(a) * r;
    }

    // build the dot pool once per trial
    function seedDots() {
      dots = [];
      for (var i = 0; i < N_DOTS; i++) {
        var d = { x: 0, y: 0, vx: 0, vy: 0 };
        placeInside(d);
        dots.push(d);
      }
    }

    // wrap a dot that has left the aperture back to the opposite edge
    function respawn(d) {
      var a = randAngle();
      // drop it on the rim, biased opposite its travel so it sweeps across
      d.x = SIZE / 2 + Math.cos(a) * RADIUS;
      d.y = SIZE / 2 + Math.sin(a) * RADIUS;
    }

    // advance every dot one frame; `signalCount` of them share the trial direction,
    // the rest get a fresh random heading (noise re-randomized each frame).
    function advance(signalCount) {
      var cx = SIZE / 2, cy = SIZE / 2;
      var svx = dir * SPEED, svy = 0; // signal moves horizontally L/R
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        if (i < signalCount) {
          d.vx = svx; d.vy = svy;
        } else {
          var a = randAngle();
          d.vx = Math.cos(a) * SPEED;
          d.vy = Math.sin(a) * SPEED;
        }
        d.x += d.vx;
        d.y += d.vy;
        var dx = d.x - cx, dy = d.y - cy;
        if (dx * dx + dy * dy > RADIUS * RADIUS) respawn(d);
      }
    }

    function draw() {
      cctx.clearRect(0, 0, SIZE, SIZE);
      cctx.fillStyle = ctx.themeColor("--text") || "#ffffff";
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        cctx.beginPath();
        cctx.arc(d.x, d.y, DOT_R, 0, Math.PI * 2);
        cctx.fill();
      }
    }

    function drawEmpty() {
      cctx.clearRect(0, 0, SIZE, SIZE);
    }

    /* ---- trial flow ---- */
    function startTrial() {
      stopLoop();
      clearTrialTimer();
      clearFlashTimer();
      leftBtn.classList.remove("mc-flash-ok", "mc-flash-bad");
      rightBtn.classList.remove("mc-flash-ok", "mc-flash-bad");

      awaiting = false;
      setButtons(false);
      setMsg("watch...");

      dir = rnd() < 0.5 ? -1 : 1;
      var signalCount = Math.round(N_DOTS * (coh / 100));
      if (signalCount < 0) signalCount = 0;
      if (signalCount > N_DOTS) signalCount = N_DOTS;

      seedDots();

      running = true;
      rafId = requestAnimationFrame(function loop() {
        if (!running) return;
        advance(signalCount);
        draw();
        rafId = requestAnimationFrame(loop);
      });

      // stop the motion after MOTION_MS and ask for the answer
      trialTimer = setTimeout(function () {
        trialTimer = null;
        stopLoop();
        drawEmpty();
        awaiting = true;
        setButtons(true);
        setMsg("which way?");
      }, MOTION_MS);
    }

    // record a response (resp: -1 left, +1 right)
    function answer(resp) {
      if (!awaiting || finished) return;
      awaiting = false;
      setButtons(false);

      var correct = (resp === dir);
      trials++;

      // flash feedback on the button the player chose
      var btn = resp < 0 ? leftBtn : rightBtn;
      btn.classList.add(correct ? "mc-flash-ok" : "mc-flash-bad");

      // ---- staircase update (2-down / 1-up) ----
      var step = 0; // -1 = coherence went down (harder), +1 = up (easier)
      if (correct) {
        correctRun++;
        if (correctRun >= 2) {
          coh = clampCoh(coh * DOWN_FACTOR);
          correctRun = 0;
          step = -1;
        }
      } else {
        correctRun = 0;
        coh = clampCoh(coh * UP_FACTOR);
        step = 1;
      }

      // a reversal = the staircase changed direction (down->up or up->down)
      if (step !== 0) {
        if (lastStep !== 0 && step !== lastStep) {
          reversals.push(coh);
          revEl.textContent = String(reversals.length);
        }
        lastStep = step;
      }

      var done = reversals.length >= MAX_REVERSALS || trials >= MAX_TRIALS;

      flashTimer = setTimeout(function () {
        flashTimer = null;
        if (done) finish();
        else startTrial();
      }, FLASH_MS);
    }

    function clampCoh(v) {
      if (v < MIN_COH) return MIN_COH;
      if (v > MAX_COH) return MAX_COH;
      return v;
    }

    // threshold = mean coherence over the last LAST_REVERSALS reversals (rounded).
    // if too few reversals were collected, average whatever we have, then the
    // current coherence as a fallback so a score is always produced.
    function computeThreshold() {
      var vals = reversals.slice();
      var start = vals.length > LAST_REVERSALS ? vals.length - LAST_REVERSALS : 0;
      var used = vals.slice(start);
      if (used.length === 0) used = [coh];
      var sum = 0;
      for (var i = 0; i < used.length; i++) sum += used[i];
      return Math.round(sum / used.length);
    }

    function finish() {
      finished = true;
      stopLoop();
      clearTrialTimer();
      clearFlashTimer();
      setButtons(false);
      drawEmpty();

      var threshold = computeThreshold();
      setMsg("done");
      var best = ctx.submitScore(threshold);

      showOverlay(
        '<div class="g-big">' + threshold + '% coh</div>' +
        '<div class="g-sub">coherence threshold' +
        (best ? ' · new best!' : '') +
        ' — lower is sharper motion sense</div>', reset);
    }

    /* ---- overlay ---- */
    function showOverlay(inner, onClick) {
      overlay.innerHTML = '<div class="g-result">' + inner +
        '<button class="g-btn" type="button" data-act="go">' +
        (onClick.label || "retake") + '</button></div>';
      overlay.classList.add("show");
      var btn = overlay.querySelector('[data-act="go"]');
      if (btn) btn.addEventListener("click", onClick);
    }
    function hideOverlay() { overlay.classList.remove("show"); overlay.innerHTML = ""; }

    function resetState() {
      stopLoop();
      clearTrialTimer();
      clearFlashTimer();
      coh = START_COH;
      dir = 1;
      trials = 0;
      correctRun = 0;
      lastStep = 0;
      reversals = [];
      finished = false;
      awaiting = false;
      revEl.textContent = "0";
      leftBtn.classList.remove("mc-flash-ok", "mc-flash-bad");
      rightBtn.classList.remove("mc-flash-ok", "mc-flash-bad");
    }

    function begin() { hideOverlay(); resetState(); startTrial(); }
    begin.label = "start";

    function reset() { begin(); }
    reset.label = "retake";

    function showStart() {
      stopLoop();
      drawEmpty();
      setButtons(false);
      setMsg("tap start");
      showOverlay(
        '<div class="g-sub">a cloud of dots drifts for about a second. some move ' +
        'together left or right, the rest are noise. pick the overall direction ' +
        '(<b>F</b>/◀ or <b>J</b>/▶). it gets harder as you get it right — ' +
        'we measure the faintest motion you can still read.</div>', begin);
    }

    /* ---- input ---- */
    function onLeft() { answer(-1); }
    function onRight() { answer(1); }
    function onKey(e) {
      if (!awaiting || finished) return;
      var k = e.key;
      if (k === "f" || k === "F" || k === "ArrowLeft") { e.preventDefault(); answer(-1); }
      else if (k === "j" || k === "J" || k === "ArrowRight") { e.preventDefault(); answer(1); }
    }

    leftBtn.addEventListener("click", onLeft);
    rightBtn.addEventListener("click", onRight);
    document.addEventListener("keydown", onKey);

    showStart();

    /* ---- teardown: stop rAF, clear both timers, drop the keydown listener ---- */
    return function () {
      running = false;
      finished = true;
      stopLoop();                 // running=false + cancelAnimationFrame
      clearTrialTimer();          // end-of-motion setTimeout
      clearFlashTimer();          // post-answer setTimeout
      leftBtn.removeEventListener("click", onLeft);
      rightBtn.removeEventListener("click", onRight);
      document.removeEventListener("keydown", onKey);
    };
  }
});
