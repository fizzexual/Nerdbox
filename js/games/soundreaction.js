/* Sound Reaction — auditory reaction time. A big pad: click to start, then
   wait for the BEEP and click the instant you HEAR it. The cue is purely
   auditory (only a subtle flash on screen) — react to the tone, not a colour
   change. Clicking before the beep = "too soon!" and resets to idle.
   ms = clickTime − beepOnset; submitted with scoreMode MIN (lower is better).
   Uses the Web Audio API; teardown stops audio, closes the AudioContext and
   clears the pending timer. */
NERDBOX.injectStyle("soundreaction", `
.soundreaction-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
}
.soundreaction-pad {
  position: relative;
  width: 100%;
  min-height: 300px;
  height: min(56vh, 380px);
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
  text-align: center;
  padding: 1.2rem;
  transition: border-color 0.12s ease, background 0.12s ease;
  touch-action: manipulation;
  font-family: "JetBrains Mono", monospace;
}
/* idle / armed / result share the muted look — the player must NOT be able to
   read the beep off the screen, so the "armed" (waiting) state looks the same
   as idle. Only a brief, subtle flash marks the beep. */
.soundreaction-pad.soundreaction-soon { border-color: var(--error); }
.soundreaction-pad.soundreaction-result { border-color: var(--accent); }
/* the beep flash: deliberately subtle (a faint accent wash), so reaction is
   driven by sound, not sight. */
.soundreaction-pad.soundreaction-flash {
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-alt));
}
.soundreaction-main {
  font-size: clamp(1.5rem, 6vw, 2.2rem);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text);
  line-height: 1.1;
}
.soundreaction-pad.soundreaction-soon .soundreaction-main { color: var(--error); }
.soundreaction-pad.soundreaction-result .soundreaction-main { color: var(--accent); }
.soundreaction-sub {
  font-size: clamp(0.95rem, 3.4vw, 1.15rem);
  color: var(--sub);
  letter-spacing: 0.03em;
}
.soundreaction-listen {
  font-size: clamp(1rem, 4vw, 1.3rem);
  color: var(--sub);
  letter-spacing: 0.18em;
}
.soundreaction-best { color: var(--accent); }
.soundreaction-hint {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.85rem;
  text-align: center;
  line-height: 1.5;
}
.soundreaction-hint b { color: var(--accent); font-weight: 700; }
`);

