/* Sort It — rapid categorization (sustained attention + rule-switching).
   A 60-second round. A RULE is shown with a LEFT label and a RIGHT label
   (e.g. "odd ⬅ / even ➡", "number ⬅ / letter ➡", "red ⬅ / blue ➡"). One item
   appears in the centre at a time; send it to the correct side with the Left /
   Right ARROW KEYS or the on-screen ◀ ▶ buttons. Correct = +1 and the next item
   INSTANTLY; wrong = a brief red flash and the next item (no point). The rule
   switches once or twice mid-round (a banner flags the change) to keep it spicy.
   Score = correct sorts in 60s (higher is better).

   Each rule is a tiny self-contained set: a `make()` that returns one random
   item {label, side} where `side` is the correct destination ("left"|"right").
   The side is baked in at item-creation time, so respond() just compares the
   pressed direction to item.side — there is no per-rule branching at answer
   time and nothing to get out of sync.

   Cleanup contract (re-checked at the bottom): the only timers are roundTimer
   (1s countdown ticker), flashTimer (clears the answer flash), and bannerTimer
   (hides the rule-switch banner). All three are cleared on finish() AND
   teardown(). The single document 'keydown' listener is removed on finish() (so
   it can't leak while the result screen sits open) AND on teardown() (mid-round
   unmount). A `running` gate plus a per-round `token` make any late callback a
   no-op. */
NERDBOX.injectStyle("sortit", `
  .sortit-wrap {
    position: relative; width: 100%; max-width: 560px; margin: 0 auto;
    display: flex; flex-direction: column; align-items: center; gap: 1.2rem;
  }
  .sortit-bar {
    width: 100%; height: 6px; border-radius: 99px; overflow: hidden;
    background: var(--sub-alt);
  }
  .sortit-bar > i {
    display: block; height: 100%; width: 100%;
    background: var(--accent); transform-origin: left center;
    transition: transform 1s linear, background 0.3s;
  }
  .sortit-bar.sortit-low > i { background: var(--error); }
  /* the current rule, shown as  LEFT ⬅   /   ➡ RIGHT  */
  .sortit-rule {
    position: relative; width: 100%;
    display: flex; align-items: stretch; gap: clamp(0.4rem, 2.4vw, 0.9rem);
    font-family: "JetBrains Mono", monospace;
  }
  .sortit-rule-side {
    flex: 1 1 0; min-width: 0;
    display: flex; align-items: center; justify-content: center; gap: 0.4em;
    padding: 0.55rem 0.4rem; border-radius: 12px;
    border: 2px solid var(--sub-alt); background: var(--bg-alt);
    font-weight: 700; font-size: clamp(0.85rem, 4vw, 1.1rem);
    letter-spacing: 0.04em; color: var(--text);
    -webkit-user-select: none; user-select: none; text-align: center;
  }
  .sortit-rule-side .sortit-arrow { color: var(--accent); font-weight: 700; }
  .sortit-rule-sep {
    flex: 0 0 auto; align-self: center; color: var(--sub);
    font-size: 0.9rem; padding: 0 0.1rem;
  }
  /* a quick banner that flashes over the rule when it changes */
  .sortit-banner {
    position: absolute; inset: 0; display: flex;
    align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--accent) 90%, transparent);
    color: var(--bg); font-family: "JetBrains Mono", monospace;
    font-weight: 700; letter-spacing: 0.08em; border-radius: 12px;
    font-size: clamp(0.8rem, 4vw, 1.05rem);
    opacity: 0; pointer-events: none; transition: opacity 0.18s ease;
    -webkit-user-select: none; user-select: none; text-align: center;
    padding: 0 0.5rem;
  }
  .sortit-banner.sortit-show { opacity: 1; }
  .sortit-stage {
    width: 100%; min-height: clamp(7rem, 30vw, 10.5rem);
    display: flex; align-items: center; justify-content: center;
    border: 2px solid var(--sub-alt); border-radius: 18px;
    background: var(--bg-alt);
    transition: border-color 0.1s ease, background 0.1s ease;
  }
  .sortit-stage.sortit-good {
    border-color: var(--go);
    background: color-mix(in srgb, var(--go) 12%, var(--bg-alt));
  }
  .sortit-stage.sortit-bad {
    border-color: var(--error);
    background: color-mix(in srgb, var(--error) 12%, var(--bg-alt));
  }
  .sortit-item {
    font-family: "JetBrains Mono", monospace; font-weight: 700;
    font-size: clamp(2.4rem, 15vw, 5rem); line-height: 1;
    letter-spacing: 0.02em; color: var(--text); text-align: center;
    -webkit-user-select: none; user-select: none;
  }
  /* colour-word items render in their own hue so the swatch is unmistakable */
  .sortit-item.sortit-c-red { color: var(--error); }
  .sortit-item.sortit-c-blue { color: var(--accent); }
  .sortit-pads {
    display: flex; gap: 0.7rem; width: 100%; justify-content: center;
    touch-action: manipulation;
  }
  .sortit-pad {
    flex: 1 1 0; max-width: 220px; min-width: 0;
    display: flex; flex-direction: column; align-items: center; gap: 0.1rem;
    border: 2px solid var(--sub-alt); border-radius: 14px;
    background: var(--bg-alt); color: var(--text);
    padding: 0.75rem 0.4rem; cursor: pointer;
    font-family: "JetBrains Mono", monospace; font-weight: 700;
    font-size: clamp(1.5rem, 7vw, 2.1rem); line-height: 1;
    transition: filter 0.1s ease, transform 0.08s ease,
                border-color 0.1s ease, opacity 0.1s ease, color 0.1s ease,
                background 0.1s ease;
    -webkit-user-select: none; user-select: none;
  }
  .sortit-pad small {
    font-weight: 500; font-size: 0.34em; letter-spacing: 0.1em;
    color: var(--sub);
  }
  .sortit-pad:hover:not(:disabled) { filter: brightness(1.12); border-color: var(--sub); }
  .sortit-pad:active:not(:disabled) { transform: translateY(2px) scale(0.99); }
  .sortit-pad:disabled { cursor: default; opacity: 0.5; }
  .sortit-pad.sortit-pick-good {
    border-color: var(--go); color: var(--go);
    background: color-mix(in srgb, var(--go) 14%, var(--bg-alt));
  }
  .sortit-pad.sortit-pick-bad {
    border-color: var(--error); color: var(--error);
    background: color-mix(in srgb, var(--error) 14%, var(--bg-alt));
  }
  .sortit-hint {
    font-family: "JetBrains Mono", monospace; color: var(--sub);
    font-size: 0.85rem; text-align: center; line-height: 1.5;
    min-height: 1.2em;
  }
  .sortit-hint b { color: var(--text); font-weight: 700; }
`);

