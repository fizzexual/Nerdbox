/* Gap Detection — auditory temporal acuity. A real psychoacoustic assessment:
   the gap-detection threshold measured with a 2-interval forced-choice (2IFC)
   adaptive staircase. Each trial plays TWO bursts of white noise in sequence
   (interval ① then ②); exactly ONE of them has a brief SILENT GAP punched out
   of its middle (gain ramped to 0 and back with ~1ms cosine fades so there are
   no clicks). The player reports which interval held the gap. A 2-down/1-up
   staircase moves the gap duration: two correct in a row -> shorter gap (harder),
   one wrong -> longer gap (easier). It converges on the ~70.7% point. The
   threshold is the mean gap (ms) over the last 6 reversals — lower = sharper
   temporal hearing. scoreMode "min". ctx.submitScore is called exactly once.

   Anti-spam: this is a staircase keyed to which-interval correctness, with no
   speed component to game. You can only drive the gap shorter by being reliably
   right; guessing regresses to chance and the staircase parks the gap high.
   Answer buttons stay disabled until playback finishes, so they can't be
   pre-mashed. There is no faster-is-better signal anywhere.

   Pure Web Audio. The AudioContext is created on the Start gesture and is fully
   torn down on unmount: every source is stopped + disconnected, every timer is
   cleared, the document keydown listener is removed, and close() is called on
   the AudioContext. A leaked context or sound after unmount would be a bug.
   Self-contained: one injectStyle + one register, ES5 only. */
NERDBOX.injectStyle("gapdetect", `
.gap-wrap {
  position: relative;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.3rem;
}
.gap-stage {
  width: 100%;
  background: var(--bg-alt);
  border: 2px solid var(--sub-alt);
  border-radius: 16px;
  padding: 1.8rem 1.6rem 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  font-family: "JetBrains Mono", monospace;
}
/* the two interval markers ① ② — the active one lights while its burst plays */
.gap-intervals {
  display: flex;
  gap: 1.6rem;
  align-items: center;
  justify-content: center;
}
.gap-mark {
  width: 84px;
  height: 84px;
  border-radius: 16px;
  background: var(--bg);
  border: 2px solid var(--sub-alt);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.4rem;
  font-weight: 700;
  color: var(--sub);
  transition: border-color 0.1s ease, background 0.1s ease, color 0.1s ease;
}
.gap-mark.gap-live {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, var(--bg));
  color: var(--text);
}
.gap-prompt {
  font-size: clamp(1.05rem, 4vw, 1.3rem);
  color: var(--text);
  letter-spacing: 0.02em;
  text-align: center;
  line-height: 1.3;
  min-height: 1.4em;
}
.gap-prompt.gap-listening { color: var(--sub); }
.gap-answers {
  display: flex;
  gap: 0.9rem;
  flex-wrap: wrap;
  justify-content: center;
}
.gap-ans {
  border: 1px solid var(--sub-alt);
  border-radius: 12px;
  background: var(--bg);
  color: var(--text);
  padding: 0.7rem 1.5rem;
  font-family: "JetBrains Mono", monospace;
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: filter 0.12s, transform 0.08s, border-color 0.12s, background 0.12s, opacity 0.12s;
}
.gap-ans:hover:not(:disabled) { border-color: var(--accent); }
.gap-ans:active:not(:disabled) { transform: translateY(1px); }
.gap-ans:disabled { opacity: 0.4; cursor: default; }
.gap-feedback {
  font-family: "JetBrains Mono", monospace;
  font-size: 0.95rem;
  letter-spacing: 0.02em;
  min-height: 1.2em;
  color: var(--sub);
  text-align: center;
}
.gap-feedback.gap-ok { color: var(--go); }
.gap-feedback.gap-no { color: var(--error); }
.gap-hint {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.82rem;
  text-align: center;
  line-height: 1.5;
}
.gap-hint b { color: var(--accent); font-weight: 700; }
.gap-result-line { color: var(--sub); font-size: 0.95rem; text-align: center; line-height: 1.5; }
.gap-result-line b { color: var(--text); font-family: "JetBrains Mono", monospace; }
`);

