/* Rhythm Echo — listen to a rhythm, then tap it back.
   Auditory rhythm memory: a rhythm is a sequence of beats represented as the
   inter-onset intervals (gaps) between them. Round 1 = 3 beats (2 gaps); each
   round adds one beat (one more gap). Gaps are drawn from {short, long}.
   The rhythm PLAYS as short Web-Audio clicks with a synced visual pulse on the
   pad, then the player TAPS the pad (or spacebar) to reproduce it. Each of the
   player's gaps must match the target gap within a ratio tolerance (±TOL). All
   gaps close enough -> round cleared, score++, next (longer) rhythm. Any gap
   off -> game over (best = rounds reached). Score = rounds cleared (max). */
NERDBOX.injectStyle("rhythmecho", `
.rhythmecho-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.3rem;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  position: relative;
}
.rhythmecho-pad {
  position: relative;
  width: 100%;
  min-height: 300px;
  height: min(54vh, 360px);
  border-radius: 18px;
  background: var(--bg-alt);
  border: 2px solid var(--sub-alt);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
  transition: border-color 0.12s ease, background 0.08s ease, box-shadow 0.08s ease;
}
.rhythmecho-pad.rhythmecho-listen { cursor: default; }
.rhythmecho-pad.rhythmecho-tap { border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
.rhythmecho-pad.rhythmecho-good { border-color: var(--go); }
.rhythmecho-pad.rhythmecho-bad { border-color: var(--error); }
/* the glowing pulse that fires on every beat (played + tapped) */
.rhythmecho-pulse {
  width: clamp(110px, 36vw, 184px);
  height: clamp(110px, 36vw, 184px);
  border-radius: 50%;
  background: radial-gradient(circle at 50% 42%,
    color-mix(in srgb, var(--accent) 88%, #fff) 0 36%,
    var(--accent) 36% 70%,
    color-mix(in srgb, var(--accent) 40%, transparent) 70% 100%);
  transform: scale(0.78);
  opacity: 0.32;
  transition: transform 0.34s cubic-bezier(.2,.8,.3,1), opacity 0.34s ease;
  pointer-events: none;
}
.rhythmecho-pulse.rhythmecho-hit {
  transform: scale(1);
  opacity: 1;
  transition: transform 0.04s ease-out, opacity 0.04s ease-out;
}
.rhythmecho-pad.rhythmecho-listen .rhythmecho-pulse {
  background: radial-gradient(circle at 50% 42%,
    color-mix(in srgb, var(--go) 88%, #fff) 0 36%,
    var(--go) 36% 70%,
    color-mix(in srgb, var(--go) 40%, transparent) 70% 100%);
}
.rhythmecho-cue {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: clamp(0.95rem, 4vw, 1.2rem);
  letter-spacing: 0.04em;
  pointer-events: none;
  min-height: 1.4em;
}
/* row of dots showing rhythm length + the player's progress through it */
.rhythmecho-dots {
  display: flex;
  gap: 0.5rem;
  pointer-events: none;
  min-height: 12px;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 90%;
}
.rhythmecho-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--sub-alt);
  transition: background 0.12s ease, transform 0.12s ease;
}
.rhythmecho-dot.rhythmecho-on { background: var(--accent); transform: scale(1.15); }
.rhythmecho-dot.rhythmecho-play { background: var(--go); }
.rhythmecho-hint {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.85rem;
  text-align: center;
  line-height: 1.5;
}
.rhythmecho-hint b { color: var(--accent); font-weight: 700; }
`);

