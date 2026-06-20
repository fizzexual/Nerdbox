/* Snap Count — subitizing speed. A cluster of dots flashes at random,
   non-overlapping spots for a SHORT moment, then vanishes; you tap how many
   there were on a 1–12 number pad as fast as you can.

   Correct  -> streak++, submitScore(streak), and the next flash is HARDER
               (more dots, up to a cap, and a slightly SHORTER flash).
   Wrong    -> game over: the true count is revealed, best = streak (max),
               "play again".

   Cleanup contract (re-checked at the bottom): the ONLY timers are the two
   stage timers — the "hide the dots" timer and the short "next round" timer —
   and both ids live in the `timers` Set, cleared on finish() AND teardown().
   A `running` gate plus a per-round `token` neutralise any late callback, so
   a stale hide/advance can never fire after unmount or game over. The dot
   count painted is the same `count` value compared against the tap, so what's
   shown always matches what's scored (verified in fillField/judge). */
NERDBOX.injectStyle("snapcount", `
  .snapcount-wrap {
    position: relative; width: 100%; max-width: 460px; margin: 0 auto;
    display: flex; flex-direction: column; align-items: center; gap: 1.2rem;
  }
  .snapcount-field {
    position: relative; width: 100%; aspect-ratio: 3 / 2;
    border: 2px solid var(--sub-alt); border-radius: 16px;
    background: var(--bg-alt); overflow: hidden;
  }
  .snapcount-dot {
    position: absolute; border-radius: 50%;
    width: 7%; aspect-ratio: 1 / 1;
    background: var(--accent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 50%, transparent);
    transform: translate(-50%, -50%);
    animation: snapcount-pop 0.1s ease;
  }
  @keyframes snapcount-pop {
    from { transform: translate(-50%, -50%) scale(0.4); opacity: 0.2; }
    to   { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  }
  /* the centred "?" prompt shown while the field is blank and awaiting a tap */
  .snapcount-ask {
    position: absolute; inset: 0; display: flex;
    align-items: center; justify-content: center;
    font-family: "JetBrains Mono", monospace; font-weight: 700;
    font-size: clamp(2.4rem, 14vw, 4rem); color: var(--sub-alt);
    pointer-events: none; user-select: none; -webkit-user-select: none;
  }
  .snapcount-pad {
    display: grid; grid-template-columns: repeat(6, 1fr);
    gap: clamp(0.35rem, 2.2vw, 0.6rem); width: 100%;
    touch-action: manipulation;
  }
  .snapcount-key {
    border: 2px solid var(--sub-alt); border-radius: 12px;
    background: var(--bg-alt); color: var(--text);
    font-family: "JetBrains Mono", monospace; font-weight: 700;
    font-size: clamp(1rem, 4.5vw, 1.35rem); line-height: 1;
    padding: clamp(0.55rem, 3vw, 0.85rem) 0; cursor: pointer;
    -webkit-user-select: none; user-select: none;
    transition: border-color 0.1s ease, background 0.1s ease,
                transform 0.07s ease, color 0.1s ease;
  }
  .snapcount-key:hover:not(:disabled) { border-color: var(--sub); filter: brightness(1.12); }
  .snapcount-key:active:not(:disabled) { transform: translateY(2px) scale(0.98); }
  .snapcount-key:disabled { cursor: default; opacity: 0.55; }
  .snapcount-key.snapcount-good {
    border-color: var(--go); color: var(--go);
    background: color-mix(in srgb, var(--go) 16%, var(--bg-alt));
  }
  .snapcount-key.snapcount-bad {
    border-color: var(--error); color: var(--error);
    background: color-mix(in srgb, var(--error) 16%, var(--bg-alt));
  }
  .snapcount-hint {
    font-family: "JetBrains Mono", monospace; color: var(--sub);
    font-size: 0.85rem; text-align: center; line-height: 1.5; min-height: 1.2em;
  }
  .snapcount-hint b { color: var(--text); font-weight: 700; }
`);

