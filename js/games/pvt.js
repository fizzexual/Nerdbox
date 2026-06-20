/* Psychomotor Vigilance Task (PVT) — stay alert; press the instant the counter appears. */
NERDBOX.register({
  id: "pvt",
  name: "Vigilance (PVT)",
  tagline: "stay alert — mean reaction over many trials",
  category: "attention",
  test: true,
  scoreMode: "min",
  formatScore: function (v) { return v + " ms"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/><path d="M12 2v3"/></svg>',
  mount: function (root, ctx) {
    injectCSS();

    var TRIALS = 14;          // valid trials needed
    var ISI_MIN = 2000;       // inter-stimulus interval lower bound (ms)
    var ISI_MAX = 6000;       // inter-stimulus interval upper bound (ms)
    var LAPSE_MS = 500;       // RT above this counts as a lapse
    var MIN_RT = 100;         // RT below this is an anticipatory false start
    var MAX_FALSE = 10;       // total false starts allowed before the test is voided

    var phase = "idle";       // idle | wait | go | done
    var rts = [];             // collected valid reaction times
    var falseStarts = 0;      // running count of false starts
    var stimT = 0;            // performance.now() when the counter appeared
    var alive = true;         // guards async callbacks after teardown

    // timer / animation handles, all released in teardown
    var isiTimer = null;      // random ISI setTimeout
    var interTimer = null;    // brief "show the RT" inter-trial setTimeout
    var rafId = null;         // requestAnimationFrame id for the rising counter
    var rafRunning = false;   // counter loop active flag

    var wrap = ctx.util.el("div", "pvt-wrap");
    var status = ctx.util.el("div", "g-status pvt-status");
    var pad = ctx.util.el("button", "pvt-pad");
    pad.setAttribute("type", "button");
    wrap.appendChild(status);
    wrap.appendChild(pad);
    root.appendChild(wrap);

    function setPad(cls, big, sub) {
      pad.className = "pvt-pad " + cls;
      pad.innerHTML =
        '<div class="g-big pvt-num">' + big + "</div>" +
        '<div class="g-sub pvt-padsub">' + sub + "</div>";
    }

    function setStatus() {
      status.textContent = "trial " + (rts.length + 1) + " / " + TRIALS;
    }

    function stopRaf() {
      rafRunning = false;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }
    function clearTimers() {
      if (isiTimer !== null) { clearTimeout(isiTimer); isiTimer = null; }
      if (interTimer !== null) { clearTimeout(interTimer); interTimer = null; }
    }

    // Begin one trial: blank wait screen, then arm the counter after a random ISI.
    function nextTrial() {
      if (!alive) { return; }
      if (rts.length >= TRIALS) { finish(); return; }
      phase = "wait";
      setStatus();
      setPad("pvt-wait", "&nbsp;", "wait for the number…");
      var delay = ISI_MIN + ctx.util.rand(ISI_MAX - ISI_MIN + 1);
      isiTimer = setTimeout(function () {
        isiTimer = null;
        if (!alive || phase !== "wait") { return; }
        phase = "go";
        stimT = performance.now();
        startCounter();
      }, delay);
    }

    // Rising millisecond counter, rendered each frame via requestAnimationFrame.
    // The pad markup is built once; only the number's text is updated per frame.
    function startCounter() {
      setPad("pvt-go", "0", "press SPACE / tap to stop");
      var numEl = pad.firstChild; // the .pvt-num div from setPad
      rafRunning = true;
      function frame() {
        if (!alive || !rafRunning || phase !== "go") { rafRunning = false; rafId = null; return; }
        numEl.firstChild.nodeValue = String(Math.round(performance.now() - stimT));
        rafId = requestAnimationFrame(frame);
      }
      rafId = requestAnimationFrame(frame);
    }

    // A false start: pressed during the wait, or an impossibly fast RT.
    function registerFalseStart() {
      clearTimers();
      stopRaf();
      falseStarts += 1;
      phase = "idle";
      if (falseStarts >= MAX_FALSE) {
        invalid();
        return;
      }
      setStatus();
      setPad("pvt-false", "✕", "false start — wait for the number");
      interTimer = setTimeout(function () {
        interTimer = null;
        if (!alive) { return; }
        nextTrial();
      }, 1100);
    }

    // A valid response: record RT, flash it, then move on.
    function registerHit() {
      var ms = Math.round(performance.now() - stimT);
      stopRaf();
      if (ms < MIN_RT) { registerFalseStart(); return; }
      phase = "idle";
      rts.push(ms);
      var lapse = ms > LAPSE_MS;
      setPad(lapse ? "pvt-lapse" : "pvt-hit", ms + " ms", lapse ? "lapse — stay sharp" : "good");
      interTimer = setTimeout(function () {
        interTimer = null;
        if (!alive) { return; }
        nextTrial();
      }, 750);
    }

    // Single input handler shared by keyboard and pointer.
    function press() {
      if (!alive) { return; }
      if (phase === "intro") { nextTrial(); return; }
      if (phase === "idle" || phase === "done") { return; }
      if (phase === "wait") { registerFalseStart(); return; }
      if (phase === "go") { registerHit(); return; }
    }

    function onKey(e) {
      if (e.code === "Space" || e.key === " " || e.key === "Spacebar" || e.keyCode === 32) {
        e.preventDefault();
        press();
      }
    }

    // Compute mean RT, submit once, and show the result card.
    function finish() {
      phase = "done";
      clearTimers();
      stopRaf();
      var i, sum = 0, fastest = rts[0], slowest = rts[0], lapses = 0;
      for (i = 0; i < rts.length; i++) {
        sum += rts[i];
        if (rts[i] < fastest) { fastest = rts[i]; }
        if (rts[i] > slowest) { slowest = rts[i]; }
        if (rts[i] > LAPSE_MS) { lapses += 1; }
      }
      var mean = Math.round(sum / rts.length);
      ctx.submitScore(mean);
      status.textContent = "test complete";
      pad.className = "pvt-pad pvt-done";
      pad.innerHTML =
        '<div class="g-result pvt-result">' +
        '<div class="g-big pvt-mean">' + mean + " ms</div>" +
        '<div class="g-sub pvt-meansub">mean reaction over ' + rts.length + " trials</div>" +
        '<div class="pvt-stats">' +
        '<span>fastest <b>' + fastest + " ms</b></span>" +
        '<span>slowest <b>' + slowest + " ms</b></span>" +
        '<span>lapses <b>' + lapses + "</b></span>" +
        "</div></div>";
      var btn = ctx.util.el("button", "g-btn pvt-retake");
      btn.setAttribute("type", "button");
      btn.textContent = "retake";
      btn.addEventListener("click", retake);
      pad.appendChild(btn);
    }

    // Too many false starts: void the run, submit nothing.
    function invalid() {
      phase = "done";
      clearTimers();
      stopRaf();
      status.textContent = "test invalid";
      pad.className = "pvt-pad pvt-invalid";
      pad.innerHTML =
        '<div class="g-result pvt-result">' +
        '<div class="g-big pvt-mean">test invalid</div>' +
        '<div class="g-sub pvt-meansub">too many false starts (' + falseStarts + ") — don’t anticipate, react</div>" +
        "</div>";
      var btn = ctx.util.el("button", "g-btn pvt-retake");
      btn.setAttribute("type", "button");
      btn.textContent = "retake";
      btn.addEventListener("click", retake);
      pad.appendChild(btn);
    }

    function retake() {
      if (!alive) { return; }
      clearTimers();
      stopRaf();
      rts = [];
      falseStarts = 0;
      phase = "idle";
      nextTrial();
    }

    // Intro screen; the first SPACE / tap (handled by press() in the "intro"
    // phase) starts the run.
    function showIntro() {
      phase = "intro";
      status.textContent = "vigilance test — " + TRIALS + " trials";
      setPad("pvt-intro", "PVT", "press SPACE / tap to begin");
    }

    pad.addEventListener("click", press);
    document.addEventListener("keydown", onKey);

    showIntro();

    if (ctx.themeColor) { /* themeColor available for hosts that tint chrome */ }

    return function teardown() {
      alive = false;
      stopRaf();
      clearTimers();
      document.removeEventListener("keydown", onKey);
      pad.removeEventListener("click", press);
    };

    function injectCSS() {
      if (document.getElementById("pvt-css")) { return; }
      var css =
        ".pvt-wrap{display:flex;flex-direction:column;align-items:center;gap:18px;width:100%;}" +
        ".pvt-status{letter-spacing:.04em;}" +
        ".pvt-pad{position:relative;width:100%;max-width:520px;min-height:280px;border:2px solid var(--sub-alt);" +
        "border-radius:16px;background:var(--bg-alt);color:var(--text);cursor:pointer;display:flex;" +
        "flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:28px;" +
        "font:inherit;transition:background .12s ease,border-color .12s ease;user-select:none;-webkit-user-select:none;}" +
        ".pvt-pad:focus{outline:none;}" +
        ".pvt-num{font-size:64px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;}" +
        ".pvt-padsub{color:var(--sub);}" +
        ".pvt-intro .pvt-num{color:var(--accent);}" +
        ".pvt-wait{background:var(--bg);border-color:var(--sub-alt);}" +
        ".pvt-wait .pvt-num{color:var(--sub-alt);}" +
        ".pvt-go{background:var(--bg-alt);border-color:var(--go,var(--accent));}" +
        ".pvt-go .pvt-num{color:var(--go,var(--accent));}" +
        ".pvt-hit{border-color:var(--accent);}" +
        ".pvt-hit .pvt-num{color:var(--accent);}" +
        ".pvt-lapse .pvt-num{color:var(--error);}" +
        ".pvt-false{border-color:var(--error);}" +
        ".pvt-false .pvt-num,.pvt-false .pvt-padsub{color:var(--error);}" +
        ".pvt-result{text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px;}" +
        ".pvt-mean{font-size:48px;font-weight:700;color:var(--accent);line-height:1;}" +
        ".pvt-invalid .pvt-mean{color:var(--error);}" +
        ".pvt-meansub{color:var(--sub);}" +
        ".pvt-stats{display:flex;gap:18px;flex-wrap:wrap;justify-content:center;margin-top:6px;color:var(--sub);font-size:14px;}" +
        ".pvt-stats b{color:var(--text);}" +
        ".pvt-retake{margin-top:18px;}";
      var style = document.createElement("style");
      style.id = "pvt-css";
      style.appendChild(document.createTextNode(css));
      document.head.appendChild(style);
    }
  }
});