NERDBOX.register({
  id: "rhythmecho",
  name: "Rhythm Echo",
  tagline: "tap back the rhythm you heard",
  category: "hearing",
  scoreMode: "max",
  formatScore: function (v) { return v + " rounds"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h2l2-7 4 16 3-11 2 5h5"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;

    /* ---------- config ---------- */
    var SHORT = 300;        // short gap, ms
    var LONG = 600;         // long gap, ms
    var TOL = 0.30;         // ±30% ratio tolerance on each reproduced gap
    var START_BEATS = 3;    // round 1 = 3 beats => 2 gaps
    var CLICK_MS = 70;      // length of each audio click
    var CLICK_FREQ = 880;   // click pitch (Hz)
    var LEAD_MS = 480;      // silent lead-in before the rhythm starts playing
    var TAIL_MS = 520;      // grace after the last beat before "your turn"
    var RESULT_MS = 760;    // pause to show round-cleared before next round

    /* ---------- timers / audio: everything tracked so teardown clears it all ---------- */
    var timers = [];        // every pending setTimeout id
    var oscNodes = [];      // every scheduled oscillator (so we can stop them)
    var audioCtx = null;    // created/resumed on the start gesture
    // token bumped on every phase change + teardown; stale callbacks bail out
    var token = 0;

    /* ---------- state ---------- */
    var round = 0;          // rounds cleared so far
    var targetGaps = [];    // the current rhythm's gaps (ms)
    var phase = "idle";     // idle | listen | tap | over
    var tapTimes = [];      // performance.now() of each player tap
    var firstTap = true;    // first tap only marks beat 1 (no gap yet)

    /* ---------- layout ---------- */
    var wrap = el("div", "rhythmecho-wrap");
    var status = el("div", "g-status");
    var pad = el("div", "rhythmecho-pad");
    var pulse = el("div", "rhythmecho-pulse");
    var cue = el("div", "rhythmecho-cue", "");
    var dots = el("div", "rhythmecho-dots");
    pad.appendChild(pulse);
    pad.appendChild(cue);
    pad.appendChild(dots);
    var hint = el("div", "rhythmecho-hint",
      'listen to the rhythm, then <b>tap it back</b> — tap the pad or press <b>space</b>');
    var overlay = el("div", "g-overlay");

    wrap.appendChild(status);
    wrap.appendChild(pad);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    /* ---------- timer + audio helpers ---------- */
    function later(fn, ms) {
      var t = setTimeout(function () {
        // drop this id from the list once it fires
        var i = timers.indexOf(t);
        if (i !== -1) timers.splice(i, 1);
        fn();
      }, ms);
      timers.push(t);
      return t;
    }
    function clearTimers() {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers = [];
    }
    function stopAudio() {
      for (var i = 0; i < oscNodes.length; i++) {
        try { oscNodes[i].stop(); } catch (e) {}
        try { oscNodes[i].disconnect(); } catch (e) {}
      }
      oscNodes = [];
    }
    // schedule one click at absolute audioCtx time `at` (seconds)
    function scheduleClick(at) {
      if (!audioCtx) return;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(CLICK_FREQ, at);
      var dur = CLICK_MS / 1000;
      // quick percussive envelope so it reads as a "click", no clipping pop
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.5, at + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(at);
      osc.stop(at + dur + 0.02);
      oscNodes.push(osc);
      osc.onended = function () {
        try { osc.disconnect(); } catch (e) {}
        try { gain.disconnect(); } catch (e) {}
        var i = oscNodes.indexOf(osc);
        if (i !== -1) oscNodes.splice(i, 1);
      };
    }
    function ensureAudio() {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      }
      if (audioCtx && audioCtx.state === "suspended") {
        try { audioCtx.resume(); } catch (e) {}
      }
    }

    /* ---------- visual pulse ---------- */
    function firePulse() {
      pulse.classList.remove("rhythmecho-hit");
      void pulse.offsetWidth;       // reflow so the snap re-triggers
      pulse.classList.add("rhythmecho-hit");
      later(function () { pulse.classList.remove("rhythmecho-hit"); }, 150);
    }
    function flashPad(cls) {
      pad.classList.remove("rhythmecho-good", "rhythmecho-bad");
      void pad.offsetWidth;
      pad.classList.add(cls);
    }

    /* ---------- dots (one per beat) ---------- */
    function renderDots(n, activeIdx, playing) {
      dots.innerHTML = "";
      for (var i = 0; i < n; i++) {
        var d = el("div", "rhythmecho-dot");
        if (playing && i <= activeIdx) d.classList.add("rhythmecho-play");
        else if (!playing && i < activeIdx) d.classList.add("rhythmecho-on");
        dots.appendChild(d);
      }
    }
    function lightDot(idx, cls) {
      var kids = dots.children;
      if (idx >= 0 && idx < kids.length) kids[idx].classList.add(cls);
    }

    function setStatus() {
      var label = phase === "listen" ? "listen…"
        : phase === "tap" ? "your turn"
        : phase === "over" ? "game over"
        : "ready";
      status.innerHTML =
        '<span>round ' + (round + 1) + '</span>' +
        '<span class="gl-score">' + label + '</span>';
    }

    /* ---------- rhythm building ---------- */
    function buildRhythm(beats) {
      var gaps = [];
      for (var i = 0; i < beats - 1; i++) {
        gaps.push(Math.random() < 0.5 ? SHORT : LONG);
      }
      return gaps;
    }

    /* ---------- play the rhythm (audio + synced visuals) ---------- */
    function playRhythm() {
      phase = "listen";
      token++;
      var myToken = token;
      tapTimes = [];
      firstTap = true;
      accepting = false;
      pad.classList.remove("rhythmecho-good", "rhythmecho-bad", "rhythmecho-tap");
      pad.classList.add("rhythmecho-listen");
      cue.textContent = "listen…";
      var beats = targetGaps.length + 1;
      renderDots(beats, -1, true);
      setStatus();

      ensureAudio();
      if (!audioCtx) {
        // no Web Audio available — fall back to visual-only playback
        playVisualOnly(myToken, beats);
        return;
      }

      // absolute times: first beat after a short lead-in, then cumulative gaps
      var base = audioCtx.currentTime + LEAD_MS / 1000;
      var offset = 0;            // ms from the first beat
      for (var i = 0; i < beats; i++) {
        var atSec = base + offset / 1000;
        scheduleClick(atSec);
        // schedule the matching visual pulse on the same timeline
        (function (idx, delayMs) {
          later(function () {
            if (myToken !== token || phase !== "listen") return;
            firePulse();
            lightDot(idx, "rhythmecho-play");
          }, LEAD_MS + delayMs);
        })(i, offset);
        if (i < targetGaps.length) offset += targetGaps[i];
      }

      // after the final beat (+ tail), hand control to the player
      later(function () {
        if (myToken !== token) return;
        beginTap();
      }, LEAD_MS + offset + TAIL_MS);
    }
    // visual-only fallback (keeps the game playable with no audio)
    function playVisualOnly(myToken, beats) {
      var offset = 0;
      for (var i = 0; i < beats; i++) {
        (function (idx, delayMs) {
          later(function () {
            if (myToken !== token || phase !== "listen") return;
            firePulse();
            lightDot(idx, "rhythmecho-play");
          }, LEAD_MS + delayMs);
        })(i, offset);
        if (i < targetGaps.length) offset += targetGaps[i];
      }
      later(function () {
        if (myToken !== token) return;
        beginTap();
      }, LEAD_MS + offset + TAIL_MS);
    }

    var accepting = false;   // taps only count during the tap phase

    function beginTap() {
      phase = "tap";
      token++;               // any leftover listen-phase timer is now stale
      pad.classList.remove("rhythmecho-listen");
      pad.classList.add("rhythmecho-tap");
      cue.textContent = "tap it back";
      renderDots(targetGaps.length + 1, 0, false);
      accepting = true;
      setStatus();
    }

    /* ---------- record + judge the player's taps ---------- */
    function onTap() {
      if (phase !== "tap" || !accepting) return;
      var now = performance.now();
      firePulse();
      var beatIdx = tapTimes.length;             // 0-based beat being registered
      tapTimes.push(now);
      lightDot(beatIdx, "rhythmecho-on");

      if (firstTap) {
        // first tap = beat 1; no gap to judge yet
        firstTap = false;
        return;
      }
      // judge the gap that just closed (player gap g vs target gap t)
      var gapIdx = tapTimes.length - 2;          // index into targetGaps
      var playerGap = now - tapTimes[tapTimes.length - 2];
      var targetGap = targetGaps[gapIdx];
      if (!gapOk(playerGap, targetGap)) {
        gameOver();
        return;
      }
      // all gaps reproduced correctly => round cleared
      if (tapTimes.length >= targetGaps.length + 1) {
        roundCleared();
      }
    }

    // a reproduced gap is OK if it's within ±TOL of the target (ratio-based)
    function gapOk(playerGap, targetGap) {
      if (!(playerGap > 0) || !(targetGap > 0)) return false;
      var ratio = playerGap / targetGap;
      return ratio >= (1 - TOL) && ratio <= (1 + TOL);
    }

    function roundCleared() {
      accepting = false;
      phase = "idle";
      token++;
      round++;
      ctx.submitScore(round);
      flashPad("rhythmecho-good");
      cue.textContent = "round " + round + " cleared ✓";
      var myToken = token;
      later(function () {
        if (myToken !== token) return;
        pad.classList.remove("rhythmecho-good");
        nextRound();
      }, RESULT_MS);
    }

    function gameOver() {
      accepting = false;
      phase = "over";
      token++;
      stopAudio();
      clearTimers();
      flashPad("rhythmecho-bad");
      cue.textContent = "";
      setStatus();
      var best = ctx.submitScore(round);
      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + round + '</div>' +
          '<div class="g-sub">' + (best ? "new best! · " : "") + 'rounds cleared</div>' +
          '<button class="g-btn">play again</button>' +
        '</div>'
      );
    }

    /* ---------- round / game flow ---------- */
    function nextRound() {
      var beats = START_BEATS + round;           // round 0 -> 3 beats, grows by 1
      targetGaps = buildRhythm(beats);
      playRhythm();
    }

    function start() {
      clearTimers();
      stopAudio();
      ensureAudio();                             // create/resume on the gesture
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      round = 0;
      tapTimes = [];
      accepting = false;
      pad.classList.remove("rhythmecho-good", "rhythmecho-bad", "rhythmecho-tap", "rhythmecho-listen");
      nextRound();
    }

    function showOverlay(html) {
      overlay.innerHTML = html;
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", start);
      overlay.classList.add("show");
    }

    /* ---------- input ---------- */
    function onKey(e) {
      if (e.code === "Space" || e.key === " ") {
        // only swallow space while a game is active (don't hijack the overlay button)
        if (phase === "tap") {
          e.preventDefault();
          onTap();
        }
      }
    }
    pad.addEventListener("click", onTap);
    document.addEventListener("keydown", onKey);

    /* ---------- initial idle state ---------- */
    phase = "idle";
    setStatus();
    cue.textContent = "";
    renderDots(START_BEATS, -1, false);
    showOverlay(
      '<div class="g-result">' +
        '<div class="g-sub" style="margin-bottom:.4rem">hear a rhythm, then tap it back · sound on</div>' +
        '<button class="g-btn">start</button>' +
      '</div>'
    );

    /* ---------- teardown: stop audio, close context, clear EVERY timer ---------- */
    return function () {
      phase = "over";
      accepting = false;
      token++;                                   // invalidate any pending callback
      clearTimers();
      stopAudio();
      pad.removeEventListener("click", onTap);
      document.removeEventListener("keydown", onKey);
      if (audioCtx) {
        try {
          if (audioCtx.state !== "closed") audioCtx.close();
        } catch (e) {}
        audioCtx = null;
      }
    };
  }
});