NERDBOX.register({
  id: "snapcount",
  name: "Snap Count",
  tagline: "how many dots? quick!",
  category: "perception",
  scoreMode: "max",
  formatScore: function (v) { return v + " streak"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="1.6"/><circle cx="17" cy="6" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="6" cy="17" r="1.6"/><circle cx="18" cy="16" r="1.6"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;

    /* ---- config ---- */
    var PAD_MAX = 12;        // number pad is 1..PAD_MAX
    var MIN_DOTS = 3;        // starting low end of the dot count
    var START_HI = 7;        // starting high end of the dot count
    var DOT_CAP = 12;        // dots never exceed this (== PAD_MAX)
    var FLASH_START = 600;   // ms the dots stay visible at streak 0
    var FLASH_MIN = 240;     // never flash shorter than this
    var FLASH_STEP = 18;     // ms shaved off the flash per correct answer
    var NEXT_MS = 650;       // pause after a correct tap before the next flash

    /* ---- timers: ONLY the hide + next-round ids; cleared on finish/teardown ---- */
    var timers = new Set();
    function later(fn, ms) {
      var id = setTimeout(function () {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    }
    function clearTimers() {
      timers.forEach(function (id) { clearTimeout(id); });
      timers.clear();
    }

    /* ---- state ---- */
    var running = false;     // true only during an active game
    var phase = "idle";      // idle | flash | answer | between | over
    var streak = 0;
    var count = 0;           // dots currently in play (the source of truth)
    var token = 0;           // bumped on finish/teardown -> late callbacks no-op

    /* ---- layout ---- */
    var status = el("div", "g-status", "");
    var wrap = el("div", "snapcount-wrap");

    var field = el("div", "snapcount-field");
    var ask = el("div", "snapcount-ask", "");   // the "?" while awaiting a tap
    field.appendChild(ask);

    var pad = el("div", "snapcount-pad");
    var keys = [];
    for (var n = 1; n <= PAD_MAX; n++) {
      var k = el("button", "snapcount-key", String(n));
      k.type = "button";
      k.dataset.n = String(n);
      k.setAttribute("aria-label", n + " dots");
      k.addEventListener("click", onKey);
      pad.appendChild(k);
      keys.push(k);
    }

    var hint = el("div", "snapcount-hint",
      'flashes, then <b>vanishes</b> — tap the count &middot; keys <b>1–9</b> too');

    var overlay = el("div", "g-overlay");

    wrap.appendChild(field);
    wrap.appendChild(pad);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    /* ---- helpers ---- */
    function setStatus() {
      status.innerHTML =
        '<span class="gl-score">streak ' + streak + '</span>' +
        '<span>best ' + (NERDBOX.getBest("snapcount") || 0) + '</span>';
    }

    function setPad(on) {
      for (var i = 0; i < keys.length; i++) keys[i].disabled = !on;
    }

    function clearKeyMarks() {
      for (var i = 0; i < keys.length; i++) {
        keys[i].classList.remove("snapcount-good", "snapcount-bad");
      }
    }

    function clearDots() {
      // remove dot nodes but keep the "?" prompt element
      var dots = field.querySelectorAll(".snapcount-dot");
      for (var i = 0; i < dots.length; i++) field.removeChild(dots[i]);
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

    // how many dots for the current streak (slowly grows, capped at DOT_CAP)
    function countForStreak(s) {
      var hi = Math.min(START_HI + Math.floor(s / 2), DOT_CAP);
      var lo = Math.min(MIN_DOTS + Math.floor(s / 4), hi);
      return lo + rand(hi - lo + 1);
    }

    // flash duration for the current streak (shrinks, floored at FLASH_MIN)
    function flashForStreak(s) {
      return Math.max(FLASH_MIN, FLASH_START - s * FLASH_STEP);
    }

    // place `count` dots at random, NON-OVERLAPPING spots (percentage coords),
    // then return — `count` is the single value judged against the tap later.
    function fillField() {
      clearDots();
      var placed = [];                 // {x,y} in % units
      var MARGIN = 9;                   // keep dots off the very edge (%)
      var MIN_GAP = 13;                 // min centre-to-centre distance (%)
      var lo = MARGIN, span = 100 - MARGIN * 2;
      for (var i = 0; i < count; i++) {
        var x = 0, y = 0, ok = false, tries = 0;
        while (!ok && tries < 200) {
          x = lo + Math.random() * span;
          y = lo + Math.random() * span;
          ok = true;
          for (var j = 0; j < placed.length; j++) {
            var dx = x - placed[j].x, dy = y - placed[j].y;
            if (dx * dx + dy * dy < MIN_GAP * MIN_GAP) { ok = false; break; }
          }
          tries++;
        }
        placed.push({ x: x, y: y });
        var dot = el("div", "snapcount-dot");
        dot.style.left = x + "%";
        dot.style.top = y + "%";
        field.appendChild(dot);
      }
      // placed.length === count by construction (one push per loop iteration)
    }

    /* ---- round lifecycle ---- */
    function nextRound() {
      if (!running) return;
      phase = "flash";
      clearKeyMarks();
      setPad(false);                   // no tapping while the dots are showing
      ask.textContent = "";            // hide the "?" during the flash
      count = countForStreak(streak);  // decide the count ONCE
      fillField();                     // paint exactly `count` dots
      var ms = flashForStreak(streak);
      var myToken = token;
      // hide the dots after the short flash, then accept a tap
      later(function () {
        if (!running || myToken !== token) return;
        clearDots();
        ask.textContent = "?";
        phase = "answer";
        setPad(true);
      }, ms);
    }

    function judge(guess) {
      if (!running || phase !== "answer") return;
      phase = "between";
      setPad(false);
      ask.textContent = "";
      // mark the key the player pressed; reveal the true count on a miss
      var pressed = keys[guess - 1];   // keys[0] is "1"
      if (guess === count) {
        // CORRECT -> streak grows, harder next round
        if (pressed) pressed.classList.add("snapcount-good");
        streak++;
        ctx.submitScore(streak);
        setStatus();
        var myToken = token;
        later(function () {
          if (!running || myToken !== token) return;
          nextRound();
        }, NEXT_MS);
      } else {
        // WRONG -> game over, reveal the real answer
        if (pressed) pressed.classList.add("snapcount-bad");
        var truth = keys[count - 1];   // count is within 1..PAD_MAX by config
        if (truth) truth.classList.add("snapcount-good");
        finish();
      }
    }

    function onKey() {
      var g = Number(this.dataset.n);
      judge(g);
    }

    /* ---- keyboard: a single document listener (digits 1–9 -> a tap) ---- */
    var onDocKeyRef = null;            // bound handler (null = not bound)
    function onDocKey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return; // leave OS/browser chords be
      if (phase !== "answer") return;
      var d = parseInt(e.key, 10);     // "1".."9" -> 1..9; NaN otherwise
      if (d >= 1 && d <= 9 && d <= PAD_MAX) { e.preventDefault(); judge(d); }
    }
    function bindKeys() {
      if (onDocKeyRef) return;         // never double-bind
      onDocKeyRef = onDocKey;
      document.addEventListener("keydown", onDocKeyRef);
    }
    function unbindKeys() {
      if (onDocKeyRef) {
        document.removeEventListener("keydown", onDocKeyRef);
        onDocKeyRef = null;
      }
    }

    function start() {
      // full reset, even on replay
      clearTimers();
      token++;
      running = true;
      phase = "flash";
      streak = 0;
      clearKeyMarks();
      clearDots();
      ask.textContent = "";
      setStatus();
      nextRound();
    }

    function finish() {
      running = false;
      phase = "over";
      token++;                         // invalidate any in-flight hide/advance timer
      clearTimers();
      setPad(false);

      var best = ctx.submitScore(streak);
      setStatus();
      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + streak + '</div>' +
          '<div class="g-sub">' +
            (best ? 'new best! &middot; ' : '') +
            'it was <b>' + count + '</b> dots' +
          '</div>' +
          '<button class="g-btn">play again</button>' +
        '</div>',
        start
      );
    }

    /* ---- initial idle screen ---- */
    setPad(false);
    ask.textContent = "?";
    setStatus();
    bindKeys();
    showOverlay('<button class="g-btn">start</button>', start);

    /* ---- teardown: clear EVERY timer + remove the document listener ---- */
    return function teardown() {
      running = false;
      phase = "idle";
      token++;                         // any in-flight callback sees a stale token
      clearTimers();                   // clears the hide + next-round timers
      unbindKeys();                    // never leak the keydown listener
    };
  }
});
