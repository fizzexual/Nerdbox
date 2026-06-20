/* Arrow Rush — flanker task (selective attention + response inhibition).
   A 60-second round. Each trial shows a row of 5 arrows; respond to the
   direction of the CENTRAL arrow ONLY, ignoring the flankers. Flankers are
   congruent (all same way, easy) or incongruent (point the opposite way,
   harder) ~50/50. Respond with Left/Right ARROW KEYS or the on-screen ◀ ▶
   buttons. Correct = +1 and the next trial instantly; wrong = brief red flash,
   next trial (no point). Score = correct responses in 60s (higher is better).

   Cleanup contract (re-checked at bottom): the only timers are roundTimer
   (1s-ish countdown ticker) and flashTimer (clears the red flash). Both are
   cleared on finish() and teardown(). The single document 'keydown' listener
   is removed on finish() (so it can't leak while the result screen sits open)
   AND on teardown() (covers a mid-round unmount). A `running` gate plus a
   per-round token make any late callback a no-op. */
NERDBOX.injectStyle("flanker", `
  .flanker-wrap {
    position: relative; width: 100%; max-width: 560px; margin: 0 auto;
    display: flex; flex-direction: column; align-items: center; gap: 1.4rem;
  }
  .flanker-bar {
    width: 100%; height: 6px; border-radius: 99px; overflow: hidden;
    background: var(--sub-alt);
  }
  .flanker-bar > i {
    display: block; height: 100%; width: 100%;
    background: var(--accent); transform-origin: left center;
    transition: transform 1s linear, background 0.3s;
  }
  .flanker-bar.flanker-low > i { background: var(--error); }
  .flanker-stage {
    width: 100%; min-height: 6.4rem;
    display: flex; align-items: center; justify-content: center;
    gap: clamp(0.4rem, 2.4vw, 1rem);
    background: var(--bg-alt);
    border: 2px solid var(--sub-alt);
    border-radius: 18px; padding: 1.4rem 1rem;
    transition: border-color 0.12s ease, background 0.12s ease;
  }
  .flanker-stage.flanker-good { border-color: var(--go); }
  .flanker-stage.flanker-bad { border-color: var(--error); }
  .flanker-arrow {
    width: clamp(34px, 11vw, 58px); height: clamp(34px, 11vw, 58px);
    flex: 0 0 auto; color: var(--sub);
    transition: color 0.08s ease;
  }
  /* the central arrow — the only one that matters — reads as primary text */
  .flanker-arrow.flanker-target { color: var(--text); }
  .flanker-pads {
    display: flex; gap: 0.7rem; width: 100%; justify-content: center;
  }
  .flanker-pad {
    flex: 1 1 0; max-width: 200px; min-width: 0;
    border: 2px solid var(--sub-alt); border-radius: 14px;
    background: var(--bg-alt); color: var(--text);
    padding: 0.9rem 0.4rem; cursor: pointer;
    font-family: "JetBrains Mono", monospace;
    font-size: clamp(1.6rem, 7vw, 2.2rem); line-height: 1;
    transition: filter 0.12s ease, transform 0.08s ease,
                border-color 0.12s ease, opacity 0.12s ease;
    touch-action: manipulation; -webkit-user-select: none; user-select: none;
  }
  .flanker-pad:hover:not(:disabled) { filter: brightness(1.12); border-color: var(--sub); }
  .flanker-pad:active:not(:disabled) { transform: translateY(1px); }
  .flanker-pad:disabled { cursor: default; opacity: 0.5; }
  .flanker-hint {
    font-family: "JetBrains Mono", monospace; color: var(--sub);
    font-size: 0.85rem; text-align: center; line-height: 1.5;
    min-height: 1.2em;
  }
  .flanker-hint b { color: var(--text); font-weight: 700; }
`);

