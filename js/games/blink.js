/* Attentional Blink (RSVP dual-target) — a stream of single characters flickers in
   the center, one every ~100ms with no gap. Hidden inside are TWO target DIGITS
   (T1 then T2), drawn bold in a salient colour among grey letter distractors. After
   the stream you report T1 and T2. The "blink": T2 is hard to catch when it lands a
   couple items after T1 (~200-400ms). 24 trials, lag 1-8. Score = T2|T1 accuracy =
   correct-T2 among T1-correct trials, %. Random mashing scores near zero because you
   must report the actual digits, and the report has no speed component to game. */
NERDBOX.injectStyle("blink", `
  .ab-wrap { position: relative; width: 100%; max-width: 540px; display: flex; flex-direction: column; align-items: center; gap: 1.4rem; margin: 0 auto; }
  .ab-stage { width: 100%; min-height: 200px; border-radius: 18px; background: var(--bg-alt); border: 2px solid var(--sub-alt); display: flex; align-items: center; justify-content: center; padding: 1.4rem; }
  .ab-frame { font-family: "JetBrains Mono", monospace; font-size: clamp(3.4rem, 16vw, 6rem); font-weight: 700; line-height: 1; user-select: none; min-height: 1.1em; display: flex; align-items: center; justify-content: center; color: var(--sub); }
  .ab-frame.ab-target { color: var(--accent); }
  .ab-report { width: 100%; display: flex; flex-direction: column; gap: 0.9rem; align-items: center; }
  .ab-report-label { font-family: "JetBrains Mono", monospace; font-size: 0.9rem; color: var(--sub); text-align: center; }
  .ab-report-label b { color: var(--accent); font-weight: 700; }
  .ab-pads { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; width: 100%; }
  .ab-pad { border: 2px solid var(--sub-alt); border-radius: 10px; background: var(--bg-alt); color: var(--text); padding: 0.7rem 0; flex: 1 1 40px; min-width: 40px; font-family: "JetBrains Mono", monospace; font-size: 1.2rem; font-weight: 700; cursor: pointer; transition: filter 0.12s ease, transform 0.08s ease, border-color 0.12s ease, opacity 0.12s ease; }
  .ab-pad:hover:not(:disabled) { filter: brightness(1.15); border-color: var(--accent); }
  .ab-pad:active:not(:disabled) { transform: translateY(1px); }
  .ab-pad:disabled { cursor: default; opacity: 0.4; }
  .ab-hint { font-family: "JetBrains Mono", monospace; font-size: 0.8rem; color: var(--sub); text-align: center; }
  .ab-hint b { color: var(--accent); font-weight: 500; }
  .ab-lags { font-family: "JetBrains Mono", monospace; font-size: 0.74rem; color: var(--sub); line-height: 1.5; text-align: center; margin-top: 0.3rem; max-width: 320px; }
  .ab-lags b { color: var(--text); font-weight: 700; }
`);

