/* Corsi Span (BACKWARD) — the classic Corsi block-tapping test, reversed.
   Nine identical blocks sit in a fixed, irregular layout (so order can't be
   read off the geometry). Each trial a sequence of blocks flashes one at a
   time (~600ms lit, ~250ms gap); then you must click them in the REVERSE of
   the order shown. A single wrong click fails the trial at once (it shows the
   block you should have hit). Two trials per length, advance on the first
   pass; two failures at one length ends the test. The reported span is the
   longest length you reproduced backwards correctly. ctx.submitScore is called
   exactly once, at the end. Self-contained: one injectStyle + one register,
   every timer handle is tracked and cleared on teardown, and the only document
   listener is removed there too, so nothing fires or leaks after unmount. */
NERDBOX.injectStyle("corsispan", `
  .corsi-wrap {
    position: relative; width: 100%; max-width: 560px;
    display: flex; flex-direction: column; align-items: center; gap: 1.2rem;
  }
  .corsi-board {
    position: relative; width: 100%; aspect-ratio: 1 / 1;
    max-width: 460px; background: var(--bg-alt);
    border: 1px solid color-mix(in srgb, var(--text) 6%, transparent);
    border-radius: 18px; overflow: hidden;
  }
  /* lock a square even where aspect-ratio is unsupported */
  .corsi-board::before { content: ""; display: block; padding-top: 100%; }
  .corsi-block {
    position: absolute; width: 19%; height: 19%;
    transform: translate(-50%, -50%);
    background: var(--sub-alt); border: 0; border-radius: 12px;
    cursor: pointer; padding: 0; -webkit-tap-highlight-color: transparent;
    transition: background-color 0.12s, box-shadow 0.12s, transform 0.08s;
  }
  .corsi-block:focus { outline: none; }
  .corsi-block.corsi-armed { cursor: pointer; }
  .corsi-block.corsi-idle { cursor: default; }
  .corsi-block.corsi-lit {
    background: var(--accent);
    box-shadow: 0 0 0 2px var(--accent), 0 0 26px -4px var(--accent);
    transform: translate(-50%, -50%) scale(1.06);
  }
  .corsi-block.corsi-pick {
    background: color-mix(in srgb, var(--accent) 55%, var(--bg-alt));
    box-shadow: 0 0 0 2px var(--accent);
  }
  .corsi-block.corsi-good {
    background: var(--go);
    box-shadow: 0 0 0 2px var(--go), 0 0 22px -6px var(--go);
  }
  .corsi-block.corsi-bad {
    background: var(--error);
    box-shadow: 0 0 0 2px var(--error), 0 0 22px -6px var(--error);
  }
  .corsi-block.corsi-want {
    box-shadow: 0 0 0 2px var(--go), 0 0 22px -6px var(--go);
  }
  .corsi-hint {
    font-family: "JetBrains Mono", monospace; font-size: 0.92rem;
    color: var(--sub); min-height: 1.2em; text-align: center;
  }
  .corsi-hint.corsi-was { color: var(--error); }
  .corsi-hint.corsi-win { color: var(--go); }
  .corsi-hint b { color: var(--accent); font-weight: 500; }
  .corsi-pips { display: flex; gap: 0.45rem; min-height: 12px; }
  .corsi-pip {
    width: 11px; height: 11px; border-radius: 99px;
    background: var(--sub-alt); transition: background-color 0.12s;
  }
  .corsi-pip.corsi-pip-on { background: var(--accent); }
`);

