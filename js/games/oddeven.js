/* Odd or Even — numerical snap-judgement speed. A fast 60-second round.
   One number flashes BIG; two buttons (ODD / EVEN). Tap the matching parity as
   fast as you can. Correct = +1 and the next number appears INSTANTLY; wrong =
   a brief red flash (the correct button lights green) and the next number, no
   point. Numbers vary 1–4 digits so you can't coast on a single glance.

   Cleanup contract (re-checked at the bottom): every timer id lives in the
   `timers` Set and is cleared on finish() AND teardown(). The only timers are
   the per-second countdown interval (tracked separately as `roundTimer`) and
   the short post-answer flash/advance timeout. The single document 'keydown'
   listener is removed on finish() (so it can't leak while the result screen
   sits open) AND on teardown() (mid-round unmount). A `running` gate plus a
   per-round `token` make any late callback a no-op. */
NERDBOX.injectStyle("oddeven", `
  .oddeven-wrap {
    position: relative; width: 100%; max-width: 520px; margin: 0 auto;
    display: flex; flex-direction: column; align-items: center; gap: 1.4rem;
  }
  .oddeven-bar {
    width: 100%; height: 6px; border-radius: 99px; overflow: hidden;
    background: var(--sub-alt);
  }
  .oddeven-bar > i {
    display: block; height: 100%; width: 100%;
    background: var(--accent); transform-origin: left center;
    transition: transform 1s linear, background 0.3s;
  }
  .oddeven-bar.oddeven-low > i { background: var(--error); }
  .oddeven-stage {
    width: 100%; min-height: clamp(7rem, 28vw, 10rem);
    display: flex; align-items: center; justify-content: center;
    border: 2px solid var(--sub-alt); border-radius: 18px;
    background: var(--bg-alt);
    transition: border-color 0.1s ease, background 0.1s ease;
  }
  .oddeven-stage.oddeven-good {
    border-color: var(--go);
    background: color-mix(in srgb, var(--go) 12%, var(--bg-alt));
  }
  .oddeven-stage.oddeven-bad {
    border-color: var(--error);
    background: color-mix(in srgb, var(--error) 12%, var(--bg-alt));
  }
  .oddeven-num {
    font-family: "JetBrains Mono", monospace; font-weight: 700;
    font-size: clamp(2.6rem, 16vw, 5.5rem); line-height: 1;
    letter-spacing: 0.04em; color: var(--text);
    -webkit-user-select: none; user-select: none;
  }
  .oddeven-stage.oddeven-good .oddeven-num { color: var(--go); }
  .oddeven-stage.oddeven-bad .oddeven-num { color: var(--error); }
  .oddeven-btns {
    display: flex; gap: clamp(0.6rem, 3vw, 1.1rem);
    width: 100%; justify-content: center; touch-action: manipulation;
  }
  .oddeven-btn {
    flex: 1 1 0; min-width: 0; max-width: 220px;
    display: flex; flex-direction: column; align-items: center; gap: 0.15rem;
    padding: 0.85rem 0.5rem;
    border: 2px solid var(--sub-alt); border-radius: 14px;
    background: var(--bg-alt); color: var(--text);
    font-family: "JetBrains Mono", monospace; font-weight: 700;
    font-size: clamp(1.05rem, 5vw, 1.45rem); line-height: 1;
    letter-spacing: 0.06em; cursor: pointer;
    -webkit-user-select: none; user-select: none;
    transition: border-color 0.1s ease, background 0.1s ease,
                transform 0.07s ease, color 0.1s ease;
  }
  .oddeven-btn small {
    font-weight: 500; font-size: 0.62em; letter-spacing: 0.12em;
    color: var(--sub);
  }
  .oddeven-btn:hover:not(:disabled) { filter: brightness(1.12); border-color: var(--sub); }
  .oddeven-btn:active:not(:disabled) { transform: translateY(2px) scale(0.99); }
  .oddeven-btn:disabled { cursor: default; }
  .oddeven-btn.oddeven-pick-good {
    border-color: var(--go); color: var(--go);
    background: color-mix(in srgb, var(--go) 14%, var(--bg-alt));
  }
  .oddeven-btn.oddeven-pick-good small { color: var(--go); }
  .oddeven-btn.oddeven-pick-bad {
    border-color: var(--error); color: var(--error);
    background: color-mix(in srgb, var(--error) 14%, var(--bg-alt));
  }
  .oddeven-btn.oddeven-pick-bad small { color: var(--error); }
  .oddeven-hint {
    font-family: "JetBrains Mono", monospace; color: var(--sub);
    font-size: 0.85rem; text-align: center; line-height: 1.5;
    min-height: 1.2em;
  }
  .oddeven-hint b { color: var(--text); font-weight: 700; }
`);

