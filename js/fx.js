/* ============================================================
   fx.js — Nerdbox "juice": tiny Web Audio engine + confetti.
   Self-contained, ES5, no framework, no build. Loads after core.js
   and the games (all of which have registered) and self-wires on
   DOMContentLoaded. Exposes window.NERDBOX_FX.
   ============================================================ */
(function () {
  "use strict";

  var NB = window.NERDBOX;

  /* ---------- shared style ---------- */
  if (NB && NB.injectStyle) {
    NB.injectStyle("fx",
      ".fx-confetti{position:fixed;inset:0;width:100%;height:100%;" +
        "pointer-events:none;z-index:9999;}" +
      ".fx-mute{cursor:pointer;font-size:16px;line-height:1;}" +
      ".fx-mute.fx-off{color:var(--sub);}"
    );
  }

  /* ============================================================
     1) SOUND — one lazily-created, gesture-resumed AudioContext.
     ============================================================ */
  var MUTE_KEY = "nerdbox-muted";
  var ctx = null;          // the single shared AudioContext
  var AC = window.AudioContext || window.webkitAudioContext || null;

  function isMuted() {
    try { return localStorage.getItem(MUTE_KEY) === "1"; }
    catch (e) { return false; }
  }
  function setMuted(on) {
    try { localStorage.setItem(MUTE_KEY, on ? "1" : "0"); } catch (e) {}
  }
  function toggleMute() {
    var next = !isMuted();
    setMuted(next);
    return next;
  }

  /* Create the AudioContext exactly once; resume if suspended.
     Returns the context, or null if Web Audio is unavailable. */
  function ensureCtx() {
    if (!AC) return null;
    if (!ctx) {
      try { ctx = new AC(); } catch (e) { ctx = null; return null; }
    }
    if (ctx && ctx.state === "suspended" && ctx.resume) {
      try { ctx.resume(); } catch (e) {}
    }
    return ctx;
  }

  /* One oscillator+gain "note" with a fast attack/decay envelope. */
  function note(ac, freq, startAt, dur, peak, type) {
    var osc = ac.createOscillator();
    var gain = ac.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;

    var t0 = ac.currentTime + startAt;
    var t1 = t0 + dur;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }

  /* Note tables for each cue. Frequencies (Hz), all low-volume. */
  var VOICES = {
    tick:   { peak: 0.04, type: "square",   notes: [[660, 0.00, 0.05]] },
    good:   { peak: 0.06, type: "sine",     notes: [[523, 0.00, 0.11], [784, 0.09, 0.13]] },
    best:   { peak: 0.06, type: "triangle", notes: [[523, 0.00, 0.11], [659, 0.09, 0.11], [988, 0.18, 0.20]] },
    unlock: { peak: 0.06, type: "triangle", notes: [[523, 0.00, 0.12], [659, 0.10, 0.12], [784, 0.20, 0.12], [1047, 0.30, 0.26]] },
    bad:    { peak: 0.06, type: "sawtooth", notes: [[160, 0.00, 0.18], [120, 0.06, 0.16]] }
  };

  function play(type) {
    if (isMuted()) return;
    var voice = VOICES[type];
    if (!voice) return;
    var ac = ensureCtx();
    if (!ac) return;
    var ns = voice.notes;
    for (var i = 0; i < ns.length; i++) {
      note(ac, ns[i][0], ns[i][1], ns[i][2], voice.peak, voice.type);
    }
  }

  /* ============================================================
     2) CONFETTI — self-cleaning per-call canvas burst.
     ============================================================ */
  var FESTIVE = ["#ffd166", "#06d6a0"]; // two fixed festive colours

  function reduceMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function confettiColors() {
    var cols = [];
    var root = document.documentElement;
    var cs = root ? getComputedStyle(root) : null;
    var vars = ["--accent", "--error", "--caret"];
    if (cs) {
      for (var i = 0; i < vars.length; i++) {
        var v = (cs.getPropertyValue(vars[i]) || "").trim();
        if (v) cols.push(v);
      }
    }
    cols.push(FESTIVE[0]);
    cols.push(FESTIVE[1]);
    return cols;
  }

  function confetti() {
    if (reduceMotion()) return;

    var canvas = document.createElement("canvas");
    canvas.className = "fx-confetti";
    var g = canvas.getContext ? canvas.getContext("2d") : null;
    if (!g) return; // no 2D context -> nothing to do, nothing to leak

    var w = canvas.width = window.innerWidth || document.documentElement.clientWidth || 800;
    var h = canvas.height = window.innerHeight || document.documentElement.clientHeight || 600;
    document.body.appendChild(canvas);

    var cols = confettiColors();
    var COUNT = 90;
    var parts = [];
    var i;
    for (i = 0; i < COUNT; i++) {
      parts.push({
        x: w * (0.25 + Math.random() * 0.5),
        y: h * (0.30 + Math.random() * 0.2),
        vx: (Math.random() - 0.5) * 9,
        vy: -(6 + Math.random() * 9),
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.4,
        sw: 5 + Math.random() * 6,
        sh: 8 + Math.random() * 8,
        col: cols[(Math.random() * cols.length) | 0]
      });
    }

    var GRAV = 0.32;
    var DUR = 1300;          // ms — burst lifetime
    var start = (window.performance && performance.now) ? performance.now() : Date.now();
    var rafId = 0;
    var done = false;

    function cleanup() {
      if (done) return;
      done = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }

    function frame(now) {
      if (done) return;
      var t = (now || Date.now()) - start;
      if (t >= DUR) { cleanup(); return; }

      var fade = 1 - (t / DUR);
      g.clearRect(0, 0, w, h);
      g.globalAlpha = fade < 0 ? 0 : fade;

      for (var j = 0; j < parts.length; j++) {
        var p = parts[j];
        p.vy += GRAV;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;

        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = p.col;
        g.fillRect(-p.sw / 2, -p.sh / 2, p.sw, p.sh);
        g.restore();
      }
      g.globalAlpha = 1;

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);

    // Safety net: guarantee teardown even if rAF is throttled/paused.
    setTimeout(cleanup, DUR + 400);
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  window.NERDBOX_FX = {
    sound: {
      play: play,
      isMuted: isMuted,
      setMuted: setMuted,
      toggleMute: toggleMute
    },
    play: play,
    isMuted: isMuted,
    setMuted: setMuted,
    toggleMute: toggleMute,
    confetti: confetti
  };

  /* ============================================================
     SELF-WIRE
     ============================================================ */
  function muteGlyph(btn) {
    var off = isMuted();
    btn.textContent = off ? "🔇" : "🔊";
    btn.setAttribute("aria-label", off ? "sound off" : "sound on");
    if (off) btn.className = "icon-btn fx-mute fx-off";
    else btn.className = "icon-btn fx-mute";
  }

  function wire() {
    // Guard against double-init: bail if our button already exists.
    if (document.querySelector(".fx-mute")) return;

    // Best-score celebration (no sound on ordinary scores — too spammy).
    if (NB && NB.onScore) {
      NB.onScore(function (id, value, isBest) {
        if (isBest) {
          play("best");
          confetti();
        }
      });
    }

    // One delegated click listener: resume audio on gesture + tick on buttons.
    document.addEventListener("click", function (e) {
      ensureCtx(); // first user gesture resumes the (suspended) context
      var t = e.target;
      var hit = t && t.closest ? t.closest(".g-btn, .hub-chip") : null;
      if (hit) play("tick");
    });

    // Inject the mute toggle into the nav, before #theme-select.
    var nav = document.querySelector(".top-nav");
    var themeSelect = document.getElementById("theme-select");
    if (nav) {
      var btn;
      if (NB && NB.util && NB.util.el) btn = NB.util.el("button", "icon-btn fx-mute");
      else { btn = document.createElement("button"); btn.className = "icon-btn fx-mute"; }
      btn.type = "button";
      btn.title = "sound";
      muteGlyph(btn);
      btn.addEventListener("click", function () {
        toggleMute();
        muteGlyph(btn);
        ensureCtx();
        if (!isMuted()) play("tick"); // tiny audible confirmation when re-enabling
      });
      if (themeSelect && themeSelect.parentNode === nav) nav.insertBefore(btn, themeSelect);
      else nav.appendChild(btn);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
