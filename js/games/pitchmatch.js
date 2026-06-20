/* Pitch Match — auditory acuity. A random target tone (220–880 Hz) plays;
   you slide a frequency dial and try to match it by ear. Within tolerance
   (starts ~5%, tightens each round) the streak grows and a new target is
   picked; miss and both frequencies are revealed. scoreMode "max" = longest
   streak. Pure Web Audio — one oscillator at a time, fully torn down.
   Self-contained: one injectStyle + one register. */
NERDBOX.injectStyle("pitchmatch", `
.pitchmatch-wrap {
  position: relative;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.3rem;
}
.pitchmatch-stage {
  width: 100%;
  background: var(--bg-alt);
  border-radius: 16px;
  padding: 1.8rem 1.6rem 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;
}
.pitchmatch-readout {
  font-family: "JetBrains Mono", monospace;
  font-size: 2.6rem;
  font-weight: 500;
  color: var(--text);
  line-height: 1;
  letter-spacing: 0.01em;
}
.pitchmatch-readout span { color: var(--sub); font-size: 1.1rem; font-weight: 400; }
.pitchmatch-cap {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.85rem;
  margin-top: -0.6rem;
}
.pitchmatch-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 8px;
  border-radius: 6px;
  background: var(--sub-alt);
  outline: none;
  cursor: pointer;
}
.pitchmatch-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent);
  border: 3px solid var(--bg-alt);
  box-shadow: 0 0 0 1px var(--accent);
  cursor: pointer;
  transition: transform 0.08s;
}
.pitchmatch-slider::-webkit-slider-thumb:active { transform: scale(1.18); }
.pitchmatch-slider::-moz-range-thumb {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent);
  border: 3px solid var(--bg-alt);
  box-shadow: 0 0 0 1px var(--accent);
  cursor: pointer;
}
.pitchmatch-scale {
  display: flex;
  justify-content: space-between;
  width: 100%;
  font-family: "JetBrains Mono", monospace;
  font-size: 0.72rem;
  color: var(--sub);
  margin-top: -0.7rem;
}
.pitchmatch-controls {
  display: flex;
  gap: 0.7rem;
  flex-wrap: wrap;
  justify-content: center;
}
.pitchmatch-btn {
  border: 1px solid var(--sub-alt);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  padding: 0.6rem 1.1rem;
  font-family: "JetBrains Mono", monospace;
  font-size: 0.95rem;
  font-weight: 500;
  transition: filter 0.12s, transform 0.08s, border-color 0.12s, background 0.12s;
}
.pitchmatch-btn:hover:not(:disabled) { border-color: var(--accent); }
.pitchmatch-btn:active:not(:disabled) { transform: translateY(1px); }
.pitchmatch-btn.playing { border-color: var(--go); color: var(--go); }
.pitchmatch-btn:disabled { opacity: 0.45; }
.pitchmatch-submit { margin-top: 0.2rem; }
.pitchmatch-msg { color: var(--go); }
.pitchmatch-msg.miss { color: var(--error); }
.pitchmatch-hint {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.82rem;
  text-align: center;
}
.pitchmatch-result-line { color: var(--sub); font-size: 0.95rem; text-align: center; }
.pitchmatch-result-line b { color: var(--text); font-family: "JetBrains Mono", monospace; }
.pitchmatch-tol { color: var(--accent); font-family: "JetBrains Mono", monospace; }
`);