NERDBOX.register({
  id: "corsispan",
  name: "Corsi Span",
  tagline: "reproduce the path — backwards",
  category: "memory",
  test: true,                 // marks this an assessment; difficulty intentionally unset
  scoreMode: "max",
  formatScore: function (v) { return "span " + v; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="15" y="4" width="6" height="6" rx="1.5"/><rect x="5" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="15" width="6" height="6" rx="1.5"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, shuffle = ctx.util.shuffle;

    // ---- protocol constants ----
    var BLOCKS = 9;
    var START_LEN = 2;          // reversing a single block would be trivial
    var TRIALS_PER_LEN = 2;     // up to two attempts at each length
    var LIT_MS = 600;           // each block stays lit this long
    var GAP_MS = 250;           // dark gap between flashes
    var LEAD_MS = 650;          // pause before a sequence begins
    var FEEDBACK_MS = 900;      // how long correct/incorrect feedback shows

    // Fixed, irregular block positions (percent of board). Deliberately NOT a
    // grid: no shared rows/columns, so the click order can't be inferred from
    // the layout. Same layout every time, which keeps the test comparable.
    var POS = [
      { x: 17, y: 21 }, { x: 46, y: 13 }, { x: 80, y: 25 },
      { x: 12, y: 52 }, { x: 55, y: 47 }, { x: 88, y: 58 },
      { x: 30, y: 78 }, { x: 63, y: 83 }, { x: 86, y: 88 }
    ];

    // ---- state ----
    var len = START_LEN;        // current sequence length
    var fails = 0;              // failed trials at the current length
    var bestLen = 0;            // longest length reproduced backwards (the span)
    var seq = [];               // block indices in the order shown
    var expect = [];            // what the player must click (seq reversed)
    var pos = 0;                // how many correct reverse-clicks so far this trial
    var phase = "idle";         // "idle" | "show" | "input" | "feedback" | "over"

    // ---- timer tracking (every handle lands here; teardown clears them all) ----
    var timers = [];
    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    function clearTimers() {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers = [];
    }

    // ---- DOM ----
    var status = el("div", "g-status", "");
    var wrap = el("div", "corsi-wrap");

    var pips = el("div", "corsi-pips");
    var pipEls = [];

    var board = el("div", "corsi-board");
    var blocks = [];
    for (var i = 0; i < BLOCKS; i++) {
      var b = el("button", "corsi-block corsi-idle");
      b.type = "button";
      b.dataset.i = i;
      b.style.left = POS[i].x + "%";
      b.style.top = POS[i].y + "%";
      b.setAttribute("aria-label", "block " + (i + 1));
      board.appendChild(b);
      blocks.push(b);
    }

    var hint = el("div", "corsi-hint", "watch the path, then click it in reverse");

    var overlay = el("div", "g-overlay");

    wrap.appendChild(pips);
    wrap.appendChild(board);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    // ---- helpers ----
    function setStatus() {
      var best = NERDBOX.getBest("corsispan");
      status.innerHTML =
        '<span class="gl-score">length ' + len + '</span>' +
        '<span class="gl-time">trial ' + (fails + 1) + '/' + TRIALS_PER_LEN + '</span>' +
        (best === null ? "" : '<span class="gl-time">best ' + best + '</span>');
    }

    function clearBlockState() {
      for (var i = 0; i < blocks.length; i++) {
        blocks[i].className = "corsi-block corsi-idle";
      }
    }

    function renderPips() {
      pips.innerHTML = "";
      pipEls = [];
      for (var i = 0; i < len; i++) {
        var p = el("div", "corsi-pip");
        pips.appendChild(p);
        pipEls.push(p);
      }
    }

    function setPipsOn(count) {
      for (var i = 0; i < pipEls.length; i++) {
        if (i < count) pipEls[i].classList.add("corsi-pip-on");
        else pipEls[i].classList.remove("corsi-pip-on");
      }
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

    // ---- a trial: flash the sequence, then collect the reversed clicks ----
    function startTrial() {
      phase = "show";
      pos = 0;
      clearBlockState();
      setStatus();
      renderPips();
      setPipsOn(0);
      hint.className = "corsi-hint";
      hint.textContent = "watch — " + len + " block" + (len === 1 ? "" : "s");

      // Distinct blocks per trial (standard Corsi: no repeat within a sequence).
      var order = shuffle(rangeArray(BLOCKS));
      seq = order.slice(0, len);
      expect = seq.slice().reverse();

      // Schedule the flashes. Each flash is one bounded loop iteration over the
      // sequence; nothing recurses unboundedly.
      var startAt = LEAD_MS;
      for (var k = 0; k < seq.length; k++) {
        scheduleFlash(seq[k], startAt);
        startAt += LIT_MS + GAP_MS;
      }
      // When the last flash finishes, open the input phase.
      later(openInput, startAt - GAP_MS + 120);
    }

    function scheduleFlash(blockIdx, atMs) {
      later(function () {
        if (phase !== "show") return;
        blocks[blockIdx].classList.add("corsi-lit");
      }, atMs);
      later(function () {
        if (phase !== "show") return;
        blocks[blockIdx].classList.remove("corsi-lit");
      }, atMs + LIT_MS);
    }

    function openInput() {
      if (phase !== "show") return;
      phase = "input";
      pos = 0;
      clearBlockState();
      for (var i = 0; i < blocks.length; i++) {
        blocks[i].classList.remove("corsi-idle");
        blocks[i].classList.add("corsi-armed");
      }
      hint.className = "corsi-hint";
      hint.innerHTML = "now click the " + len + " blocks <b>in reverse</b>";
      setPipsOn(0);
    }

    // Single delegated handler; ignores everything outside the input phase, so
    // clicks during the flash (or feedback) do nothing. Mashing can't help:
    // one wrong block ends the trial immediately, and the block space is large.
    function onBoardClick(ev) {
      if (phase !== "input") return;
      var node = ev.target;
      // walk up to the button in case the event lands on a child
      var guard = 0;
      while (node && node !== board && guard < 6) {
        if (node.classList && node.classList.contains("corsi-block")) break;
        node = node.parentNode; guard++;
      }
      if (!node || node === board || !node.classList ||
          !node.classList.contains("corsi-block")) return;

      var idx = Number(node.dataset.i);
      if (idx === expect[pos]) {
        node.classList.remove("corsi-armed");
        node.classList.add("corsi-pick");
        pos++;
        setPipsOn(pos);
        if (pos >= expect.length) trialPassed();
      } else {
        trialFailed(node, expect[pos]);
      }
    }

    function lockBlocks() {
      for (var i = 0; i < blocks.length; i++) {
        blocks[i].classList.remove("corsi-armed");
        blocks[i].classList.add("corsi-idle");
      }
    }

    function trialPassed() {
      phase = "feedback";
      lockBlocks();
      if (len > bestLen) bestLen = len;
      for (var i = 0; i < expect.length; i++) {
        blocks[expect[i]].classList.remove("corsi-pick");
        blocks[expect[i]].classList.add("corsi-good");
      }
      hint.className = "corsi-hint corsi-win";
      hint.textContent = "correct — length " + len + " ✓";
      // advance to the next (longer) length; fresh pair of trials
      len++;
      fails = 0;
      later(nextTrial, FEEDBACK_MS);
    }

    function trialFailed(wrongNode, wantedIdx) {
      phase = "feedback";
      lockBlocks();
      wrongNode.classList.remove("corsi-pick");
      wrongNode.classList.add("corsi-bad");
      // show the block that should have been clicked at this step
      if (typeof wantedIdx === "number" && blocks[wantedIdx] && wantedIdx !== Number(wrongNode.dataset.i)) {
        blocks[wantedIdx].classList.add("corsi-want");
      }
      hint.className = "corsi-hint corsi-was";
      hint.innerHTML = "wrong block — the <b>outlined</b> one was next";
      fails++;
      if (fails >= TRIALS_PER_LEN) {
        later(finish, FEEDBACK_MS);
      } else {
        later(nextTrial, FEEDBACK_MS);   // one attempt left at this length
      }
    }

    function nextTrial() {
      if (phase === "over") return;
      startTrial();
    }

    // ---- end of test: report the span exactly once, offer a retake ----
    function finish() {
      phase = "over";
      clearTimers();
      clearBlockState();
      ctx.submitScore(bestLen);              // the ONE score: the backward span
      var best = NERDBOX.getBest("corsispan");
      var isBest = best !== null && best === bestLen && bestLen > 0;
      status.innerHTML = '<span class="gl-score">done</span>' +
        (best === null ? "" : '<span class="gl-time">best ' + best + '</span>');
      hint.className = "corsi-hint";
      hint.textContent = "";
      showOverlay(
        '<div class="g-result">' +
        '<div class="g-big">' + bestLen + '</div>' +
        '<div class="g-sub">' + (isBest ? "new best · " : "") + 'backward Corsi span</div>' +
        '<div class="g-sub">longest path reproduced in reverse</div>' +
        '<button class="g-btn">retake</button>' +
        '</div>',
        startTest
      );
    }

    function startTest() {
      clearTimers();
      overlay.classList.remove("show");
      clearBlockState();
      len = START_LEN;
      fails = 0;
      bestLen = 0;
      pos = 0;
      seq = [];
      expect = [];
      phase = "idle";
      setStatus();
      later(startTrial, LEAD_MS);
    }

    // small utility: [0, 1, ..., n-1] without relying on Array.from
    function rangeArray(n) {
      var out = [];
      for (var i = 0; i < n; i++) out.push(i);
      return out;
    }

    // ---- wiring ----
    board.addEventListener("click", onBoardClick);

    // ---- intro screen ----
    status.textContent = "watch the path, then click it backwards";
    showOverlay(
      '<div class="g-result">' +
      '<div class="g-sub">blocks flash one by one — click them <b>in reverse order</b></div>' +
      '<div class="g-sub">starts at length 2; one wrong click ends the trial</div>' +
      '<button class="g-btn">start</button>' +
      '</div>',
      startTest
    );

    // ---- teardown: stop everything and detach the one document/board listener,
    // so no timer fires and no listener leaks after the game is unmounted ----
    return function teardown() {
      phase = "over";
      clearTimers();
      board.removeEventListener("click", onBoardClick);
    };
  }
});