NERDBOX.register({
  id: "oddeven",
  name: "Odd or Even",
  tagline: "snap-judge the number",
  category: "reasoning",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17V7l4 5 4-5v10"/><line x1="17" y1="7" x2="17" y2="17"/><line x1="19" y1="12" x2="21" y2="12"/><line x1="13" y1="12" x2="15" y2="12"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;

    /* ---- config ---- */
    var ROUND = 60;        // seconds
    var FLASH_MS = 140;    // feedback shown before the next number (snappy)

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
    var roundTimer = null; // the per-second countdown interval (tracked separately)

    /* ---- listener bookkeeping ---- */
    var onKeyRef = null;   // bound document keydown handler (null = not bound)

    /* ---- state ---- */
    var running = false;
    var locked = false;    // true between an answer and the next number (ignore extra taps)
    var score = 0;
    var timeLeft = ROUND;
    var curOdd = false;    // is the currently shown number odd?
    var token = 0;         // bumped on finish/teardown to neutralise late callbacks

    /* ---- layout ---- */
    var status = el("div", "g-status", "");
    var wrap = el("div", "oddeven-wrap");

    var bar = el("div", "oddeven-bar", "<i></i>");
    var barFill = bar.firstChild;

    var stage = el("div", "oddeven-stage");
    var numEl = el("div", "oddeven-num", "");
    stage.appendChild(numEl);

    var btns = el("div", "oddeven-btns");
    // index 0 = ODD button, index 1 = EVEN button
    var oddBtn = el("button", "oddeven-btn", "ODD<small>&larr; left</small>");
    var evenBtn = el("button", "oddeven-btn", "EVEN<small>right &rarr;</small>");
    oddBtn.type = "button";
    evenBtn.type = "button";
    oddBtn.setAttribute("aria-label", "odd");
    evenBtn.setAttribute("aria-label", "even");
    btns.appendChild(oddBtn);
    btns.appendChild(evenBtn);

    var hint = el("div", "oddeven-hint",
      'odd or even? &middot; tap or use <b>&larr;</b> / <b>&rarr;</b>');

    var overlay = el("div", "g-overlay");

    wrap.appendChild(bar);
    wrap.appendChild(stage);
    wrap.appendChild(btns);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    /* ---- helpers ---- */
    function setBtns(on) {
      oddBtn.disabled = !on;
      evenBtn.disabled = !on;
    }

    function clearMarks() {
      stage.classList.remove("oddeven-good", "oddeven-bad");
      oddBtn.classList.remove("oddeven-pick-good", "oddeven-pick-bad");
      evenBtn.classList.remove("oddeven-pick-good", "oddeven-pick-bad");
    }

    function setStatus() {
      status.innerHTML =
        '<span class="gl-score">score ' + score + '</span>' +
        '<span class="gl-time">' + timeLeft + 's</span>';
    }

    function setBar() {
      var frac = Math.max(0, timeLeft / ROUND);
      barFill.style.transform = "scaleX(" + frac + ")";
      if (timeLeft <= 10) bar.classList.add("oddeven-low");
      else bar.classList.remove("oddeven-low");
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

    // A fresh number: mix of 1–4 digit values.
    function nextNumber() {
      var digits = 1 + rand(4);              // 1..4 digits
      var n;
      if (digits === 1) {
        n = rand(10);                        // 0..9
      } else {
        var lo = Math.pow(10, digits - 1);   // 10 / 100 / 1000
        n = lo + rand(lo * 9);               // keep the exact digit count
      }
      curOdd = (n % 2) === 1;
      clearMarks();
      numEl.textContent = String(n);
    }

    // A response. choseOdd: true if the player picked ODD.
    function respond(choseOdd) {
      if (!running || locked) return;
      locked = true;                         // freeze until the next number
      var correct = (choseOdd === curOdd);
      var picked = choseOdd ? oddBtn : evenBtn;
      var answerBtn = curOdd ? oddBtn : evenBtn;
      if (correct) {
        score++;
        ctx.submitScore(score);
        setStatus();
        stage.classList.add("oddeven-good");
        picked.classList.add("oddeven-pick-good");
      } else {
        stage.classList.add("oddeven-bad");
        picked.classList.add("oddeven-pick-bad");   // wrong pick flashes red
        answerBtn.classList.add("oddeven-pick-good"); // correct one revealed green
      }
      var myToken = token;
      later(function () {
        if (!running || myToken !== token) return;
        locked = false;
        nextNumber();
      }, FLASH_MS);
    }

    /* ---- keyboard: a single document listener, bound only while playing ---- */
    function onKey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return; // leave browser/OS chords alone
      var k = e.key;
      if (k === "ArrowLeft") { e.preventDefault(); respond(true); }   // odd
      else if (k === "ArrowRight") { e.preventDefault(); respond(false); } // even
    }
    function bindKeys() {
      if (onKeyRef) return;                  // never double-bind
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
      clearMarks();
      setBtns(true);
      bindKeys();
      setStatus();
      // paint a full bar instantly (no animated reset), then let ticks drain it
      barFill.style.transition = "none";
      setBar();
      void barFill.offsetWidth;
      barFill.style.transition = "";
      nextNumber();
      roundTimer = setInterval(tick, 1000);
    }

    function finish() {
      running = false;
      locked = false;
      token++;                               // invalidate any in-flight advance timer
      clearTimers();
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      setBtns(false);
      unbindKeys();                          // critical: never leak the key listener

      var best = ctx.submitScore(score);
      setStatus();
      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + score + '</div>' +
          '<div class="g-sub">' + (best ? "new best! &middot; " : "") + 'snap calls in 60s</div>' +
          '<button class="g-btn">play again</button>' +
        '</div>',
        start
      );
    }

    /* ---- on-screen controls ---- */
    oddBtn.addEventListener("click", function () { respond(true); });
    evenBtn.addEventListener("click", function () { respond(false); });

    /* ---- initial idle screen ---- */
    numEl.textContent = "42";                // a calm sample behind the overlay
    setBtns(false);
    status.textContent = "60 seconds · odd or even?";
    setBar();
    showOverlay('<button class="g-btn">start</button>', start);

    /* ---- teardown: clear EVERY timer + remove the document listener ---- */
    return function teardown() {
      running = false;
      locked = false;
      token++;                               // any in-flight callback sees a stale token
      clearTimers();                         // clears the flash/advance timeout
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      unbindKeys();
    };
  }
});