NERDBOX.register({
  id: "pitchmatch",
  name: "Pitch Match",
  tagline: "tune your ear to the target tone",
  category: "hearing",
  scoreMode: "max",
  formatScore: function (v) { return v + " streak"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h3l3-8 4 16 3-8h5"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;

    // --- slider range (log scale across 150–1000 Hz) ---
    var F_MIN = 150;      // slider low end (Hz)
    var F_MAX = 1000;     // slider high end (Hz)
    var T_MIN = 220;      // target range low (Hz)
    var T_MAX = 880;      // target range high (Hz)
    var TONE_MS = 700;    // how long a tone plays
    var SLIDER_STEPS = 1000;  // slider granularity (integer range for smooth log mapping)

    var lnLo = Math.log(F_MIN), lnHi = Math.log(F_MAX);
    // map slider integer 0..SLIDER_STEPS -> frequency (log)
    function posToFreq(p) { return Math.exp(lnLo + (lnHi - lnLo) * (p / SLIDER_STEPS)); }
    function freqToPos(f) {
      f = Math.max(F_MIN, Math.min(F_MAX, f));
      return Math.round((Math.log(f) - lnLo) / (lnHi - lnLo) * SLIDER_STEPS);
    }
    var MID_POS = Math.round(SLIDER_STEPS / 2);   // geometric middle of the log slider

    // --- state ---
    var streak = 0;             // current run (max -> best)
    var target = 0;             // target frequency (Hz)
    var tol = 0.05;             // current tolerance (fraction)
    var phase = "idle";         // idle | playing | over

    // --- audio lifecycle ---
    var ac = null;              // AudioContext (created on first gesture)
    var osc = null;             // the one live oscillator (if any)
    var gain = null;            // its gain node
    var timers = [];            // every setTimeout id — cleared on teardown
    var torn = false;           // guard: never touch audio after teardown

    function after(ms, fn) {
      var id = setTimeout(function () {
        var k = timers.indexOf(id);
        if (k >= 0) timers.splice(k, 1);
        fn();
      }, ms);
      timers.push(id);
      return id;
    }
    function clearTimers() {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers = [];
    }

    // create/resume the context — only ever called from a user gesture
    function ensureAudio() {
      if (torn) return null;
      if (!ac) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
      }
      if (ac.state === "suspended" && ac.resume) {
        try { ac.resume(); } catch (e) {}
      }
      return ac;
    }

    // stop & dispose the current oscillator immediately (with a short fade to avoid clicks)
    function stopTone() {
      if (osc) {
        var dead = osc, deadGain = gain;
        osc = null; gain = null;
        try {
          if (ac && deadGain) {
            var now = ac.currentTime;
            deadGain.gain.cancelScheduledValues(now);
            deadGain.gain.setValueAtTime(deadGain.gain.value, now);
            deadGain.gain.linearRampToValueAtTime(0.0001, now + 0.02);
          }
        } catch (e) {}
        try { dead.stop(ac ? ac.currentTime + 0.03 : 0); } catch (e) {}
        // disconnect after the tiny fade so we don't leak nodes
        after(60, function () {
          try { dead.disconnect(); } catch (e) {}
          try { if (deadGain) deadGain.disconnect(); } catch (e) {}
        });
      }
    }

    // play a sine at `freq` for `ms`; ALWAYS stops the previous tone first
    function playTone(freq, ms, btn) {
      var ctxA = ensureAudio();
      if (!ctxA) return;
      stopTone();   // never let two oscillators overlap

      var o = ctxA.createOscillator();
      var g = ctxA.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, ctxA.currentTime);

      var t0 = ctxA.currentTime;
      var t1 = t0 + ms / 1000;
      // gentle attack/release envelope so tones don't pop
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.setValueAtTime(0.18, Math.max(t0 + 0.02, t1 - 0.06));
      g.gain.exponentialRampToValueAtTime(0.0001, t1);

      o.connect(g);
      g.connect(ctxA.destination);
      o.start(t0);
      o.stop(t1 + 0.02);

      osc = o; gain = g;

      // when it ends naturally, clean up + drop the "playing" highlight
      o.onended = function () {
        try { o.disconnect(); } catch (e) {}
        try { g.disconnect(); } catch (e) {}
        if (osc === o) { osc = null; gain = null; }
        if (btn) btn.classList.remove("playing");
      };

      if (btn) {
        // clear any stale highlight on the other play button, mark this one
        playTargetBtn.classList.remove("playing");
        playMineBtn.classList.remove("playing");
        btn.classList.add("playing");
      }
    }

    // ---- DOM ----
    var status = el("div", "g-status");
    var wrap = el("div", "pitchmatch-wrap");
    var stage = el("div", "pitchmatch-stage");

    var readout = el("div", "pitchmatch-readout");
    var cap = el("div", "pitchmatch-cap", "your tone");

    var slider = el("input", "pitchmatch-slider");
    slider.type = "range";
    slider.min = "0";
    slider.max = String(SLIDER_STEPS);
    slider.step = "1";
    slider.value = String(MID_POS);
    slider.setAttribute("aria-label", "your frequency");

    var scale = el("div", "pitchmatch-scale",
      "<span>" + Math.round(F_MIN) + " Hz</span><span>" + Math.round(F_MAX) + " Hz</span>");

    var controls = el("div", "pitchmatch-controls");
    var playTargetBtn = el("button", "pitchmatch-btn", "&#9654; play target");
    var playMineBtn = el("button", "pitchmatch-btn", "&#9654; play mine");
    controls.appendChild(playTargetBtn);
    controls.appendChild(playMineBtn);

    var submitBtn = el("button", "g-btn pitchmatch-submit", "submit");

    var hint = el("div", "pitchmatch-hint",
      "&#127911; use headphones &middot; play the target, then dial yours in to match");

    var overlay = el("div", "g-overlay");

    stage.appendChild(readout);
    stage.appendChild(cap);
    stage.appendChild(slider);
    stage.appendChild(scale);
    stage.appendChild(controls);
    stage.appendChild(submitBtn);

    wrap.appendChild(status);
    wrap.appendChild(stage);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    function myFreq() { return posToFreq(parseInt(slider.value, 10) || 0); }

    function paintReadout() {
      readout.innerHTML = Math.round(myFreq()) + " <span>Hz</span>";
    }

    function setStatus(msg, miss) {
      var s = '<span>streak&nbsp;<b style="color:var(--text);font-weight:500">' + streak + "</b></span>";
      s += '<span>tolerance&nbsp;<b class="pitchmatch-tol">&plusmn;' + (tol * 100).toFixed(1) + "%</b></span>";
      if (msg) s += '<span class="pitchmatch-msg' + (miss ? " miss" : "") + '">' + msg + "</span>";
      status.innerHTML = s;
    }

    function lock(locked) {
      slider.disabled = locked;
      playTargetBtn.disabled = locked;
      playMineBtn.disabled = locked;
      submitBtn.disabled = locked;
    }

    function tolFor(s) {
      // start 5%, tighten ~0.45% per round, floor at 1.2% so it stays winnable
      return Math.max(0.012, 0.05 - s * 0.0045);
    }

    function pickTarget() {
      // 220–880 Hz, integer Hz
      target = T_MIN + ctx.util.rand(T_MAX - T_MIN + 1);
    }

    function newRound(resetStreak) {
      stopTone();
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      if (resetStreak) streak = 0;
      tol = tolFor(streak);
      phase = "idle";
      pickTarget();
      slider.value = String(MID_POS);   // reset dial to the middle
      paintReadout();
      lock(false);
      setStatus();
    }

    function onSubmit() {
      if (phase === "over") return;
      var mine = myFreq();
      var diff = Math.abs(mine - target) / target;   // relative error vs target
      if (diff <= tol) {
        streak++;
        ctx.submitScore(streak);     // max -> longest streak
        setStatus("nice! &plusmn;" + (diff * 100).toFixed(1) + "% off", false);
        // brief beat so the "nice!" is readable, then next target
        lock(true);
        after(850, function () { newRound(false); });
      } else {
        gameOver(mine, diff);
      }
    }

    function gameOver(mine, diff) {
      phase = "over";
      stopTone();
      lock(true);
      setStatus("missed — " + (diff * 100).toFixed(1) + "% off", true);
      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-big">' + streak + "</div>" +
          '<div class="g-sub">best streak</div>' +
          '<div class="pitchmatch-result-line">target was <b>' + Math.round(target) +
            " Hz</b> &middot; you played <b>" + Math.round(mine) + " Hz</b></div>" +
          '<div class="pitchmatch-result-line">needed within <b>&plusmn;' + (tol * 100).toFixed(1) + "%</b></div>" +
          '<button class="g-btn">play again</button>' +
        "</div>";
      overlay.querySelector("button").addEventListener("click", function () { newRound(true); });
      overlay.classList.add("show");
    }

    function showStart() {
      phase = "idle";
      lock(false);
      setStatus();
      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-sub">match the target tone by ear &middot; headphones recommended</div>' +
          '<button class="g-btn">start</button>' +
        "</div>";
      // the start button is the first gesture — kicks the AudioContext alive
      overlay.querySelector("button").addEventListener("click", function () {
        ensureAudio();
        newRound(true);
      });
      overlay.classList.add("show");
    }

    // ---- wiring ----
    slider.addEventListener("input", paintReadout);
    playTargetBtn.addEventListener("click", function () {
      if (phase === "over") return;
      playTone(target, TONE_MS, playTargetBtn);
    });
    playMineBtn.addEventListener("click", function () {
      if (phase === "over") return;
      playTone(myFreq(), TONE_MS, playMineBtn);
    });
    submitBtn.addEventListener("click", onSubmit);

    pickTarget();
    paintReadout();
    showStart();

    // ---- teardown: stop oscillators, close the context, clear timers ----
    return function () {
      torn = true;
      clearTimers();
      // hard-stop the live oscillator immediately (no fades — we're leaving)
      if (osc) {
        try { osc.onended = null; } catch (e) {}
        try { osc.stop(); } catch (e) {}
        try { osc.disconnect(); } catch (e) {}
        osc = null;
      }
      if (gain) { try { gain.disconnect(); } catch (e) {} gain = null; }
      if (ac) {
        var dead = ac; ac = null;
        try { if (dead.state !== "closed") dead.close(); } catch (e) {}
      }
    };
  }
});
