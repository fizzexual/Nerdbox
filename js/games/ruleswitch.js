/* Switch — task-switching / cognitive flexibility under speed.
   A 60-second round. Each trial shows a coloured SHAPE (one of
   red/blue/green × triangle/square/circle) and a RULE banner reading
   either "COLOUR?" or "SHAPE?". The rule is re-rolled every trial.
     - rule COLOUR? → click the button matching the shape's COLOUR
     - rule SHAPE?  → click the button matching the shape's SHAPE
   Two answer rows exist (a colour row + a shape row); only the row for the
   current rule is shown, so the buttons always carry the answers that count.
   Correct = +1 and the next trial instantly; wrong = brief red flash, next
   trial (no point). Score = correct responses in 60s (higher is better).

   Cleanup contract (re-checked at bottom): the only timers are roundTimer
   (1s countdown ticker) and flashTimer (clears the red flash). Both are
   cleared on finish() and teardown(). No document/window listeners are bound
   (all input is via on-element buttons whose nodes are dropped when root is
   emptied on unmount), so there is nothing to leak to the hub. A `running`
   gate plus a per-round token make any late callback a no-op. */
NERDBOX.injectStyle("ruleswitch", `
  .ruleswitch-wrap {
    position: relative; width: 100%; max-width: 560px; margin: 0 auto;
    display: flex; flex-direction: column; align-items: center; gap: 1.4rem;
  }
  .ruleswitch-bar {
    width: 100%; height: 6px; border-radius: 99px; overflow: hidden;
    background: var(--sub-alt);
  }
  .ruleswitch-bar > i {
    display: block; height: 100%; width: 100%;
    background: var(--accent); transform-origin: left center;
    transition: transform 1s linear, background 0.3s;
  }
  .ruleswitch-bar.ruleswitch-low > i { background: var(--error); }
  /* the RULE banner — the thing that flips trial to trial */
  .ruleswitch-rule {
    font-family: "JetBrains Mono", monospace; font-weight: 700;
    font-size: clamp(1.1rem, 4.6vw, 1.5rem); letter-spacing: 0.14em;
    color: var(--bg); background: var(--accent);
    padding: 0.45rem 1.3rem; border-radius: 99px;
    text-transform: uppercase; line-height: 1; min-height: 1em;
    transition: background 0.12s ease, color 0.12s ease;
  }
  .ruleswitch-rule.ruleswitch-shape { background: var(--text); }
  .ruleswitch-stage {
    width: 100%; min-height: 8.2rem;
    display: flex; align-items: center; justify-content: center;
    background: var(--bg-alt);
    border: 2px solid var(--sub-alt);
    border-radius: 18px; padding: 1.2rem 1rem;
    transition: border-color 0.12s ease, background 0.12s ease;
  }
  .ruleswitch-stage.ruleswitch-good { border-color: var(--go); }
  .ruleswitch-stage.ruleswitch-bad { border-color: var(--error); }
  .ruleswitch-shapeimg {
    width: clamp(58px, 20vw, 86px); height: clamp(58px, 20vw, 86px);
    display: block;
  }
  .ruleswitch-rows {
    display: flex; flex-direction: column; gap: 0.7rem; width: 100%;
  }
  .ruleswitch-row { display: none; gap: 0.7rem; width: 100%; justify-content: center; }
  .ruleswitch-row.ruleswitch-on { display: flex; }
  .ruleswitch-pad {
    flex: 1 1 0; max-width: 200px; min-width: 0;
    border: 2px solid var(--sub-alt); border-radius: 14px;
    background: var(--bg-alt); color: var(--text);
    padding: 0.85rem 0.4rem; cursor: pointer;
    font-family: "JetBrains Mono", monospace;
    font-size: clamp(0.92rem, 3.4vw, 1.1rem); font-weight: 500; line-height: 1;
    transition: filter 0.12s ease, transform 0.08s ease,
                border-color 0.12s ease, opacity 0.12s ease;
    touch-action: manipulation; -webkit-user-select: none; user-select: none;
    display: flex; align-items: center; justify-content: center; gap: 0.45rem;
  }
  .ruleswitch-pad:hover:not(:disabled) { filter: brightness(1.12); border-color: var(--sub); }
  .ruleswitch-pad:active:not(:disabled) { transform: translateY(1px); }
  .ruleswitch-pad:disabled { cursor: default; opacity: 0.5; }
  .ruleswitch-swatch {
    width: 0.95em; height: 0.95em; border-radius: 4px; flex: 0 0 auto;
  }
  .ruleswitch-mini { width: 1.05em; height: 1.05em; flex: 0 0 auto; }
  .ruleswitch-hint {
    font-family: "JetBrains Mono", monospace; color: var(--sub);
    font-size: 0.85rem; text-align: center; line-height: 1.5;
    min-height: 1.2em;
  }
  .ruleswitch-hint b { color: var(--text); font-weight: 700; }
`);