NERDBOX.register({
  id: "sortit",
  name: "Sort It",
  tagline: "left or right? sort fast",
  category: "attention",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 7 4 11 8 15"/><polyline points="16 7 20 11 16 15"/><line x1="4" y1="11" x2="9" y2="11"/><line x1="15" y1="11" x2="20" y2="11"/><line x1="12" y1="4" x2="12" y2="18"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;

    /* ---- config ---- */
    var ROUND = 60;        // seconds
    var FLASH_MS = 150;    // feedback shown before the next item (snappy)
    var BANNER_MS = 900;   // how long the "rule changed" banner stays up
    // segment boundaries (seconds REMAINING) at which the rule switches.
    // 60s split into three ~20s segments -> the rule changes twice.
    var SWITCH_AT = [40, 20];

    /* ---- rule definitions ----
       Each rule has labels for the two sides plus a make() that returns a fresh
       item {label, side, cls?}. `side` ("left"|"right") is the CORRECT
       destination, decided here so answering needs no rule-specific logic.
       Self-check of each make()'s side, item by item:
         odd/even   : odd number -> left, even -> right
         number/letter : digit char -> left, A–Z letter -> right
         red/blue   : the word "red" -> left, "blue" -> right (coloured swatch)
         vowel/consonant : AEIOU -> left, any other letter -> right
         small/big  : digit 1–4 -> left (small), 6–9 -> right (big)
    */
    function pick(arr) { return arr[rand(arr.length)]; }

    var RULES = [
      {
        key: "parity",
        left: "odd", right: "even",
        make: function () {
          var n = 1 + rand(99);                 // 1..99
          return { label: String(n), side: (n % 2 === 1) ? "left" : "right" };
        }
      },
      {
        key: "type",
        left: "number", right: "letter",
        make: function () {
          if (rand(2) === 0) {
            var d = rand(10);                    // a digit 0..9
            return { label: String(d), side: "left" };
          }
          var L = "ABCDEFGHJKLMNPRSTUVWXYZ";      // a letter (skip I/O lookalikes)
          return { label: pick(L.split("")), side: "right" };
        }
      },
      {
        key: "colour",
        left: "red", right: "blue",
        make: function () {
          if (rand(2) === 0) return { label: "red", side: "left", cls: "sortit-c-red" };
          return { label: "blue", side: "right", cls: "sortit-c-blue" };
        }
      },
      {
        key: "vowel",
        left: "vowel", right: "consonant",
        make: function () {
          var vowels = "AEIOU".split("");
          var cons = "BCDFGHJKLMNPRSTVWXYZ".split("");
          if (rand(2) === 0) return { label: pick(vowels), side: "left" };
          return { label: pick(cons), side: "right" };
        }
      },
      {
        key: "size",
        left: "small", right: "big",
        make: function () {
          // 1..4 are "small" (left); 6..9 are "big" (right). 5 is skipped so
          // there is always a clear winner.
          if (rand(2) === 0) return { label: String(1 + rand(4)), side: "left" };
          return { label: String(6 + rand(4)), side: "right" };
        }
      }
    ];

    /* ---- timers (the complete set) ---- */
    var roundTimer = null;   // 1s countdown ticker
    var flashTimer = null;   // clears the answer flash
    var bannerTimer = null;  // hides the rule-switch banner

    /* ---- listener bookkeeping ---- */
    var onKeyRef = null;     // the bound document keydown handler (null = not bound)

    /* ---- state ---- */
    var running = false;
    var locked = false;      // true between an answer and the next item
    var score = 0;
    var timeLeft = ROUND;
    var token = 0;           // bumped on finish/teardown to neutralise late callbacks
    var rule = RULES[0];     // current rule
    var item = null;         // current item {label, side, cls?}
    var ruleBag = [];        // shuffled queue of rules so switches feel varied
    var switchIdx = 0;       // how many scheduled switches have fired

    /* ---- layout ---- */
    var status = el("div", "g-status", "");
    var wrap = el("div", "sortit-wrap");

    var bar = el("div", "sortit-bar", "<i></i>");
    var barFill = bar.firstChild;

    var ruleRow = el("div", "sortit-rule");
    var ruleLeft = el("div", "sortit-rule-side");
    var ruleSep = el("div", "sortit-rule-sep", "sort");
    var ruleRight = el("div", "sortit-rule-side");
    var banner = el("div", "sortit-banner", "");
    ruleRow.appendChild(ruleLeft);
    ruleRow.appendChild(ruleSep);
    ruleRow.appendChild(ruleRight);
    ruleRow.appendChild(banner);

    var stage = el("div", "sortit-stage");
    var itemEl = el("div", "sortit-item", "");
    stage.appendChild(itemEl);

    var pads = el("div", "sortit-pads");
    var leftBtn = el("button", "sortit-pad", "◀<small>left</small>");   // ◀
    var rightBtn = el("button", "sortit-pad", "▶<small>right</small>"); // ▶
    leftBtn.type = "button";
    rightBtn.type = "button";
    leftBtn.setAttribute("aria-label", "send left");
    rightBtn.setAttribute("aria-label", "send right");
    pads.appendChild(leftBtn);
    pads.appendChild(rightBtn);

    var hint = el("div", "sortit-hint",
      'send each item to the matching side &middot; <b>&larr;</b>/<b>&rarr;</b> keys or the buttons');

    var overlay = el("div", "g-overlay");

    wrap.appendChild(bar);
    wrap.appendChild(ruleRow);
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

    function clearMarks() {
      stage.classList.remove("sortit-good", "sortit-bad");
      leftBtn.classList.remove("sortit-pick-good", "sortit-pick-bad");
      rightBtn.classList.remove("sortit-pick-good", "sortit-pick-bad");
    }

    function setStatus() {
      status.innerHTML =
        '<span class="gl-score">score ' + score + '</span>' +
        '<span class="gl-time">' + timeLeft + 's</span>';
    }

    function setBar() {
      var frac = Math.max(0, timeLeft / ROUND);
      barFill.style.transform = "scaleX(" + frac + ")";
      if (timeLeft <= 10) bar.classList.add("sortit-low");
      else bar.classList.remove("sortit-low");
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

    function paintRule() {
      ruleLeft.innerHTML =
        '<span class="sortit-label">' + rule.left + '</span>' +
        '<span class="sortit-arrow">&larr;</span>';
      ruleRight.innerHTML =
        '<span class="sortit-arrow">&rarr;</span>' +
        '<span class="sortit-label">' + rule.right + '</span>';
    }

    // Draw a fresh item from the current rule (mark state cleared).
    function nextItem() {
      item = rule.make();
      clearMarks();
      itemEl.className = "sortit-item" + (item.cls ? " " + item.cls : "");
      itemEl.textContent = item.label;
    }

    function flashBanner(text) {
      banner.textContent = text;
      banner.classList.add("sortit-show");
      if (bannerTimer !== null) { clearTimeout(bannerTimer); }
      var myToken = token;
      bannerTimer = setTimeout(function () {
        bannerTimer = null;
        if (myToken !== token) return;
        banner.classList.remove("sortit-show");
      }, BANNER_MS);
    }

    // Move to the next rule from the shuffled bag (never repeat the current one).
    function switchRule() {
      if (ruleBag.length === 0) {
        // rebuild a bag of the OTHER rules so we never draw the current one
        for (var i = 0; i < RULES.length; i++) {
          if (RULES[i] !== rule) ruleBag.push(RULES[i]);
        }
        // light shuffle
        for (var j = ruleBag.length - 1; j > 0; j--) {
          var k = rand(j + 1);
          var t = ruleBag[j]; ruleBag[j] = ruleBag[k]; ruleBag[k] = t;
        }
      }
      rule = ruleBag.shift();
      paintRule();
      flashBanner("new rule · " + rule.left + " ← / → " + rule.right);
      nextItem();
    }

    // A response. dir is "left" | "right".
    function respond(dir) {
      if (!running || locked || !item) return;
      locked = true;
      var correct = (dir === item.side);
      var pickedBtn = (dir === "left") ? leftBtn : rightBtn;
      var rightSideBtn = (item.side === "left") ? leftBtn : rightBtn;
      if (correct) {
        score++;
        ctx.submitScore(score);
        setStatus();
        stage.classList.add("sortit-good");
        pickedBtn.classList.add("sortit-pick-good");
      } else {
        stage.classList.add("sortit-bad");
        pickedBtn.classList.add("sortit-pick-bad");      // wrong choice flashes red
        rightSideBtn.classList.add("sortit-pick-good");  // correct side revealed green
      }
      var myToken = token;
      if (flashTimer !== null) { clearTimeout(flashTimer); }
      flashTimer = setTimeout(function () {
        flashTimer = null;
        if (!running || myToken !== token) return;
        locked = false;
        nextItem();
      }, FLASH_MS);
    }

    /* ---- keyboard: a single document listener, bound only while playing ---- */
    function onKey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return; // leave browser/OS chords alone
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
      if (!running) return;
      timeLeft--;
      if (timeLeft <= 0) {
        timeLeft = 0;
        setStatus();
        setBar();
        finish();
        return;
      }
      // scheduled rule switch when we cross a boundary
      if (switchIdx < SWITCH_AT.length && timeLeft === SWITCH_AT[switchIdx]) {
        switchIdx++;
        switchRule();
      }
      setStatus();
      setBar();
    }

    function start() {
      // full reset, even on replay
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
      if (bannerTimer !== null) { clearTimeout(bannerTimer); bannerTimer = null; }
      banner.classList.remove("sortit-show");
      token++;
      running = true;
      locked = false;
      score = 0;
      timeLeft = ROUND;
      switchIdx = 0;
      ruleBag = [];
      clearMarks();
      // start each round on a random rule for variety
      rule = RULES[rand(RULES.length)];
      paintRule();
      setPads(true);
      bindKeys();
      setStatus();
      // paint a full bar instantly (no animated reset), then let ticks drain it
      barFill.style.transition = "none";
      setBar();
      void barFill.offsetWidth;
      barFill.style.transition = "";
      nextItem();
      roundTimer = setInterval(tick, 1000);
    }

    function finish() {
      running = false;
      locked = false;
      token++;                  // invalidate any in-flight advance/banner timer
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
      if (bannerTimer !== null) { clearTimeout(bannerTimer); bannerTimer = null; }
      banner.classList.remove("sortit-show");
      setPads(false);
      unbindKeys();             // critical: never let the key listener leak to the hub

      var best = ctx.submitScore(score);
      setStatus();
      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + score + '</div>' +
          '<div class="g-sub">' + (best ? "new best! &middot; " : "") + 'sorted in 60s</div>' +
          '<button class="g-btn">play again</button>' +
        '</div>',
        start
      );
    }

    /* ---- on-screen controls ---- */
    leftBtn.addEventListener("click", function () { respond("left"); });
    rightBtn.addEventListener("click", function () { respond("right"); });

    /* ---- initial idle screen ---- */
    rule = RULES[0];
    paintRule();
    itemEl.textContent = "7";          // a calm sample behind the overlay
    setPads(false);
    status.textContent = "60 seconds · sort left or right";
    setBar();
    showOverlay('<button class="g-btn">start</button>', start);

    /* ---- teardown: clear EVERY timer + remove the document listener ---- */
    return function teardown() {
      running = false;
      locked = false;
      token++;                  // any in-flight callback that checks token becomes inert
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
      if (bannerTimer !== null) { clearTimeout(bannerTimer); bannerTimer = null; }
      unbindKeys();
    };
  }
});