NERDBOX.register({
  id: "blink",
  name: "Attentional Blink",
  tagline: "catch both hidden digits in the blur",
  category: "attention",
  test: true,
  scoreMode: "max",
  formatScore: function (v) { return v + "%"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/><path d="M21 4l-2 2"/><path d="M3 4l2 2"/></svg>',

  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand, shuffle = ctx.util.shuffle;

    // ---- protocol constants ----
    var TRIALS = 24;          // a block of 24 trials
    var STREAM_LEN = 18;      // items per RSVP stream (~15-20)
    var FRAME_MS = 100;       // each item shown ~100ms, no gap
    var LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ"; // distractor letters (no digit-lookalikes)
    var MIN_T1 = 2;           // earliest T1 position (leave a lead-in)
    var MAX_LAG = 8;          // longest lag
    // T2 = T1pos + lag must leave at least one trailing distractor: T1pos + lag < STREAM_LEN - 1

    // ---- timers / listeners (all released in teardown) ----
    var frameTimer = null;    // chained setTimeout driving the RSVP stream
    var interTimer = null;    // inter-trial pause timer
    var keyHandler = null;    // document keydown for optional digit entry

    // ---- run state ----
    var lags = [];            // the lag schedule for this block (length TRIALS)
    var trialIdx = 0;         // index into lags
    var trial = null;         // current trial spec { t1, t2, lag, t1pos, t2pos, stream[] }
    var phase = "idle";       // idle | rsvp | report-t1 | report-t2 | done
    var t1Answer = null;      // player's reported T1 digit
    var perLag = {};          // lag -> { n, t1ok, both } running tallies

    // ---- DOM ----
    var status = el("div", "g-status", "");
    var stage = el("div", "ab-stage");
    var frame = el("div", "ab-frame", "");
    stage.appendChild(frame);

    var report = el("div", "ab-report");
    report.style.display = "none";
    var reportLabel = el("div", "ab-report-label", "");
    var pads = el("div", "ab-pads");
    var padEls = [];
    var i;
    for (i = 0; i < 10; i++) {
      (function (d) {
        var b = el("button", "ab-pad", String(d));
        b.addEventListener("click", function () { pick(d); });
        padEls.push(b);
        pads.appendChild(b);
      })(i);
    }
    report.appendChild(reportLabel);
    report.appendChild(pads);

    var hint = el("div", "ab-hint",
      'two <b>digits</b> hide in the letter stream — report them after each flash');

    var overlay = el("div", "g-overlay");
    var wrap = el("div", "ab-wrap");
    wrap.appendChild(stage);
    wrap.appendChild(report);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    // ---- helpers ----
    function setStatus(extra) {
      status.innerHTML =
        '<span class="gl-score">trial ' + Math.min(trialIdx + 1, TRIALS) + '/' + TRIALS + '</span>' +
        '<span>' + (extra || "") + '</span>';
    }

    function setPadsEnabled(on) {
      for (var k = 0; k < padEls.length; k++) padEls[k].disabled = !on;
    }

    function showOverlay(html, onClick) {
      overlay.innerHTML = html;
      var b = overlay.querySelector("button");
      if (b) b.addEventListener("click", function () { overlay.classList.remove("show"); onClick(); });
      overlay.classList.add("show");
    }

    // Build a lag schedule of length TRIALS, lags spread evenly across 1..MAX_LAG.
    function buildLagSchedule() {
      var out = [];
      var lag = 1;
      for (var n = 0; n < TRIALS; n++) {
        out.push(lag);
        lag++;
        if (lag > MAX_LAG) lag = 1;
      }
      return shuffle(out);
    }

    // Build one trial: pick T1/T2 digits and positions, fill the rest with letters.
    function buildTrial(lag) {
      var t1 = rand(10);
      var t2 = rand(10); // T1 and T2 are independent digits (may coincide)
      // T1 at a random early position; ensure T2 (= t1pos + lag) leaves a trailing item.
      var maxT1 = STREAM_LEN - 2 - lag; // so t2pos <= STREAM_LEN-2 (>=1 trailing distractor)
      if (maxT1 < MIN_T1) maxT1 = MIN_T1;
      var t1pos = MIN_T1 + rand(maxT1 - MIN_T1 + 1);
      var t2pos = t1pos + lag;

      var stream = [];
      for (var p = 0; p < STREAM_LEN; p++) {
        if (p === t1pos) stream.push({ ch: String(t1), target: true });
        else if (p === t2pos) stream.push({ ch: String(t2), target: true });
        else stream.push({ ch: LETTERS.charAt(rand(LETTERS.length)), target: false });
      }
      return { t1: t1, t2: t2, lag: lag, t1pos: t1pos, t2pos: t2pos, stream: stream };
    }

    // ---- RSVP playback (chained setTimeout; single tracked handle) ----
    function playStream() {
      phase = "rsvp";
      report.style.display = "none";
      setPadsEnabled(false);
      setStatus("watch");
      var idx = 0;

      function showFrame() {
        if (idx >= trial.stream.length) {
          frameTimer = null;
          frame.textContent = "";
          frame.classList.remove("ab-target");
          beginReport();
          return;
        }
        var item = trial.stream[idx];
        frame.textContent = item.ch;
        if (item.target) frame.classList.add("ab-target");
        else frame.classList.remove("ab-target");
        idx++;
        frameTimer = setTimeout(showFrame, FRAME_MS);
      }
      showFrame();
    }

    // ---- report phase ----
    function beginReport() {
      t1Answer = null;
      phase = "report-t1";
      report.style.display = "flex";
      reportLabel.innerHTML = 'first digit <b>(T1)</b> — the first one you saw';
      setPadsEnabled(true);
      setStatus("report");
    }

    function pick(d) {
      if (phase === "report-t1") {
        t1Answer = d;
        phase = "report-t2";
        reportLabel.innerHTML = 'second digit <b>(T2)</b> — the one right after';
        // pads stay enabled for the T2 selection
      } else if (phase === "report-t2") {
        setPadsEnabled(false);
        scoreTrial(t1Answer, d);
        advance();
      }
    }

    function scoreTrial(a1, a2) {
      var lag = trial.lag;
      var rec = perLag[lag] || (perLag[lag] = { n: 0, t1ok: 0, both: 0 });
      rec.n++;
      var t1ok = (a1 === trial.t1);
      if (t1ok) {
        rec.t1ok++;
        if (a2 === trial.t2) rec.both++;
      }
    }

    function advance() {
      trialIdx++;
      report.style.display = "none";
      if (trialIdx >= TRIALS) { finish(); return; }
      phase = "idle";
      frame.textContent = "+"; // brief fixation between trials
      frame.classList.remove("ab-target");
      setStatus("next…");
      interTimer = setTimeout(function () {
        interTimer = null;
        trial = buildTrial(lags[trialIdx]);
        playStream();
      }, 650);
    }

    function startBlock() {
      overlay.classList.remove("show");
      lags = buildLagSchedule();
      trialIdx = 0;
      perLag = {};
      trial = buildTrial(lags[0]);
      // small lead-in so the first stream doesn't start the instant the overlay clears
      frame.textContent = "+";
      frame.classList.remove("ab-target");
      setStatus("ready");
      interTimer = setTimeout(function () {
        interTimer = null;
        playStream();
      }, 600);
    }

    // ---- results ----
    function aggregate() {
      var t1total = 0, bothTotal = 0;
      for (var lag in perLag) {
        if (!Object.prototype.hasOwnProperty.call(perLag, lag)) continue;
        t1total += perLag[lag].t1ok;
        bothTotal += perLag[lag].both;
      }
      var pct = t1total > 0 ? Math.round((bothTotal / t1total) * 100) : 0;
      return { pct: pct, t1total: t1total, bothTotal: bothTotal };
    }

    function lagReadout() {
      // compact per-lag T2|T1 line, only for lags with at least one T1-correct trial
      var rows = [];
      for (var lag = 1; lag <= MAX_LAG; lag++) {
        var rec = perLag[lag];
        if (!rec || rec.t1ok === 0) continue;
        var p = Math.round((rec.both / rec.t1ok) * 100);
        rows.push('lag ' + lag + ' <b>' + p + '%</b>');
      }
      if (!rows.length) return '';
      return '<div class="ab-lags">T2 given T1 &middot; by lag<br>' + rows.join(' &nbsp; ') + '</div>';
    }

    function finish() {
      phase = "done";
      clearTimer();
      setPadsEnabled(false);
      report.style.display = "none";
      frame.textContent = "";
      frame.classList.remove("ab-target");

      var agg = aggregate();
      var best = ctx.submitScore(agg.pct); // submit once, at the end
      status.innerHTML = '<span class="gl-score">done</span><span>' + agg.pct + '% T2|T1</span>';
      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + agg.pct + '%</div>' +
          '<div class="g-sub">' + (best ? "new best! · " : "") +
            'T2 caught given T1 (' + agg.bothTotal + '/' + agg.t1total + ')</div>' +
          lagReadout() +
          '<button class="g-btn">retake</button>' +
        '</div>',
        startBlock
      );
    }

    // ---- optional keyboard entry (0-9) ----
    keyHandler = function (e) {
      if (phase !== "report-t1" && phase !== "report-t2") return;
      var k = e.key;
      if (k && k.length === 1 && k >= "0" && k <= "9") {
        e.preventDefault();
        pick(Number(k));
      }
    };
    document.addEventListener("keydown", keyHandler);

    // ---- timer cleanup shared by teardown + finish ----
    function clearTimer() {
      if (frameTimer !== null) { clearTimeout(frameTimer); frameTimer = null; }
      if (interTimer !== null) { clearTimeout(interTimer); interTimer = null; }
    }

    // ---- initial idle / start overlay ----
    frame.textContent = "blink";
    frame.classList.remove("ab-target");
    setPadsEnabled(false);
    status.innerHTML = '<span class="gl-score">trial 0/' + TRIALS + '</span><span>ready</span>';
    showOverlay(
      '<div class="g-result">' +
        '<div class="g-sub">24 streams · spot the two hidden digits, then report them</div>' +
        '<button class="g-btn">start</button>' +
      '</div>',
      startBlock
    );

    // ---- teardown: cancel the RSVP frame timer + inter-trial timer, drop the listener ----
    return function teardown() {
      clearTimer();
      if (keyHandler) { document.removeEventListener("keydown", keyHandler); keyHandler = null; }
      phase = "done";
    };
  }
});
