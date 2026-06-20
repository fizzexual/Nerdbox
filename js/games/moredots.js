/* More or Less — approximate number sense / perceptual speed. A fast
   60-second round. Two panels (left & right) each show a scattered cluster of
   dots; tap the side that has MORE dots as fast as you can. Correct = +1 and
   the next trial appears INSTANTLY; wrong = a brief red flash on the side you
   picked (the correct side lights up green too) and the next trial, no point.

   Each trial randomizes both counts (8..40 dots per side) and the RATIO between
   them — closer counts are deliberately harder to judge. The clusters flash for
   a beat and then dim (you keep the dots but they fade back), so you have to
   rely on a fast gestalt impression rather than counting — that keeps it FAST.

   Cleanup contract (re-checked at the bottom): every timer id lives in the
   `timers` Set and is cleared on finish() AND teardown(). Timers used: the
   per-second countdown interval (`roundTimer`, tracked separately), the short
   post-answer flash/advance timer, and the per-trial "dim the dots" timer — all
   the one-shots go through later() into `timers`. The single document 'keydown'
   listener is removed on finish() (so it can't leak while the result screen
   sits) AND on teardown() (mid-round unmount). A `running` gate plus a per-round
   `token` make any late callback a no-op. Scoring picks the side whose count is
   strictly larger (`moreSide`); counts are forced unequal when generated. */
NERDBOX.injectStyle("moredots", `
  .moredots-wrap {
    position: relative; width: 100%; max-width: 620px; margin: 0 auto;
    display: flex; flex-direction: column; align-items: center; gap: 1.4rem;
  }
  .moredots-bar {
    width: 100%; height: 6px; border-radius: 99px; overflow: hidden;
    background: var(--sub-alt);
  }
  .moredots-bar > i {
    display: block; height: 100%; width: 100%;
    background: var(--accent); transform-origin: left center;
    transition: transform 1s linear, background 0.3s;
  }
  .moredots-bar.moredots-low > i { background: var(--error); }
  .moredots-cards {
    display: flex; gap: clamp(0.5rem, 2.4vw, 1rem);
    width: 100%; justify-content: center; align-items: stretch;
    touch-action: manipulation;
  }
  .moredots-card {
    position: relative; flex: 1 1 0; min-width: 0; max-width: 290px;
    aspect-ratio: 1 / 1;
    border: 2px solid var(--sub-alt); border-radius: 18px;
    background: var(--bg-alt); cursor: pointer; overflow: hidden;
    -webkit-user-select: none; user-select: none;
    transition: border-color 0.1s ease, background 0.1s ease, transform 0.07s ease;
  }
  .moredots-card:hover:not(:disabled) { filter: brightness(1.12); border-color: var(--sub); }
  .moredots-card:active:not(:disabled) { transform: translateY(2px) scale(0.99); }
  .moredots-card:disabled { cursor: default; }
  /* the scatter surface fills the card; dots are absolutely placed inside it */
  .moredots-field {
    position: absolute; inset: 0; pointer-events: none;
    opacity: 0.34; transition: opacity 0.18s ease;
  }
  .moredots-card.moredots-flash .moredots-field { opacity: 1; }
  .moredots-dot {
    position: absolute; border-radius: 50%;
    background: var(--text);
    transform: translate(-50%, -50%);
  }
  /* feedback: the chosen-correct / the actual bigger side go green, a wrong pick red */
  .moredots-card.moredots-good {
    border-color: var(--go);
    background: color-mix(in srgb, var(--go) 16%, var(--bg-alt));
  }
  .moredots-card.moredots-good .moredots-dot { background: var(--go); }
  .moredots-card.moredots-bad {
    border-color: var(--error);
    background: color-mix(in srgb, var(--error) 16%, var(--bg-alt));
  }
  .moredots-card.moredots-bad .moredots-dot { background: var(--error); }
  .moredots-vs {
    flex: 0 0 auto; align-self: center;
    font-family: "JetBrains Mono", monospace; color: var(--sub);
    font-size: 0.95rem; letter-spacing: 0.1em;
  }
  .moredots-hint {
    font-family: "JetBrains Mono", monospace; color: var(--sub);
    font-size: 0.85rem; text-align: center; line-height: 1.5;
    min-height: 1.2em;
  }
  .moredots-hint b { color: var(--text); font-weight: 700; }
`);

