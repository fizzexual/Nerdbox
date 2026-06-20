/* Bigger Number — numerical processing speed. A fast 60-second round.
   Two numbers are shown side by side as big clickable buttons; tap the LARGER
   one as fast as you can. Correct = +1 and the next pair appears INSTANTLY;
   wrong = a brief red flash (the right side lights up too) and the next pair,
   no point. Digit counts vary (2–5) and pairs are sometimes deliberately
   close (e.g. 4821 vs 4818) so you actually have to read them.

   Cleanup contract (re-checked at the bottom): every timer id lives in the
   `timers` Set and is cleared on finish() AND teardown(). The only timers are
   the per-second countdown tick and the short post-answer flash/advance timer.
   The single document 'keydown' listener is removed on finish() (so it can't
   leak while the result screen sits open) AND on teardown() (mid-round
   unmount). A `running` gate plus a per-round `token` make any late callback a
   no-op. */
NERDBOX.injectStyle("numcompare", `
  .numcompare-wrap {
    position: relative; width: 100%; max-width: 560px; margin: 0 auto;
    display: flex; flex-direction: column; align-items: center; gap: 1.4rem;
  }
  .numcompare-bar {
    width: 100%; height: 6px; border-radius: 99px; overflow: hidden;
    background: var(--sub-alt);
  }
  .numcompare-bar > i {
    display: block; height: 100%; width: 100%;
    background: var(--accent); transform-origin: left center;
    transition: transform 1s linear, background 0.3s;
  }
  .numcompare-bar.numcompare-low > i { background: var(--error); }
  .numcompare-cards {
    display: flex; gap: clamp(0.6rem, 3vw, 1.2rem);
    width: 100%; justify-content: center; touch-action: manipulation;
  }
  .numcompare-card {
    flex: 1 1 0; min-width: 0; max-width: 280px;
    display: flex; align-items: center; justify-content: center;
    min-height: clamp(7rem, 26vw, 9.5rem);
    border: 2px solid var(--sub-alt); border-radius: 18px;
    background: var(--bg-alt); color: var(--text);
    font-family: "JetBrains Mono", monospace; font-weight: 700;
    font-size: clamp(1.7rem, 9vw, 3.2rem); line-height: 1;
    letter-spacing: 0.02em; padding: 0.6rem 0.4rem; cursor: pointer;
    -webkit-user-select: none; user-select: none;
    transition: border-color 0.1s ease, background 0.1s ease,
                transform 0.07s ease, color 0.1s ease;
  }
  .numcompare-card:hover:not(:disabled) { filter: brightness(1.12); border-color: var(--sub); }
  .numcompare-card:active:not(:disabled) { transform: translateY(2px) scale(0.99); }
  .numcompare-card:disabled { cursor: default; }
  /* feedback: the picked-correct / the right answer go green, a wrong pick goes red */
  .numcompare-card.numcompare-good {
    border-color: var(--go); color: var(--go);
    background: color-mix(in srgb, var(--go) 14%, var(--bg-alt));
  }
  .numcompare-card.numcompare-bad {
    border-color: var(--error); color: var(--error);
    background: color-mix(in srgb, var(--error) 14%, var(--bg-alt));
  }
  .numcompare-vs {
    flex: 0 0 auto; align-self: center;
    font-family: "JetBrains Mono", monospace; color: var(--sub);
    font-size: 0.95rem; letter-spacing: 0.1em;
  }
  .numcompare-hint {
    font-family: "JetBrains Mono", monospace; color: var(--sub);
    font-size: 0.85rem; text-align: center; line-height: 1.5;
    min-height: 1.2em;
  }
  .numcompare-hint b { color: var(--text); font-weight: 700; }
`);