NERDBOX.register({
  id: "soundreaction",
  name: "Sound Reaction",
  tagline: "click the instant you HEAR it",
  category: "hearing",
  scoreMode: "min",
  formatScore: function (v) { return v + " ms"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;

    /* ---- config ---- */
    var WAIT_MIN = 1500;   // random delay before the beep, ms
    var WAIT_MAX = 4000;
    var BEEP_MS = 120;     // tone length (~0.12s)
    var FLASH_MS = 90;     // how long the subtle on-screen flash lingers

    /* ---- audio ---- */
    var AudioCtor = window.AudioContext || window.webkitAudioContext;
    var audio = null;      // AudioContext, created lazily on the start gesture
    var osc = null;        // currently-playing oscillator (if any)
    var gain = null;       // its gain node (if any)

    /* ---- state machine: idle -> wait -> go ---- */
    var state = "idle";
    var timer = null;      // the pending "play the beep" timeout
    var flashTimer = null; // clears the subtle flash
    var beepT = 0;         // performance.now() captured at beep onset

    /* ---- layout ---- */
    var wrap = el("div", "soundreaction-wrap");
    var pad = el("button", "soundreaction-pad");
    pad.type = "button";
    var hint = el("div", "soundreaction-hint",
      'wait for the <b>beep</b>, then click &nbsp;·&nbsp; headphones recommended');
    wrap.appendChild(pad);
    wrap.appendChild(hint);
    root.appendChild(wrap);

    function clearTimer() {
      if (timer !== null) { clearTimeout(timer); timer = null; }
    }
    function clearFlash() {
      if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
    }

    // Tear down any in-flight oscillator without touching the AudioContext.
    function stopAudio() {
      if (osc) {
        try { osc.onended = null; } catch (e) {}
        try { osc.stop(); } catch (e) {}
        try { osc.disconnect(); } catch (e) {}
        osc = null;
      }
      if (gain) {
        try { gain.disconnect(); } catch (e) {}
        gain = null;
      }
    }

    function paint(cls, main, sub) {
      pad.className = "soundreaction-pad" + (cls ? " " + cls : "");
      pad.innerHTML =
        '<div class="soundreaction-main">' + main + '</div>' +
        '<div class="soundreaction-sub">' + sub + '</div>';
    }

    // The "armed" / waiting screen — intentionally gives NO visual hint of the
    // beep so the player reacts to sound, not sight.
    function paintWaiting() {
      pad.className = "soundreaction-pad";
      pad.innerHTML =
        '<div class="soundreaction-listen">listen…</div>' +
        '<div class="soundreaction-sub">click when you hear the beep</div>';
    }

    // Play a short tone via Web Audio and record onset time.
    function playBeep() {
      if (!audio) return;
      stopAudio();
      var now = audio.currentTime;
      var o = audio.createOscillator();
      var g = audio.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(880, now); // clear, easily-heard A5
      // quick attack + decay envelope so it's a crisp blip, no click artefacts
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.32, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + BEEP_MS / 1000);
      o.connect(g);
      g.connect(audio.destination);
      o.start(now);
      o.stop(now + BEEP_MS / 1000 + 0.02);
      osc = o;
      gain = g;
      o.onended = function () {
        // only clean up if this is still the active oscillator
        if (osc === o) { stopAudio(); }
      };
    }

    // Move to the armed state and schedule the beep after a random delay.
    function arm() {
      state = "wait";
      clearFlash();
      pad.classList.remove("soundreaction-flash");
      paintWaiting();
      var delay = WAIT_MIN + Math.random() * (WAIT_MAX - WAIT_MIN);
      clearTimer();
      timer = setTimeout(function () {
        timer = null;
        if (state !== "wait") return; // torn down / reset since scheduling
        beepT = performance.now();    // onset time, captured right at playback
        playBeep();
        state = "go";
        // subtle flash ONLY — not a big visual change; the real cue is the tone
        pad.classList.add("soundreaction-flash");
        clearFlash();
        flashTimer = setTimeout(function () {
          flashTimer = null;
          pad.classList.remove("soundreaction-flash");
        }, FLASH_MS);
      }, delay);
    }

    function onClick() {
      if (state === "idle") {
        // First gesture: create or resume the AudioContext (autoplay policy).
        if (!audio && AudioCtor) {
          try { audio = new AudioCtor(); } catch (e) { audio = null; }
        }
        if (audio && audio.state === "suspended") {
          try { audio.resume(); } catch (e) {}
        }
        arm();
      } else if (state === "wait") {
        // Clicked before the beep — false start.
        clearTimer();
        clearFlash();
        pad.classList.remove("soundreaction-flash");
        state = "idle";
        paint("soundreaction-soon", "too soon!", "wait for the beep · click to retry");
      } else if (state === "go") {
        var ms = Math.round(performance.now() - beepT);
        clearFlash();
        pad.classList.remove("soundreaction-flash");
        var best = ctx.submitScore(ms);
        state = "idle";
        paint(
          "soundreaction-result",
          ms + " ms",
          (best ? '<span class="soundreaction-best">new best!</span> · ' : "") + "click to go again"
        );
      }
    }

    pad.addEventListener("click", onClick);

    /* ---- initial idle state ---- */
    paint("", "Sound Reaction", "click to start");

    /* ---- teardown: stop audio, close the context, clear timers ---- */
    return function () {
      state = "done";
      clearTimer();
      clearFlash();
      stopAudio();
      pad.removeEventListener("click", onClick);
      if (audio) {
        var a = audio;
        audio = null;
        try {
          if (a.state !== "closed") { a.close(); }
        } catch (e) {}
      }
    };
  }
});
