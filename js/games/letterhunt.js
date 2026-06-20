/* Letter Hunt — visual-search speed (selective attention). A 60-SECOND round.
   A TARGET letter is shown prominently ("find: Q") above a field of many random
   monospace letters that contains EXACTLY ONE target. Click the target → +1 and
   a fresh field appears (sometimes with a brand-new target letter). A wrong click
   (any non-target) → brief red flash, no point. The field grows as the score
   climbs, and at higher scores the distractors are drawn from CONFUSABLE sets
   (O/Q, I/L/1, C/G, etc.) so the target hides better. Score = targets found in
   60s (MAX, higher is better). formatScore -> "<n> pts".

   SINGLE-TARGET GUARANTEE (re-checked at bottom): a field is built by filling
   EVERY cell with a distractor that is explicitly NOT the target glyph, then
   overwriting ONE randomly chosen index with the target. Distractors come from a
   pool with the target removed, so no second copy can sneak in regardless of RNG.
   The target cell is a normal, enabled button → always clickable.

   CLEANUP CONTRACT (re-checked at bottom): the ONLY timers are roundTimer (the
   1s countdown interval) and flashTimer (clears the red wrong-flash). Both are
   cleared in start(), finish(), AND teardown(). A `running` gate plus a `token`
   bumped on teardown make any late callback inert. No document-level listeners
   are added, so nothing can leak to the hub. */
NERDBOX.injectStyle("letterhunt", `
  .letterhunt-wrap {
    position: relative; width: 100%; max-width: 600px; margin: 0 auto;
    display: flex; flex-direction: column; align-items: center; gap: 1.1rem;
  }
  .letterhunt-bar {
    width: 100%; height: 6px; border-radius: 99px; overflow: hidden;
    background: var(--sub-alt);
  }
  .letterhunt-bar > i {
    display: block; height: 100%; width: 100%;
    background: var(--accent); transform-origin: left center;
    transition: transform 1s linear, background 0.3s;
  }
  .letterhunt-bar.letterhunt-low > i { background: var(--error); }

  .letterhunt-prompt {
    font-family: "JetBrains Mono", monospace; color: var(--sub);
    font-size: 1.05rem; letter-spacing: 0.02em; min-height: 1.4em;
    display: flex; align-items: baseline; gap: 0.5rem;
  }
  .letterhunt-prompt b {
    color: var(--accent); font-weight: 700; font-size: 1.7rem; line-height: 1;
    display: inline-block; min-width: 1.1em; text-align: center;
  }

  .letterhunt-stage { position: relative; width: 100%; }
  .letterhunt-field {
    display: grid; gap: clamp(1px, 0.6vw, 5px); width: 100%;
    background: var(--bg-alt); border: 2px solid var(--sub-alt);
    border-radius: 16px; padding: clamp(6px, 1.6vw, 12px);
    transition: border-color 0.12s ease;
  }
  .letterhunt-field.letterhunt-bad { border-color: var(--error); }
  .letterhunt-cell {
    border: 0; padding: 0; margin: 0; background: transparent;
    color: var(--sub); cursor: pointer; user-select: none;
    -webkit-user-select: none; touch-action: manipulation;
    font-family: "JetBrains Mono", monospace; font-weight: 500; line-height: 1;
    aspect-ratio: 1 / 1; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.1s ease, color 0.1s ease, transform 0.04s ease;
  }
  .letterhunt-cell:hover { background: rgba(127, 127, 127, 0.14); color: var(--text); }
  .letterhunt-cell:active { transform: scale(0.88); }
  .letterhunt-field.letterhunt-locked .letterhunt-cell { pointer-events: none; }
  /* reveal on time-up: spotlight where the last target was */
  .letterhunt-cell.letterhunt-show {
    background: var(--go); color: var(--bg); animation: letterhunt-pulse 0.9s ease infinite;
  }
  @keyframes letterhunt-pulse {
    0%, 100% { background: var(--go); }
    50% { background: var(--bg-alt); }
  }

  .letterhunt-hint {
    font-family: "JetBrains Mono", monospace; color: var(--sub);
    font-size: 0.85rem; text-align: center; line-height: 1.5; min-height: 1.2em;
  }
  .letterhunt-hint b { color: var(--text); font-weight: 700; }
`);