NERDBOX.register({
  id: "ruleswitch",
  name: "Switch",
  tagline: "the rule keeps changing",
  category: "attention",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;

    /* ---- config ---- */
    var ROUND = 60;          // seconds
    var FLASH_MS = 220;      // red/green flash duration after an answer

    // the three colours and three shapes the game draws from
    var COLOURS = [
      { id: "red",   label: "RED",   hex: "var(--error)" },
      { id: "blue",  label: "BLUE",  hex: "var(--go)" },
      { id: "green", label: "GREEN", hex: "var(--accent)" }
    ];
    var SHAPES = ["triangle", "square", "circle"];
    var SHAPE_LABEL = { triangle: "TRIANGLE", square: "SQUARE", circle: "CIRCLE" };

    function colourById(id) {
      for (var i = 0; i < COLOURS.length; i++) if (COLOURS[i].id === id) return COLOURS[i];
      return COLOURS[0];
    }

    // an SVG of one shape, filled with `fill`, at the given pixel className
    function shapeSvg(shape, fill, cls) {
      var body;
      if (shape === "triangle") body = '<polygon points="12 3 22 21 2 21"/>';
      else if (shape === "square") body = '<rect x="3" y="3" width="18" height="18" rx="2"/>';
      else body = '<circle cx="12" cy="12" r="9.5"/>';
      return '<svg class="' + cls + '" viewBox="0 0 24 24" fill="' + fill +
        '" stroke="none" aria-hidden="true">' + body + '</svg>';
    }

    /* ---- timers (the complete set) ---- */
    var roundTimer = null;   // countdown ticker
    var flashTimer = null;   // clears the answer flash

    /* ---- state ---- */
    var running = false;
    var score = 0;
    var timeLeft = ROUND;
    var token = 0;           // bumped on teardown to neutralise late callbacks
    // current trial: the rule plus the shown shape's two attributes
    var curRule = "colour";  // "colour" | "shape"
    var curColour = "red";   // the shape's colour id
    var curShape = "circle"; // the shape's shape id

    /* ---- layout ---- */
    var status = el("div", "g-status", "");
    var wrap = el("div", "ruleswitch-wrap");

    var bar = el("div", "ruleswitch-bar", "<i></i>");
    var barFill = bar.firstChild;

    var ruleBanner = el("div", "ruleswitch-rule", "COLOUR?");
    var stage = el("div", "ruleswitch-stage");

    // two answer rows: colour buttons and shape buttons. Only the row matching
    // the active rule is shown, so a click is always against the right answers.
    var rows = el("div", "ruleswitch-rows");
    var colourRow = el("div", "ruleswitch-row");
    var shapeRow = el("div", "ruleswitch-row");

    var colourBtns = {};   // id -> button
    var shapeBtns = {};    // id -> button

    COLOURS.forEach(function (c) {
      var b = el("button", "ruleswitch-pad",
        '<span class="ruleswitch-swatch" style="background:' + c.hex + '"></span>' + c.label);
      b.type = "button";
      b.setAttribute("aria-label", "answer " + c.label.toLowerCase());
      b.addEventListener("click", function () { respond("colour", c.id); });
      colourRow.appendChild(b);
      colourBtns[c.id] = b;
    });

    SHAPES.forEach(function (s) {
      var b = el("button", "ruleswitch-pad",
        shapeSvg(s, "currentColor", "ruleswitch-mini") + SHAPE_LABEL[s]);
      b.type = "button";
      b.setAttribute("aria-label", "answer " + s);
      b.addEventListener("click", function () { respond("shape", s); });
      shapeRow.appendChild(b);
      shapeBtns[s] = b;
    });

    rows.appendChild(colourRow);
    rows.appendChild(shapeRow);

    var hint = el("div", "ruleswitch-hint",
      'watch the <b>rule</b> — match the shape’s <b>colour</b> or <b>shape</b>');

    var overlay = el("div", "g-overlay");

    wrap.appendChild(bar);
    wrap.appendChild(ruleBanner);
    wrap.appendChild(stage);
    wrap.appendChild(rows);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    /* ---- helpers ---- */
    function setPads(on) {
      COLOURS.forEach(function (c) { colourBtns[c.id].disabled = !on; });
      SHAPES.forEach(function (s) { shapeBtns[s].disabled = !on; });
    }

    function setStatus() {
      status.innerHTML =
        '<span class="gl-score">score ' + score + '</span>' +
        '<span class="gl-time">' + timeLeft + 's</span>';
    }

    function setBar() {
      var frac = Math.max(0, timeLeft / ROUND);
      barFill.style.transform = "scaleX(" + frac + ")";
      if (timeLeft <= 10) bar.classList.add("ruleswitch-low");
      else bar.classList.remove("ruleswitch-low");
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

    // Paint a trial: random rule, random colour, random shape. Show only the
    // answer row for the active rule and flag the banner.
    function nextTrial() {
      curRule = rand(2) === 0 ? "colour" : "shape";
      curColour = COLOURS[rand(COLOURS.length)].id;
      curShape = SHAPES[rand(SHAPES.length)];

      stage.innerHTML = shapeSvg(curShape, colourById(curColour).hex, "ruleswitch-shapeimg");

      if (curRule === "colour") {
        ruleBanner.textContent = "COLOUR?";
        ruleBanner.classList.remove("ruleswitch-shape");
        colourRow.classList.add("ruleswitch-on");
        shapeRow.classList.remove("ruleswitch-on");
      } else {
        ruleBanner.textContent = "SHAPE?";
        ruleBanner.classList.add("ruleswitch-shape");
        shapeRow.classList.add("ruleswitch-on");
        colourRow.classList.remove("ruleswitch-on");
      }
    }

    function flash(klass) {
      // clear any pending reset so it can't undercut us
      if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
      stage.classList.remove("ruleswitch-good", "ruleswitch-bad");
      void stage.offsetWidth; // reflow so re-adding re-triggers the transition
      stage.classList.add(klass);
      flashTimer = setTimeout(function () {
        flashTimer = null;
        stage.classList.remove("ruleswitch-good", "ruleswitch-bad");
      }, FLASH_MS);
    }

    // A response. `kind` is which row was clicked ("colour"|"shape"); `value`
    // is the id chosen. It is correct only when the click came from the row of
    // the active rule AND the chosen id equals that rule's correct attribute.
    function respond(kind, value) {
      if (!running) return;
      if (kind !== curRule) return; // hidden-row click (defensive) — ignore
      var correct = (curRule === "colour") ? curColour : curShape;
      if (value === correct) {
        score++;
        ctx.submitScore(score);
        setStatus();
        flash("ruleswitch-good");
      } else {
        flash("ruleswitch-bad"); // no point
      }
      nextTrial(); // FAST: next trial appears instantly
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
      stage.classList.remove("ruleswitch-good", "ruleswitch-bad");
      running = true;
      score = 0;
      timeLeft = ROUND;
      setPads(true);
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
      stage.classList.remove("ruleswitch-good", "ruleswitch-bad");
      setPads(false);

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

    /* ---- initial idle screen ---- */
    // a calm sample behind the overlay so the stage isn't empty
    curRule = "colour"; curColour = "blue"; curShape = "triangle";
    ruleBanner.textContent = "COLOUR?";
    ruleBanner.classList.remove("ruleswitch-shape");
    stage.innerHTML = shapeSvg(curShape, colourById(curColour).hex, "ruleswitch-shapeimg");
    colourRow.classList.add("ruleswitch-on");
    setPads(false);
    status.textContent = "60 seconds · read the rule, then match";
    setBar();
    showOverlay('<button class="g-btn">start</button>', start);

    /* ---- teardown: clear EVERY timer (no global listeners were bound) ---- */
    return function teardown() {
      running = false;
      token++;            // any in-flight callback that checks token becomes inert
      if (roundTimer !== null) { clearInterval(roundTimer); roundTimer = null; }
      if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null; }
    };
  }
});
