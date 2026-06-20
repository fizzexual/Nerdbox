/* Same or Different — comparison / perceptual speed. A fast 60-second round.
   Two short monospace strings (5–7 chars of letters/digits) sit side by side.
   ~50% of pairs are IDENTICAL; ~50% differ by EXACTLY ONE character at a random
   position. Two buttons (SAME / DIFFERENT) — decide fast. Correct = +1 and the
   next pair appears INSTANTLY; wrong = a brief red flash and the next pair, no
   point. The single differing glyph is sometimes a near-look-alike (O/0, l/1,
   5/S, …) so you can't coast on a sloppy glance. Score = correct calls in 60s.

   --- generation correctness (re-checked at the bottom) ---
   makePair() builds string `a`, then with p≈0.5 sets `b = a` (same) or copies
   `a` and overwrites ONE random index with a character GUARANTEED different from
   the one already there (a do/while keeps drawing until it differs). So:
     * "same" pairs are character-for-character equal;
     * "different" pairs differ at exactly one index and nowhere else.
   `isSame` is the literal authored truth (a === b), so scoring can never drift
   from what's on screen.

   --- cleanup contract (re-checked at the bottom) ---
   Every flash/advance timeout id lives in the `timers` Set (cleared on finish()
   AND teardown()). The only interval is the per-second countdown `roundTimer`,
   tracked separately and cleared in both places too. The single document
   'keydown' listener is removed on finish() (so it can't leak while the result
   screen sits open) AND on teardown() (mid-round unmount). A `running` gate plus
   a per-round `token` make any late callback a no-op. */
NERDBOX.injectStyle("samediff", `
  .samediff-wrap {
    position: relative; width: 100%; max-width: 540px; margin: 0 auto;
    display: flex; flex-direction: column; align-items: center; gap: 1.4rem;
  }
  .samediff-bar {
    width: 100%; height: 6px; border-radius: 99px; overflow: hidden;
    background: var(--sub-alt);
  }
  .samediff-bar > i {
    display: block; height: 100%; width: 100%;
    background: var(--accent); transform-origin: left center;
    transition: transform 1s linear, background 0.3s;
  }
  .samediff-bar.samediff-low > i { background: var(--error); }
  .samediff-stage {
    width: 100%; min-height: clamp(6rem, 24vw, 8.5rem);
    display: flex; align-items: center; justify-content: center;
    gap: clamp(0.6rem, 4vw, 1.6rem);
    border: 2px solid var(--sub-alt); border-radius: 18px;
    background: var(--bg-alt); padding: 1.1rem 0.9rem;
    transition: border-color 0.1s ease, background 0.1s ease;
  }
  .samediff-stage.samediff-good {
    border-color: var(--go);
    background: color-mix(in srgb, var(--go) 12%, var(--bg-alt));
  }
  .samediff-stage.samediff-bad {
    border-color: var(--error);
    background: color-mix(in srgb, var(--error) 12%, var(--bg-alt));
  }
  .samediff-str {
    font-family: "JetBrains Mono", monospace; font-weight: 700;
    font-size: clamp(1.5rem, 8vw, 2.7rem); line-height: 1;
    letter-spacing: 0.18em; color: var(--text);
    white-space: pre; -webkit-user-select: none; user-select: none;
  }
  .samediff-vs {
    font-family: "JetBrains Mono", monospace; font-weight: 500;
    font-size: clamp(0.7rem, 3vw, 0.95rem); color: var(--sub);
    letter-spacing: 0.1em; -webkit-user-select: none; user-select: none;
  }
  .samediff-stage.samediff-good .samediff-str { color: var(--go); }
  .samediff-stage.samediff-bad .samediff-str { color: var(--error); }
  .samediff-btns {
    display: flex; gap: clamp(0.6rem, 3vw, 1.1rem);
    width: 100%; justify-content: center; touch-action: manipulation;
  }
  .samediff-btn {
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
  .samediff-btn small {
    font-weight: 500; font-size: 0.6em; letter-spacing: 0.12em;
    color: var(--sub);
  }
  .samediff-btn:hover:not(:disabled) { filter: brightness(1.12); border-color: var(--sub); }
  .samediff-btn:active:not(:disabled) { transform: translateY(2px) scale(0.99); }
  .samediff-btn:disabled { cursor: default; }
  .samediff-btn.samediff-pick-good {
    border-color: var(--go); color: var(--go);
    background: color-mix(in srgb, var(--go) 14%, var(--bg-alt));
  }
  .samediff-btn.samediff-pick-good small { color: var(--go); }
  .samediff-btn.samediff-pick-bad {
    border-color: var(--error); color: var(--error);
    background: color-mix(in srgb, var(--error) 14%, var(--bg-alt));
  }
  .samediff-btn.samediff-pick-bad small { color: var(--error); }
  .samediff-hint {
    font-family: "JetBrains Mono", monospace; color: var(--sub);
    font-size: 0.85rem; text-align: center; line-height: 1.5;
    min-height: 1.2em;
  }
  .samediff-hint b { color: var(--text); font-weight: 700; }
`);