NERDBOX.register({
  id: "letterhunt",
  name: "Letter Hunt",
  tagline: "spot the target letter, fast",
  category: "attention",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="7"/><line x1="21" y1="21" x2="15" y2="15"/><path d="M8 13l2.2-6 2.2 6M8.7 11h3"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand, shuffle = ctx.util.shuffle;

    /* ---- config ---- */
    var ROUND = 60;          // seconds
    var FLASH_MS = 240;      // red-flash duration on a wrong click
    var ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    // confusable clusters — when active, distractors are drawn ONLY from the
    // target's cluster (minus the target) so look-alikes camouflage it.
    var CONFUSE = [
      ["O", "Q", "0", "D", "C", "G"],
      ["I", "L", "1", "T", "J"],
      ["C", "G", "O", "Q"],
      ["M", "N", "W", "H"],
      ["E", "F", "B", "P", "R"],
      ["U", "V", "Y"],
      ["S", "5", "Z"]
    ];

    /* ---- field sizing: grows with score, capped so it stays clickable ---- */
    function colsFor(n) {
      if (n < 3)  return 6;
      if (n < 7)  return 8;
      if (n < 12) return 10;
      if (n < 18) return 12;
      return 14;
    }
    function rowsFor(cols) { return Math.max(4, Math.round(cols * 0.72)); }

    /* ---- timers (the COMPLETE set) ---- */
    var roundTimer = null;   // 1s countdown interval
    var flashTimer = null;   // clears the wrong-click flash

    /* ---- state ---- */
    var running = false;
    var score = 0;
    var timeLeft = ROUND;
    var target = "Q";        // current target glyph
    var targetCell = null;   // the one button holding the target (for reveal)
    var token = 0;           // bumped on teardown → late callbacks become inert

    /* ---- layout ---- */
    var status = el("div", "g-status", "");
    var wrap = el("div", "letterhunt-wrap");

    var bar = el("div", "letterhunt-bar", "<i></i>");
    var barFill = bar.firstChild;

    var prompt = el("div", "letterhunt-prompt", 'find: <b>Q</b>');
    var promptGlyph = prompt.querySelector("b");

    var stage = el("div", "letterhunt-stage");
    var field = el("div", "letterhunt-field");
    var overlay = el("div", "g-overlay");
    stage.appendChild(field);
    stage.appendChild(overlay);

    var hint = el("div", "letterhunt-hint",
      'click the <b>target</b> letter — a fresh field appears each time');

    wrap.appendChild(bar);
    wrap.appendChild(prompt);
    wrap.appendChild(stage);
    wrap.appendChild(hint);
    root.appendChild(status);
    root.appendChild(wrap);

    /* ---- helpers ---- */
    function setStatus() {
      status.innerHTML =
        '<span class="gl-score">score ' + score + '</span>' +
        '<span class="gl-time">' + timeLeft + 's</span>';
    }

    function setBar() {
      var frac = Math.max(0, timeLeft / ROUND);
      barFill.style.transform = "scaleX(" + frac + ")";
      if (timeLeft <= 10) bar.classList.add("letterhunt-low");
      else bar.classList.remove("letterhunt-low");
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

    // choose a fresh target glyph (avoid repeating the current one)
    function pickTarget() {
      var t;
      do { t = ALPHA[rand(ALPHA.length)]; } while (t === target);
      return t;
    }

    // Build the distractor pool for a field — guaranteed NOT to contain `target`.
    // At higher scores we draw from the target's confusable cluster (minus the
    // target) so look-alikes hide it; otherwise from the full alphabet minus it.
    function distractorPool(n) {
      var useConfuse = n >= 4 && rand(3) !== 0; // ~2/3 of the time once warmed up
      var pool = [];
      var i;
      if (useConfuse) {
        // gather every cluster that contains the target, flatten, drop the target
        for (i = 0; i < CONFUSE.length; i++) {
          if (CONFUSE[i].indexOf(target) !== -1) {
            pool = pool.concat(CONFUSE[i]);
          }
        }
        pool = pool.filter(function (c) { return c !== target; });
      }
      // fall back to / pad with the full alphabet (minus target) so we always
      // have enough variety even for big fields
      if (pool.length < 4) {
        for (i = 0; i < ALPHA.length; i++) {
          if (ALPHA[i] !== target) pool.push(ALPHA[i]);
        }
      }
      return pool;
    }

    // Render a fresh field with EXACTLY ONE target. Returns nothing; sets
    // targetCell to the single button that holds the target.
    function buildField() {
      var cols = colsFor(score);
      var rows = rowsFor(cols);
      var total = cols * rows;

      field.classList.remove("letterhunt-locked", "letterhunt-bad");
      field.style.gridTemplateColumns = "repeat(" + cols + ", 1fr)";
      // size the glyphs to the cell width (keeps them legible as the grid grows)
      field.style.fontSize = "clamp(0.7rem, " + (44 / cols).toFixed(2) + "vw, 1.5rem)";
      field.innerHTML = "";
      targetCell = null;

      var pool = distractorPool(score);
      var targetIdx = rand(total); // the ONE cell that will hold the target

      for (var i = 0; i < total; i++) {
        var isTarget = (i === targetIdx);
        var glyph = isTarget ? target : pool[rand(pool.length)];
        var btn = el("button", "letterhunt-cell", glyph);
        btn.type = "button";
        if (isTarget) {
          btn.setAttribute("aria-label", "target letter " + target);
          targetCell = btn;
        } else {
          btn.setAttribute("aria-hidden", "true");
          btn.tabIndex = -1;
        }
        // closure-safe per-cell handler
        (function (hit, b) {
          b.addEventListener("click", function () { onPick(hit, b); });
        })(isTarget, btn);
        field.appendChild(btn);
      }
    }

    function flashBad() {
      if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
      field.classList.remove("letterhunt-bad");
      void field.offsetWidth; // reflow so re-adding re-triggers the transition
      field.classList.add("letterhunt-bad");
      var my = token;
      flashTimer = setTimeout(function () {
        flashTimer = null;
        if (my !== token) return;          // torn down → ignore
        field.classList.remove("letterhunt-bad");
      }, FLASH_MS);
    }

    // A click landed on a cell. hit = was it the target?
    function onPick(hit, btn) {
      if (!running) return;
      if (hit) {
        score++;
        ctx.submitScore(score);
        setStatus();
        // sometimes swap to a brand-new target letter, then a fresh field
        if (rand(3) === 0) {
          target = pickTarget();
          promptGlyph.textContent = target;
        }
        buildField();                      // FAST: new field appears instantly
      } else {
        flashBad();                        // wrong letter → no point
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
      // hard reset every time (covers replay)
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
      field.classList.remove("letterhunt-bad");
      running = true;
      score = 0;
      timeLeft = ROUND;
      target = pickTarget();
      promptGlyph.textContent = target;
      setStatus();
      // paint a full bar instantly (no animated snap-back), then drain via ticks
      barFill.style.transition = "none";
      setBar();
      void barFill.offsetWidth;
      barFill.style.transition = "";
      buildField();
      roundTimer = setInterval(tick, 1000);
    }

    function finish() {
      running = false;
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
      field.classList.remove("letterhunt-bad");
      field.classList.add("letterhunt-locked");
      // reveal where the last target was so the player sees what to look for
      if (targetCell) targetCell.classList.add("letterhunt-show");

      var best = ctx.submitScore(score);
      setStatus();
      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + score + '</div>' +
          '<div class="g-sub">' + (best ? "new best! · " : "") +
            'targets found in 60s</div>' +
          '<button class="g-btn" type="button">play again</button>' +
        '</div>',
        start
      );
    }

    /* ---- initial idle screen ---- */
    // a calm sample field behind the overlay (locked, non-interactive)
    target = "Q";
    promptGlyph.textContent = target;
    buildField();
    field.classList.add("letterhunt-locked");
    status.textContent = "60 seconds · find the target letter";
    setBar();
    showOverlay('<button class="g-btn" type="button">start</button>', start);

    /* ---- teardown: clear EVERY timer; bump token so late callbacks are inert ---- */
    return function teardown() {
      running = false;
      token++;
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
    };
  }
});