NERDBOX.register({
  id: "gapdetect",
  name: "Gap Detection",
  tagline: "which sound had the silent gap",
  category: "hearing",
  test: true,                 // assessment — difficulty intentionally unset
  scoreMode: "min",           // lower threshold (ms) = sharper temporal hearing
  formatScore: function (v) { return v + " ms"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l2-6 2 9"/><path d="M14 6l2 9 2-9 2 6h2"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;

    /* ---- protocol constants ---- */
    var BURST_MS = 500;        // length of each noise interval
    var ISI_MS = 400;          // silent pause between the two intervals
    var LEAD_MS = 600;         // pause before interval ① starts
    var FEEDBACK_MS = 850;     // how long correct/wrong feedback shows before next trial
    var RAMP_MS = 1;           // cosine fade in/out around the gap (anti-click)

    var START_GAP = 40;        // starting gap duration (ms)
    var GAP_MIN = 1;           // clamp floor (ms)
    var GAP_MAX = 150;         // clamp ceiling (ms)
    var DOWN_FACTOR = 0.8;     // two correct -> gap shrinks (harder)
    var UP_FACTOR = 1.25;      // one wrong -> gap grows (easier)
    var MAX_REVERSALS = 8;     // stop after this many staircase reversals
    var MAX_TRIALS = 50;       // hard cap on trials
    var SCORE_REVERSALS = 6;   // average the last N reversals for the threshold

    var NOISE_GAIN = 0.22;     // playback level for the noise bursts

    /* ---- staircase state ---- */
    var gap = START_GAP;       // current gap duration (ms)
    var trialNo = 0;           // trials completed
    var correctRun = 0;        // consecutive correct answers (for 2-down rule)
    var lastDir = 0;           // last step direction: -1 down, +1 up, 0 none
    var reversals = [];        // gap values at each reversal point
    var gapInterval = 1;       // which interval (1 or 2) holds the gap this trial
    var phase = "intro";       // intro | playing | answer | feedback | over
    var torn = false;          // guard: never touch audio/DOM after teardown

    /* ---- audio lifecycle ---- */
    var AC = window.AudioContext || window.webkitAudioContext;
    var ac = null;             // AudioContext (created on the Start gesture)
    var sources = [];          // every live BufferSource — stopped on teardown
    var noiseBuf = null;       // cached white-noise buffer (built once per context)

    /* ---- timer tracking (every handle lands here; teardown clears them all) ---- */
    var timers = [];
    function after(ms, fn) {
      var id = setTimeout(function () {
        var k = timers.indexOf(id);
        if (k >= 0) timers.splice(k, 1);
        if (!torn) fn();
      }, ms);
      timers.push(id);
      return id;
    }
    function clearTimers() {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers = [];
    }

    /* ---- DOM ---- */
    var status = el("div", "g-status", "");
    var wrap = el("div", "gap-wrap");
    var stage = el("div", "gap-stage");

    var intervals = el("div", "gap-intervals");
    var mark1 = el("div", "gap-mark", "&#9312;");   // ①
    var mark2 = el("div", "gap-mark", "&#9313;");   // ②
    intervals.appendChild(mark1);
    intervals.appendChild(mark2);

    var prompt = el("div", "gap-prompt", "");

    var answers = el("div", "gap-answers");
    var ans1 = el("button", "gap-ans", "&#9312; first");
    var ans2 = el("button", "gap-ans", "&#9313; second");
    ans1.type = "button";
    ans2.type = "button";
    answers.appendChild(ans1);
    answers.appendChild(ans2);

    var feedback = el("div", "gap-feedback", "");

    var hint = el("div", "gap-hint",
      "&#127911; use headphones &middot; one of the two bursts has a tiny silent gap &middot; " +
      "say <b>which</b> &middot; keys <b>1</b> / <b>2</b>");

    var overlay = el("div", "g-overlay");

    stage.appendChild(intervals);
    stage.appendChild(prompt);
    stage.appendChild(answers);
    stage.appendChild(feedback);

    wrap.appendChild(status);
    wrap.appendChild(stage);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    /* ---- helpers ---- */
    function setStatus() {
      var best = NERDBOX.getBest("gapdetect");
      status.innerHTML =
        '<span class="gl-score">trial ' + Math.min(trialNo + 1, MAX_TRIALS) + '/' + MAX_TRIALS + '</span>' +
        '<span class="gl-time">reversals ' + reversals.length + '/' + MAX_REVERSALS + '</span>' +
        (best === null ? "" : '<span class="gl-time">best ' + best + ' ms</span>');
    }

    function lockAnswers(locked) {
      ans1.disabled = locked;
      ans2.disabled = locked;
    }

    function setPrompt(text, listening) {
      prompt.className = "gap-prompt" + (listening ? " gap-listening" : "");
      prompt.innerHTML = text;
    }

    function clearMarks() {
      mark1.classList.remove("gap-live");
      mark2.classList.remove("gap-live");
    }

    function showOverlay(html, onBtn) {
      overlay.innerHTML = html;
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", function () {
        overlay.classList.remove("show");
        onBtn();
      });
      overlay.classList.add("show");
    }

    /* ---- audio ---- */
    // create/resume the context — only ever called from a user gesture
    function ensureAudio() {
      if (torn) return null;
      if (!ac && AC) {
        try { ac = new AC(); } catch (e) { ac = null; }
        noiseBuf = null;   // belongs to this context; (re)build lazily
      }
      if (ac && ac.state === "suspended" && ac.resume) {
        try { ac.resume(); } catch (e) {}
      }
      return ac;
    }

    // a buffer of white noise long enough for one burst, reused every trial
    function getNoiseBuffer() {
      if (!ac) return null;
      if (noiseBuf) return noiseBuf;
      var len = Math.ceil(ac.sampleRate * (BURST_MS / 1000) + ac.sampleRate * 0.05);
      var buf = ac.createBuffer(1, len, ac.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      noiseBuf = buf;
      return buf;
    }

    // forget a finished/aborted source so the live list stays small
    function dropSource(src) {
      var k = sources.indexOf(src);
      if (k >= 0) sources.splice(k, 1);
    }

    // stop + disconnect every live source immediately (used on teardown / restart)
    function stopAllSources() {
      for (var i = 0; i < sources.length; i++) {
        var s = sources[i];
        try { s.onended = null; } catch (e) {}
        try { s.stop(); } catch (e) {}
        try { s.disconnect(); } catch (e) {}
        if (s._gain) { try { s._gain.disconnect(); } catch (e) {} }
      }
      sources = [];
    }

    // Schedule one noise burst starting at AudioContext time `startT`. If
    // `withGap` is true, punch a silent gap of `gapMs` out of its middle using
    // 1ms cosine fades on each edge so there are no click artefacts.
    function scheduleBurst(startT, withGap, gapMs) {
      if (!ac) return;
      var buf = getNoiseBuffer();
      if (!buf) return;
      var src = ac.createBufferSource();
      var g = ac.createGain();
      src.buffer = buf;
      src.connect(g);
      g.connect(ac.destination);

      var dur = BURST_MS / 1000;
      var endT = startT + dur;

      // baseline envelope: a short fade-in / fade-out so the burst edges are clean
      var edge = 0.006;
      g.gain.setValueAtTime(0.0001, startT);
      g.gain.linearRampToValueAtTime(NOISE_GAIN, startT + edge);

      if (withGap && gapMs > 0) {
        var gp = gapMs / 1000;
        var ramp = RAMP_MS / 1000;          // ~1ms cosine-ish fade around the gap
        var mid = startT + dur / 2;
        var gStart = mid - gp / 2;          // when the silence begins
        var gEnd = mid + gp / 2;            // when sound resumes
        // make sure the gap sits inside the steady part of the burst
        if (gStart < startT + edge + ramp) gStart = startT + edge + ramp;
        if (gEnd > endT - edge - ramp) gEnd = endT - edge - ramp;
        if (gEnd > gStart) {
          // hold full level up to the fade, dip to silence, hold, then come back
          g.gain.setValueAtTime(NOISE_GAIN, Math.max(startT + edge, gStart - ramp));
          g.gain.linearRampToValueAtTime(0.0001, gStart);
          g.gain.setValueAtTime(0.0001, gEnd);
          g.gain.linearRampToValueAtTime(NOISE_GAIN, Math.min(endT - edge, gEnd + ramp));
        }
      }

      g.gain.setValueAtTime(NOISE_GAIN, Math.max(startT + edge, endT - edge));
      g.gain.linearRampToValueAtTime(0.0001, endT);

      src._gain = g;
      src.start(startT);
      src.stop(endT + 0.02);
      sources.push(src);
      src.onended = function () {
        try { src.disconnect(); } catch (e) {}
        try { g.disconnect(); } catch (e) {}
        dropSource(src);
      };
    }

    /* ---- a trial: play ① then ②, one of them gapped, then collect the answer ---- */
    function startTrial() {
      if (torn || phase === "over") return;
      phase = "playing";
      clearMarks();
      lockAnswers(true);
      feedback.className = "gap-feedback";
      feedback.textContent = "";
      setStatus();
      setPrompt("listen&hellip;", true);

      gapInterval = rand(2) + 1;            // 1 or 2 — which burst gets the gap

      if (!ensureAudio()) {
        // no Web Audio available — bail out gracefully to the intro
        setPrompt("audio unavailable on this device", false);
        phase = "intro";
        return;
      }

      var t0 = ac.currentTime + LEAD_MS / 1000;
      var t1 = t0 + BURST_MS / 1000 + ISI_MS / 1000;
      scheduleBurst(t0, gapInterval === 1, gap);
      scheduleBurst(t1, gapInterval === 2, gap);

      // light ① while it plays
      after(LEAD_MS, function () {
        if (phase !== "playing") return;
        mark1.classList.add("gap-live");
      });
      after(LEAD_MS + BURST_MS, function () {
        mark1.classList.remove("gap-live");
      });
      // light ② while it plays
      after(LEAD_MS + BURST_MS + ISI_MS, function () {
        if (phase !== "playing") return;
        mark2.classList.add("gap-live");
      });
      after(LEAD_MS + 2 * BURST_MS + ISI_MS, function () {
        mark2.classList.remove("gap-live");
      });
      // playback done -> open the answer
      after(LEAD_MS + 2 * BURST_MS + ISI_MS + 60, function () {
        if (phase !== "playing") return;
        phase = "answer";
        clearMarks();
        setPrompt("which burst had the gap?", false);
        lockAnswers(false);
      });
    }

    // record a reversal whenever the step direction flips
    function noteStep(dir) {
      if (lastDir !== 0 && dir !== lastDir) {
        reversals.push(gap);
      }
      lastDir = dir;
    }

    function answer(choice) {
      if (phase !== "answer") return;
      phase = "feedback";
      lockAnswers(true);
      trialNo++;

      var correct = (choice === gapInterval);
      if (correct) {
        feedback.className = "gap-feedback gap-ok";
        feedback.textContent = "correct";
        correctRun++;
        if (correctRun >= 2) {              // 2-down: shrink the gap (harder)
          correctRun = 0;
          var down = gap * DOWN_FACTOR;
          if (down < GAP_MIN) down = GAP_MIN;
          noteStep(-1);
          gap = down;
        }
      } else {
        feedback.className = "gap-feedback gap-no";
        feedback.textContent = "the " + (gapInterval === 1 ? "first" : "second") + " one had it";
        correctRun = 0;                     // 1-up: grow the gap (easier)
        var up = gap * UP_FACTOR;
        if (up > GAP_MAX) up = GAP_MAX;
        noteStep(1);
        gap = up;
      }

      setStatus();

      if (reversals.length >= MAX_REVERSALS || trialNo >= MAX_TRIALS) {
        after(FEEDBACK_MS, finish);
      } else {
        after(FEEDBACK_MS, startTrial);
      }
    }

    /* ---- end of test: report the threshold exactly once, offer a retake ---- */
    function finish() {
      if (torn) return;
      phase = "over";
      clearTimers();
      stopAllSources();
      clearMarks();
      lockAnswers(true);

      // threshold = mean gap over the last N reversals (fall back to whatever
      // reversals we have, or the final gap if the run never reversed)
      var sample;
      if (reversals.length >= SCORE_REVERSALS) {
        sample = reversals.slice(reversals.length - SCORE_REVERSALS);
      } else if (reversals.length > 0) {
        sample = reversals.slice();
      } else {
        sample = [gap];
      }
      var sum = 0;
      for (var i = 0; i < sample.length; i++) sum += sample[i];
      var threshold = Math.round(sum / sample.length);
      if (threshold < GAP_MIN) threshold = GAP_MIN;

      ctx.submitScore(threshold);            // the ONE score (min: lower is sharper)

      var best = NERDBOX.getBest("gapdetect");
      var isBest = best !== null && best === threshold;

      status.innerHTML =
        '<span class="gl-score">done</span>' +
        (best === null ? "" : '<span class="gl-time">best ' + best + ' ms</span>');
      setPrompt("", false);
      feedback.className = "gap-feedback";
      feedback.textContent = "";

      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + threshold + ' ms</div>' +
          '<div class="g-sub">' + (isBest ? "new best &middot; " : "") + 'gap-detection threshold</div>' +
          '<div class="gap-result-line">smallest silent gap you could reliably hear</div>' +
          '<div class="gap-result-line">mean of the last <b>' + sample.length +
            '</b> reversal' + (sample.length === 1 ? '' : 's') +
            ' over <b>' + trialNo + '</b> trials</div>' +
          '<button class="g-btn">retake</button>' +
        '</div>',
        startTest
      );
    }

    function startTest() {
      if (torn) return;
      clearTimers();
      stopAllSources();
      overlay.classList.remove("show");
      clearMarks();
      // reset the staircase
      gap = START_GAP;
      trialNo = 0;
      correctRun = 0;
      lastDir = 0;
      reversals = [];
      phase = "idle";
      feedback.className = "gap-feedback";
      feedback.textContent = "";
      setStatus();
      after(LEAD_MS, startTrial);
    }

    function showIntro() {
      phase = "intro";
      lockAnswers(true);
      setStatus();
      setPrompt("", false);
      showOverlay(
        '<div class="g-result">' +
          '<div class="g-sub">two noise bursts play in turn &mdash; one has a tiny silent gap.</div>' +
          '<div class="g-sub">tell us which: <b style="color:var(--text)">&#9312;</b> or <b style="color:var(--text)">&#9313;</b>. ' +
            'the gap shrinks as you get it right.</div>' +
          '<div class="gap-result-line">&#127911; headphones strongly recommended</div>' +
          '<button class="g-btn">start</button>' +
        '</div>',
        function () {
          // the Start button is the first gesture — kick the AudioContext alive
          ensureAudio();
          startTest();
        }
      );
    }

    /* ---- wiring ---- */
    function onAns1() { answer(1); }
    function onAns2() { answer(2); }
    function onKey(e) {
      if (phase !== "answer") return;
      if (e.key === "1") { e.preventDefault(); answer(1); }
      else if (e.key === "2") { e.preventDefault(); answer(2); }
    }
    ans1.addEventListener("click", onAns1);
    ans2.addEventListener("click", onAns2);
    document.addEventListener("keydown", onKey);

    showIntro();

    /* ---- teardown: stop sources, close the context, clear timers + listener ---- */
    return function () {
      torn = true;
      phase = "over";
      clearTimers();
      stopAllSources();
      ans1.removeEventListener("click", onAns1);
      ans2.removeEventListener("click", onAns2);
      document.removeEventListener("keydown", onKey);
      noiseBuf = null;
      if (ac) {
        var dead = ac;
        ac = null;
        try { if (dead.state !== "closed") dead.close(); } catch (e) {}
      }
    };
  }
});