NERDBOX.register({
  id: "samediff",
  name: "Same or Different",
  tagline: "identical, or not?",
  category: "perception",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/><line x1="10.5" y1="9" x2="13.5" y2="9"/><line x1="10.5" y1="15" x2="13.5" y2="15"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;

    /* ---- config ---- */
    var ROUND = 60;        // seconds
    var FLASH_MS = 130;    // feedback shown before the next pair (snappy)
    // Pool of glyphs the strings are drawn from (letters + digits, no spaces).
    var POOL = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abdefghijkmnpqrstuvwxyz";
    // Groups of confusable glyphs. When a pair "differs", we often swap the
    // character for a near-look-alike from its group to make the diff subtle.
    var CONFUSE = [
      "O0Qo", "Il1l", "5S", "2Z", "8B", "6G", "9g", "rn", "VУvy",
      "cС", "B8", "Zz", "Uu", "Aa", "Xx", "Kk"
    ];

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
    var locked = false;    // true between an answer and the next pair (ignore extra taps)
    var score = 0;
    var timeLeft = ROUND;
    var isSame = true;     // literal truth of the CURRENT pair (a === b)
    var token = 0;         // bumped on finish/teardown to neutralise late callbacks

    /* ---- layout ---- */
    var status = el("div", "g-status", "");
    var wrap = el("div", "samediff-wrap");

    var bar = el("div", "samediff-bar", "<i></i>");
    var barFill = bar.firstChild;

    var stage = el("div", "samediff-stage");
    var leftStr = el("span", "samediff-str", "");
    var vs = el("span", "samediff-vs", "vs");
    var rightStr = el("span", "samediff-str", "");
    stage.appendChild(leftStr);
    stage.appendChild(vs);
    stage.appendChild(rightStr);

    var btns = el("div", "samediff-btns");
    var sameBtn = el("button", "samediff-btn", "SAME<small>&larr; left</small>");
    var diffBtn = el("button", "samediff-btn", "DIFFERENT<small>right &rarr;</small>");
    sameBtn.type = "button";
    diffBtn.type = "button";
    sameBtn.setAttribute("aria-label", "the strings are the same");
    diffBtn.setAttribute("aria-label", "the strings are different");
    btns.appendChild(sameBtn);
    btns.appendChild(diffBtn);

    var hint = el("div", "samediff-hint",
      'same or different? &middot; tap or use <b>&larr;</b> / <b>&rarr;</b>');

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
      sameBtn.disabled = !on;
      diffBtn.disabled = !on;
    }

    function clearMarks() {
      stage.classList.remove("samediff-good", "samediff-bad");
      sameBtn.classList.remove("samediff-pick-good", "samediff-pick-bad");
      diffBtn.classList.remove("samediff-pick-good", "samediff-pick-bad");
    }

    function setStatus() {
      status.innerHTML =
        '<span class="gl-score">score ' + score + '</span>' +
        '<span class="gl-time">' + timeLeft + 's</span>';
    }

    function setBar() {
      var frac = Math.max(0, timeLeft / ROUND);
      barFill.style.transform = "scaleX(" + frac + ")";
      if (timeLeft <= 10) bar.classList.add("samediff-low");
      else bar.classList.remove("samediff-low");
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

    // A random base string of `len` chars drawn from POOL.
    function randStr(len) {
      var s = "";
      for (var i = 0; i < len; i++) s += POOL.charAt(rand(POOL.length));
      return s;
    }

    // Pick a replacement for `orig` that is GUARANTEED different from it.
    // ~60% of the time we draw a near-look-alike from the same confusable group
    // (subtle diff); otherwise we draw any other glyph from POOL.
    function diffChar(orig) {
      // try the confusable route first
      if (rand(10) < 6) {
        for (var g = 0; g < CONFUSE.length; g++) {
          if (CONFUSE[g].indexOf(orig) !== -1) {
            // build the list of group members that aren't `orig`
            var opts = "";
            for (var k = 0; k < CONFUSE[g].length; k++) {
              if (CONFUSE[g].charAt(k) !== orig) opts += CONFUSE[g].charAt(k);
            }
            if (opts.length) return opts.charAt(rand(opts.length));
            break; // group had no distinct member; fall through
          }
        }
      }
      // fallback: any POOL glyph that differs from orig (loop guarantees it)
      var c;
      do { c = POOL.charAt(rand(POOL.length)); } while (c === orig);
      return c;
    }

    // Build the next pair. Returns { a, b, same }.
    //   same  → b is character-for-character equal to a
    //   diff  → b equals a except at ONE random index, which is replaced by a
    //           character certain to differ there.
    function makePair() {
      var len = 5 + rand(3);          // 5, 6, or 7
      var a = randStr(len);
      var same = rand(2) === 0;       // ~50/50
      if (same) return { a: a, b: a, same: true };
      var i = rand(len);              // the single position that will differ
      var orig = a.charAt(i);
      var repl = diffChar(orig);      // guaranteed !== orig
      var b = a.slice(0, i) + repl + a.slice(i + 1);
      return { a: a, b: b, same: false };
    }

    function nextPair() {
      var p = makePair();
      isSame = p.same;                // authored truth, drives scoring
      clearMarks();
      leftStr.textContent = p.a;
      rightStr.textContent = p.b;
    }

    // A response. choseSame: true if the player pressed SAME.
    function respond(choseSame) {
      if (!running || locked) return;
      locked = true;                  // freeze until the next pair
      var correct = (choseSame === isSame);
      var picked = choseSame ? sameBtn : diffBtn;
      var answerBtn = isSame ? sameBtn : diffBtn;
      if (correct) {
        score++;
        ctx.submitScore(score);
        setStatus();
        stage.classList.add("samediff-good");
        picked.classList.add("samediff-pick-good");
      } else {
        stage.classList.add("samediff-bad");
        picked.classList.add("samediff-pick-bad");      // wrong pick flashes red
        answerBtn.classList.add("samediff-pick-good");  // correct one revealed green
      }
      var myToken = token;
      later(function () {
        if (!running || myToken !== token) return;
        locked = false;
        nextPair();
      }, FLASH_MS);
    }

    /* ---- keyboard: a single document listener, bound only while playing ---- */
    function onKey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return; // leave browser/OS chords alone
      var k = e.key;
      if (k === "ArrowLeft") { e.preventDefault(); respond(true); }        // same
      else if (k === "ArrowRight") { e.preventDefault(); respond(false); } // different
    }
    function bindKeys() {
      if (onKeyRef) return;           // never double-bind
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
      nextPair();
      roundTimer = setInterval(tick, 1000);
    }

    function finish() {
      running = false;
      locked = false;
      token++;                        // invalidate any in-flight advance timer
      clearTimers();
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      setBtns(false);
      unbindKeys();                   // critical: never leak the key listener

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
    sameBtn.addEventListener("click", function () { respond(true); });
    diffBtn.addEventListener("click", function () { respond(false); });

    /* ---- initial idle screen ---- */
    leftStr.textContent = "K7m4Q";     // a calm sample behind the overlay
    rightStr.textContent = "K7m4Q";
    setBtns(false);
    status.textContent = "60 seconds · same or different?";
    setBar();
    showOverlay('<button class="g-btn">start</button>', start);

    /* ---- teardown: clear EVERY timer + remove the document listener ---- */
    return function teardown() {
      running = false;
      locked = false;
      token++;                        // any in-flight callback sees a stale token
      clearTimers();                  // clears the flash/advance timeout
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      unbindKeys();
    };
  }
});