NERDBOX.register({
  id: "moredots",
  name: "More or Less",
  tagline: "which side has more dots?",
  category: "perception",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="8" r="1.2"/><circle cx="5" cy="14" r="1.2"/><circle cx="9" cy="16" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="19" cy="9" r="1.2"/><circle cx="14" cy="12" r="1.2"/><circle cx="18" cy="15" r="1.2"/><circle cx="15" cy="18" r="1.2"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;

    /* ---- config ---- */
    var ROUND = 60;          // seconds
    var FLASH_MS = 150;      // answer-feedback duration before the next trial
    var DIM_MS = 600;        // clusters show bright this long, then fade to dim
    var MIN_DOTS = 8;        // fewest dots on a side
    var MAX_DOTS = 40;       // most dots on a side

    /* ---- timers: every one-shot id lives here; cleared on finish/teardown ---- */
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
    var roundTimer = null;   // per-second countdown interval (tracked separately)

    /* ---- listener bookkeeping ---- */
    var onKeyRef = null;     // bound document keydown handler (null = not bound)

    /* ---- state ---- */
    var running = false;
    var locked = false;      // true between an answer and the next trial (ignore taps)
    var score = 0;
    var timeLeft = ROUND;
    var moreSide = 0;        // 0 = left has MORE dots, 1 = right has more
    var token = 0;           // bumped on finish/teardown to neutralise late callbacks

    /* ---- layout ---- */
    var status = el("div", "g-status", "");
    var wrap = el("div", "moredots-wrap");

    var bar = el("div", "moredots-bar", "<i></i>");
    var barFill = bar.firstChild;

    var cards = el("div", "moredots-cards");
    var leftCard = el("button", "moredots-card", '<span class="moredots-field"></span>');
    var vs = el("div", "moredots-vs", "vs");
    var rightCard = el("button", "moredots-card", '<span class="moredots-field"></span>');
    leftCard.type = "button";
    rightCard.type = "button";
    leftCard.setAttribute("aria-label", "left cluster");
    rightCard.setAttribute("aria-label", "right cluster");
    var leftField = leftCard.firstChild;
    var rightField = rightCard.firstChild;
    cards.appendChild(leftCard);
    cards.appendChild(vs);
    cards.appendChild(rightCard);

    var hint = el("div", "moredots-hint",
      'tap the side with <b>more</b> dots &middot; or use &larr; / &rarr;');

    var overlay = el("div", "g-overlay");

    wrap.appendChild(bar);
    wrap.appendChild(cards);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    /* ---- helpers ---- */
    function setCards(on) {
      leftCard.disabled = !on;
      rightCard.disabled = !on;
    }

    function setStatus() {
      status.innerHTML =
        '<span class="gl-score">score ' + score + '</span>' +
        '<span class="gl-time">' + timeLeft + 's</span>';
    }

    function setBar() {
      var frac = Math.max(0, timeLeft / ROUND);
      barFill.style.transform = "scaleX(" + frac + ")";
      if (timeLeft <= 10) bar.classList.add("moredots-low");
      else bar.classList.remove("moredots-low");
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

    // Paint `count` dots, scattered with a small margin so none clip the rounded
    // corners. Dot size shrinks a touch as counts grow so dense fields don't turn
    // into a solid blob. Built as one HTML string for speed (no per-dot reflow).
    function paintField(field, count) {
      // size: 9% of the card for sparse, easing toward ~5.5% when crowded
      var pct = 9 - (count - MIN_DOTS) / (MAX_DOTS - MIN_DOTS) * 3.5;
      var html = "";
      for (var i = 0; i < count; i++) {
        var x = 10 + Math.random() * 80;   // 10%..90%
        var y = 10 + Math.random() * 80;
        html +=
          '<span class="moredots-dot" style="left:' + x.toFixed(2) + '%;top:' +
          y.toFixed(2) + '%;width:' + pct.toFixed(2) + '%;height:' +
          pct.toFixed(2) + '%;"></span>';
      }
      field.innerHTML = html;
    }

    // Build the next trial: two DISTINCT counts in [MIN_DOTS, MAX_DOTS] with a
    // randomized ratio (closer = harder), placed on a random side.
    function makeTrial() {
      var lo = MIN_DOTS + rand(MAX_DOTS - MIN_DOTS);  // base "smaller" count, 8..39
      // gap between the two sides: skewed toward small gaps for difficulty, but
      // a fair share of easy ones too. 1..(headroom) with headroom capped at 14.
      var headroom = Math.min(14, MAX_DOTS - lo);
      if (headroom < 1) { lo -= 1; headroom = Math.min(14, MAX_DOTS - lo); }
      // bias: square the random fraction so small gaps are more common
      var r = Math.random();
      var gap = 1 + Math.floor(r * r * headroom);
      if (gap < 1) gap = 1;
      var hi = lo + gap;
      if (hi > MAX_DOTS) hi = MAX_DOTS;
      if (hi <= lo) hi = lo + 1;                      // never equal

      moreSide = rand(2);                             // 0 = left has more, 1 = right
      var leftCount = moreSide === 0 ? hi : lo;
      var rightCount = moreSide === 0 ? lo : hi;

      leftCard.classList.remove("moredots-good", "moredots-bad");
      rightCard.classList.remove("moredots-good", "moredots-bad");
      paintField(leftField, leftCount);
      paintField(rightField, rightCount);

      // flash both clusters bright, then dim them so judging stays a fast glance
      leftCard.classList.add("moredots-flash");
      rightCard.classList.add("moredots-flash");
      var myToken = token;
      later(function () {
        if (!running || myToken !== token) return;
        leftCard.classList.remove("moredots-flash");
        rightCard.classList.remove("moredots-flash");
      }, DIM_MS);
    }

    // Respond to a chosen side. side: 0 = left, 1 = right.
    function respond(side) {
      if (!running || locked) return;
      locked = true;                                  // freeze until next trial
      // reveal both at full opacity for the feedback beat
      leftCard.classList.add("moredots-flash");
      rightCard.classList.add("moredots-flash");
      var correct = (side === moreSide);
      var moreCard = moreSide === 0 ? leftCard : rightCard;
      if (correct) {
        score++;
        ctx.submitScore(score);
        setStatus();
        moreCard.classList.add("moredots-good");
      } else {
        var picked = side === 0 ? leftCard : rightCard;
        picked.classList.add("moredots-bad");         // wrong pick flashes red
        moreCard.classList.add("moredots-good");      // and the bigger side is revealed
      }
      var myToken = token;
      later(function () {
        if (!running || myToken !== token) return;
        locked = false;
        makeTrial();
      }, FLASH_MS);
    }

    /* ---- keyboard: a single document listener, bound only while playing ---- */
    function onKey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return; // leave browser/OS chords alone
      var k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") { e.preventDefault(); respond(0); }
      else if (k === "ArrowRight" || k === "l" || k === "L") { e.preventDefault(); respond(1); }
    }
    function bindKeys() {
      if (onKeyRef) return;                           // never double-bind
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
      if (!running) return;
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
      // full reset, even on replay
      clearTimers();
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      token++;
      running = true;
      locked = false;
      score = 0;
      timeLeft = ROUND;
      leftCard.classList.remove("moredots-good", "moredots-bad", "moredots-flash");
      rightCard.classList.remove("moredots-good", "moredots-bad", "moredots-flash");
      setCards(true);
      bindKeys();
      setStatus();
      // paint a full bar instantly (no animated reset), then let ticks drain it
      barFill.style.transition = "none";
      setBar();
      void barFill.offsetWidth;
      barFill.style.transition = "";
      makeTrial();
      roundTimer = setInterval(tick, 1000);
    }

    function finish() {
      running = false;
      locked = false;
      token++;                                        // invalidate any in-flight timer
      clearTimers();
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      leftCard.classList.remove("moredots-flash");
      rightCard.classList.remove("moredots-flash");
      setCards(false);
      unbindKeys();                                   // critical: never leak the key listener

      var best = ctx.submitScore(score);
      setStatus();
      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + score + '</div>' +
          '<div class="g-sub">' + (best ? "new best! &middot; " : "") + 'correct calls in 60s</div>' +
          '<button class="g-btn">play again</button>' +
        '</div>',
        start
      );
    }

    /* ---- on-screen controls ---- */
    leftCard.addEventListener("click", function () { respond(0); });
    rightCard.addEventListener("click", function () { respond(1); });

    /* ---- initial idle screen ---- */
    // a calm sample behind the overlay so the cards aren't empty
    paintField(leftField, 18);
    paintField(rightField, 11);
    setCards(false);
    status.textContent = "60 seconds · tap the side with more dots";
    setBar();
    showOverlay('<button class="g-btn">start</button>', start);

    /* ---- teardown: clear EVERY timer + remove the document listener ---- */
    return function teardown() {
      running = false;
      locked = false;
      token++;                                        // any in-flight callback sees a stale token
      clearTimers();                                  // flash/advance + dim one-shots
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      unbindKeys();
    };
  }
});