NERDBOX.register({
  id: "numcompare",
  name: "Bigger Number",
  tagline: "tap the bigger number, fast",
  category: "reasoning",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;

    /* ---- config ---- */
    var ROUND = 60;          // seconds
    var FLASH_MS = 150;      // how long the answer feedback shows before the next pair
    var CLOSE_CHANCE = 40;   // % of pairs that are deliberately "very close"

    /* ---- timers: every active id lives here; cleared on finish/teardown ---- */
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
    var roundTimer = null;   // the per-second countdown interval (tracked separately)

    /* ---- listener bookkeeping ---- */
    var onKeyRef = null;     // bound document keydown handler (null = not bound)

    /* ---- state ---- */
    var running = false;
    var locked = false;      // true between an answer and the next pair (ignore extra taps)
    var score = 0;
    var timeLeft = ROUND;
    var bigSide = 0;         // 0 = left holds the larger number, 1 = right
    var token = 0;           // bumped on finish/teardown to neutralise late callbacks

    /* ---- layout ---- */
    var status = el("div", "g-status", "");
    var wrap = el("div", "numcompare-wrap");

    var bar = el("div", "numcompare-bar", "<i></i>");
    var barFill = bar.firstChild;

    var cards = el("div", "numcompare-cards");
    var leftCard = el("button", "numcompare-card", "");
    var vs = el("div", "numcompare-vs", "vs");
    var rightCard = el("button", "numcompare-card", "");
    leftCard.type = "button";
    rightCard.type = "button";
    leftCard.setAttribute("aria-label", "left number");
    rightCard.setAttribute("aria-label", "right number");
    cards.appendChild(leftCard);
    cards.appendChild(vs);
    cards.appendChild(rightCard);

    var hint = el("div", "numcompare-hint",
      'tap the <b>bigger</b> number &middot; or use &larr; / &rarr;');

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
      if (timeLeft <= 10) bar.classList.add("numcompare-low");
      else bar.classList.remove("numcompare-low");
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

    // a positive integer with exactly `digits` digits (2..5)
    function numWithDigits(digits) {
      var lo = Math.pow(10, digits - 1);          // e.g. 1000 for 4 digits
      var span = lo * 9;                          // 1000..9999
      return lo + rand(span);
    }

    // Build the next pair: two DISTINCT numbers, place the larger on a random
    // side. Sometimes (CLOSE_CHANCE%) make them within a small delta so the
    // player has to actually read every digit.
    function makePair() {
      var digits = 2 + rand(4);                   // 2..5 digits
      var a = numWithDigits(digits);
      var b;
      var close = rand(100) < CLOSE_CHANCE && digits >= 3;
      if (close) {
        // nudge a by a tiny amount (1..9), keeping the same digit count
        var delta = 1 + rand(9);
        b = (rand(2) === 0) ? a + delta : a - delta;
        var lo = Math.pow(10, digits - 1);
        var hi = lo * 10 - 1;
        if (b < lo) b = a + delta;                // don't drop a digit
        if (b > hi) b = a - delta;
        if (b === a) b = a + 1;                   // never equal
      } else {
        b = numWithDigits(2 + rand(4));           // free digit count for variety
        var guard = 0;
        while (b === a && guard < 12) { b = numWithDigits(2 + rand(4)); guard++; }
        if (b === a) b = a + 1;                   // last-resort: never equal
      }

      var bigger = Math.max(a, b);
      var smaller = Math.min(a, b);
      bigSide = rand(2);                          // 0 = left bigger, 1 = right bigger
      var leftVal = bigSide === 0 ? bigger : smaller;
      var rightVal = bigSide === 0 ? smaller : bigger;

      leftCard.classList.remove("numcompare-good", "numcompare-bad");
      rightCard.classList.remove("numcompare-good", "numcompare-bad");
      leftCard.textContent = String(leftVal);
      rightCard.textContent = String(rightVal);
    }

    // A response to a chosen side. side: 0 = left, 1 = right.
    function respond(side) {
      if (!running || locked) return;
      locked = true;                              // freeze until the next pair
      var correct = (side === bigSide);
      var bigCard = bigSide === 0 ? leftCard : rightCard;
      if (correct) {
        score++;
        ctx.submitScore(score);
        setStatus();
        bigCard.classList.add("numcompare-good");
      } else {
        var picked = side === 0 ? leftCard : rightCard;
        picked.classList.add("numcompare-bad");   // wrong pick flashes red
        bigCard.classList.add("numcompare-good");  // and the right answer is revealed
      }
      // brief feedback, then the next pair appears (snappy)
      var myToken = token;
      later(function () {
        if (!running || myToken !== token) return;
        locked = false;
        makePair();
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
      if (onKeyRef) return;                       // never double-bind
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
      leftCard.classList.remove("numcompare-good", "numcompare-bad");
      rightCard.classList.remove("numcompare-good", "numcompare-bad");
      setCards(true);
      bindKeys();
      setStatus();
      // paint a full bar instantly (no animated reset), then let ticks drain it
      barFill.style.transition = "none";
      setBar();
      void barFill.offsetWidth;
      barFill.style.transition = "";
      makePair();
      roundTimer = setInterval(tick, 1000);
    }

    function finish() {
      running = false;
      locked = false;
      token++;                                    // invalidate any in-flight advance timer
      clearTimers();
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      setCards(false);
      unbindKeys();                               // critical: never leak the key listener

      var best = ctx.submitScore(score);
      setStatus();
      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + score + '</div>' +
          '<div class="g-sub">' + (best ? "new best! &middot; " : "") + 'bigger numbers in 60s</div>' +
          '<button class="g-btn">play again</button>' +
        '</div>',
        start
      );
    }

    /* ---- on-screen controls ---- */
    leftCard.addEventListener("click", function () { respond(0); });
    rightCard.addEventListener("click", function () { respond(1); });

    /* ---- initial idle screen ---- */
    // a calm sample pair behind the overlay so the cards aren't empty
    leftCard.textContent = "73";
    rightCard.textContent = "21";
    setCards(false);
    status.textContent = "60 seconds · tap the bigger number";
    setBar();
    showOverlay('<button class="g-btn">start</button>', start);

    /* ---- teardown: clear EVERY timer + remove the document listener ---- */
    return function teardown() {
      running = false;
      locked = false;
      token++;                                    // any in-flight callback sees a stale token
      clearTimers();                              // clears the flash/advance timer
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      unbindKeys();
    };
  }
});