NERDBOX.register({
  id: "flanker",
  name: "Arrow Rush",
  tagline: "follow the middle arrow, fast",
  category: "attention",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 6 19 12 13 18"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;

    /* ---- config ---- */
    var ROUND = 60;          // seconds
    var FLASH_MS = 220;      // red-flash duration on a wrong answer
    // SVG paths for a left / right pointing arrow, drawn at the stage scale.
    function arrowSvg(dir, isTarget) {
      var pts = dir === "right"
        ? '<polyline points="13 6 19 12 13 18"/>'
        : '<polyline points="11 6 5 12 11 18"/>';
      return '<svg class="flanker-arrow' + (isTarget ? ' flanker-target' : '') +
        '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<line x1="5" y1="12" x2="19" y2="12"/>' + pts + '</svg>';
    }

    /* ---- timers (the complete set) ---- */
    var roundTimer = null;   // countdown ticker
    var flashTimer = null;   // clears the wrong-answer flash

    /* ---- listener bookkeeping ---- */
    var onKeyRef = null;     // the bound document keydown handler (null = not bound)

    /* ---- state ---- */
    var running = false;
    var score = 0;
    var timeLeft = ROUND;
    var target = "left";     // correct answer = direction of the CENTRE arrow
    var token = 0;           // bumped on teardown to neutralise late callbacks

    /* ---- layout ---- */
    var status = el("div", "g-status", "");
    var wrap = el("div", "flanker-wrap");

    var bar = el("div", "flanker-bar", "<i></i>");
    var barFill = bar.firstChild;

    var stage = el("div", "flanker-stage");
    var pads = el("div", "flanker-pads");
    var leftBtn = el("button", "flanker-pad", "◀"); // ◀
    var rightBtn = el("button", "flanker-pad", "▶"); // ▶
    leftBtn.type = "button";
    rightBtn.type = "button";
    leftBtn.setAttribute("aria-label", "central arrow points left");
    rightBtn.setAttribute("aria-label", "central arrow points right");
    pads.appendChild(leftBtn);
    pads.appendChild(rightBtn);

    var hint = el("div", "flanker-hint",
      'respond to the <b>middle</b> arrow only · &larr;/&rarr; keys or the buttons');

    var overlay = el("div", "g-overlay");

    wrap.appendChild(bar);
    wrap.appendChild(stage);
    wrap.appendChild(pads);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    /* ---- helpers ---- */
    function setPads(on) {
      leftBtn.disabled = !on;
      rightBtn.disabled = !on;
    }

    function setStatus() {
      status.innerHTML =
        '<span class="gl-score">score ' + score + '</span>' +
        '<span class="gl-time">' + timeLeft + 's</span>';
    }

    function setBar() {
      var frac = Math.max(0, timeLeft / ROUND);
      barFill.style.transform = "scaleX(" + frac + ")";
      if (timeLeft <= 10) bar.classList.add("flanker-low");
      else bar.classList.remove("flanker-low");
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

    // Render one trial: random target direction, ~50/50 congruent/incongruent.
    function nextTrial() {
      target = rand(2) === 0 ? "left" : "right";
      var congruent = rand(2) === 0;
      var flank = congruent ? target : (target === "left" ? "right" : "left");
      var html = "";
      for (var i = 0; i < 5; i++) {
        var isCentre = (i === 2);
        html += arrowSvg(isCentre ? target : flank, isCentre);
      }
      stage.innerHTML = html;
    }

    function flashGood() {
      // clear any pending wrong-flash reset so it can't undercut us
      if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
      stage.classList.remove("flanker-good", "flanker-bad");
      void stage.offsetWidth; // reflow so re-adding re-triggers the transition
      stage.classList.add("flanker-good");
      flashTimer = setTimeout(function () {
        flashTimer = null;
        stage.classList.remove("flanker-good");
      }, FLASH_MS);
    }

    function flashBad() {
      if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
      stage.classList.remove("flanker-good", "flanker-bad");
      void stage.offsetWidth;
      stage.classList.add("flanker-bad");
      flashTimer = setTimeout(function () {
        flashTimer = null;
        stage.classList.remove("flanker-bad");
      }, FLASH_MS);
    }

    // A response (from key or button). dir is "left" | "right".
    function respond(dir) {
      if (!running) return;
      if (dir === target) {
        score++;
        ctx.submitScore(score);
        setStatus();
        flashGood();
      } else {
        flashBad(); // no point
      }
      nextTrial(); // FAST: next trial appears instantly
    }

    /* ---- keyboard: a single document listener, bound only while playing ---- */
    function onKey(e) {
      // ignore modified chords so browser/OS shortcuts still work
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); respond("left"); }
      else if (e.key === "ArrowRight") { e.preventDefault(); respond("right"); }
    }
    function bindKeys() {
      if (onKeyRef) return;          // never double-bind
      onKeyRef = onKey;
      document.addEventListener("keydown", onKeyRef);
    }
    function unbindKeys() {
      if (onKeyRef) {
        document.removeEventListener("keydown", onKeyRef);
        onKeyRef = null;
      }
    }

    /* ---- round lifecycle ---- */
    function tick() {
      timeLeft--;
      if (timeLeft <= 0) {
        timeLeft = 0;
        setStatus();
        setBar();
        finish();
        return;
      }
      setStatus();
      setBar();
    }

    function start() {
      // fully reset, even on replay
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
      stage.classList.remove("flanker-good", "flanker-bad");
      running = true;
      score = 0;
      timeLeft = ROUND;
      setPads(true);
      bindKeys();
      setStatus();
      // paint a full bar instantly (no animated reset), then let ticks drain it
      barFill.style.transition = "none";
      setBar();
      void barFill.offsetWidth;
      barFill.style.transition = "";
      nextTrial();
      roundTimer = setInterval(tick, 1000);
    }

    function finish() {
      running = false;
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
      stage.classList.remove("flanker-good", "flanker-bad");
      setPads(false);
      unbindKeys(); // critical: never let the key listener leak to the hub

      var best = ctx.submitScore(score);
      setStatus();
      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + score + '</div>' +
          '<div class="g-sub">' + (best ? "new best! · " : "") + 'correct in 60s</div>' +
          '<button class="g-btn">play again</button>' +
        '</div>',
        start
      );
    }

    /* ---- on-screen controls ---- */
    leftBtn.addEventListener("click", function () { respond("left"); });
    rightBtn.addEventListener("click", function () { respond("right"); });

    /* ---- initial idle screen ---- */
    // a calm sample row so the stage isn't empty behind the overlay
    stage.innerHTML =
      arrowSvg("right", false) + arrowSvg("right", false) +
      arrowSvg("left", true) +
      arrowSvg("right", false) + arrowSvg("right", false);
    setPads(false);
    status.textContent = "60 seconds · follow the middle arrow";
    setBar();
    showOverlay('<button class="g-btn">start</button>', start);

    /* ---- teardown: clear EVERY timer + remove the document listener ---- */
    return function teardown() {
      running = false;
      token++;            // any in-flight callback that checks token becomes inert
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
      unbindKeys();
    };
  }
});
