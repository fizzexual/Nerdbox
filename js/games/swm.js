/* Spatial Working Memory — a Cambridge-style Self-Ordered Search.
   A level shows N closed boxes at fixed positions. Hidden behind them are N
   tokens, but only ONE is "current" at a time. You open boxes to find it; an
   opened box is either empty (it closes again) or holds the current token,
   which gets "banked". The rule that makes this a working-memory test: once a
   box has yielded a token you must NEVER open it again — returning to a banked
   box is a "between-search error" and ends the test. Find all N tokens with
   ZERO between-search errors to clear the level; cleared -> more boxes
   (4 -> 6 -> 8 -> 10 ...). The metric (max) is the highest box-count level
   cleared, submitted exactly once at the end. To remove luck the current token
   is always placed in a random STILL-UNFOUND box, so a methodical searcher
   never needs luck — and random mashing quickly re-hits a banked box and ends
   the run, so there is no way to spam to a high level. Self-contained: exactly
   one injectStyle + one register, ES5 vanilla; every timer is tracked and
   cleared on teardown, and all clicks are bound to box elements inside root so
   there are no document/window listeners to remove. */
NERDBOX.injectStyle("swm", `
  .swm-wrap {
    position: relative; width: 100%; max-width: 460px; margin: 0 auto;
    display: flex; flex-direction: column; align-items: center; gap: 1.1rem;
  }
  .swm-bar {
    display: flex; gap: 1.6rem; justify-content: center; flex-wrap: wrap;
    font-family: "JetBrains Mono", monospace; color: var(--sub);
    font-size: 0.95rem; min-height: 1.4em;
  }
  .swm-bar b { color: var(--text); font-weight: 600; }
  .swm-bar .swm-acc { color: var(--accent); font-weight: 600; }
  .swm-hint {
    font-family: "JetBrains Mono", monospace; font-size: 0.9rem;
    color: var(--sub); min-height: 1.2em; text-align: center;
  }
  .swm-hint.swm-warn { color: var(--error); }
  .swm-hint.swm-good { color: var(--go); }
  .swm-board {
    position: relative; width: 100%; aspect-ratio: 1 / 1;
    background: var(--bg-alt);
    border: 1px solid color-mix(in srgb, var(--text) 6%, transparent);
    border-radius: 18px; overflow: hidden;
  }
  .swm-board.swm-locked { pointer-events: none; }
  .swm-box {
    position: absolute; padding: 0; margin: 0; border: none;
    border-radius: 12px; background: var(--bg);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 14%, transparent);
    cursor: pointer; color: var(--sub);
    display: flex; align-items: center; justify-content: center;
    transition: background 0.14s ease, box-shadow 0.16s ease, transform 0.07s ease;
  }
  .swm-box:hover { transform: translateY(-2px); }
  .swm-box:active { transform: translateY(1px); }
  .swm-box .swm-lid {
    width: 46%; height: 46%; border-radius: 5px;
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--text) 22%, transparent);
    transition: opacity 0.14s ease;
  }
  .swm-box.swm-open {
    background: var(--bg-alt);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 22%, transparent);
  }
  .swm-box.swm-open .swm-lid { opacity: 0; }
  .swm-box.swm-empty {
    background: color-mix(in srgb, var(--sub-alt) 60%, var(--bg));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 18%, transparent);
  }
  .swm-box.swm-empty .swm-lid { opacity: 0; }
  .swm-token {
    width: 52%; height: 52%; border-radius: 50%;
    background: var(--accent); opacity: 0; transform: scale(0.4);
    box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 55%, transparent);
    transition: opacity 0.16s ease, transform 0.16s ease;
  }
  .swm-box.swm-banked {
    background: color-mix(in srgb, var(--go) 22%, var(--bg));
    box-shadow: inset 0 0 0 1px var(--go);
    cursor: default;
  }
  .swm-box.swm-banked .swm-lid { opacity: 0; }
  .swm-box.swm-banked .swm-token {
    opacity: 1; transform: scale(0.62);
    background: var(--go);
    box-shadow: 0 0 14px color-mix(in srgb, var(--go) 50%, transparent);
  }
  .swm-box.swm-hit .swm-token { opacity: 1; transform: scale(1); }
  .swm-box.swm-error {
    background: color-mix(in srgb, var(--error) 28%, var(--bg)) !important;
    box-shadow: inset 0 0 0 2px var(--error) !important;
  }
  .swm-tally {
    display: flex; gap: 0.5rem; justify-content: center; min-height: 14px;
  }
  .swm-pip {
    width: 12px; height: 12px; border-radius: 50%;
    background: color-mix(in srgb, var(--text) 14%, transparent);
    transition: background 0.16s ease, box-shadow 0.16s ease;
  }
  .swm-pip.swm-on {
    background: var(--go);
    box-shadow: 0 0 10px color-mix(in srgb, var(--go) 50%, transparent);
  }
`);

NERDBOX.register({
  id: "swm",
  name: "Spatial Working Memory",
  tagline: "find the tokens, never look twice",
  category: "memory",
  test: true,
  scoreMode: "max",
  formatScore: function (v) { return v + " boxes"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17" cy="17" r="2.5"/><path d="M19 19l2.2 2.2"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand, shuffle = ctx.util.shuffle;

    var START = 4;          // first level shows 4 boxes
    var STEP = 2;           // each cleared level adds 2 boxes (4 -> 6 -> 8 ...)
    var MAX_BOXES = 30;     // hard cap so the bounded layout loop always terminates

    var n = START;          // number of boxes / tokens this level
    var boxes = [];         // current box elements (one per position)
    var banked = [];        // per-box: true once that box has yielded a token
    var openIdx = -1;       // box currently shown empty within this search (-1 none)
    var found = 0;          // tokens banked this level
    var current = -1;       // index of the box holding the current token
    var cleared = 0;        // highest box-count level fully cleared (the metric)
    var phase = "idle";     // "idle" | "search" | "over"

    var timers = [];        // EVERY setTimeout id — all cleared on teardown

    // ---- DOM ----
    var bar = el("div", "swm-bar");
    var board = el("div", "swm-board");
    var tally = el("div", "swm-tally");
    var hint = el("div", "swm-hint", "");
    var overlay = el("div", "g-overlay");
    var wrap = el("div", "swm-wrap");
    wrap.appendChild(bar);
    wrap.appendChild(board);
    wrap.appendChild(tally);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    // ---- timer helpers (tracked so teardown can clear every one) ----
    function after(ms, fn) {
      var id = setTimeout(function () {
        var k = timers.indexOf(id);
        if (k >= 0) timers.splice(k, 1);
        fn();
      }, ms);
      timers.push(id);
      return id;
    }
    function clearTimers() {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers = [];
    }

    // ---- layout: pick a near-square grid that fits n boxes ----
    function gridFor(count) {
      var cols = Math.ceil(Math.sqrt(count));
      if (cols < 2) cols = 2;
      var rows = Math.ceil(count / cols);
      return { cols: cols, rows: rows };
    }

    function setBar() {
      var best = NERDBOX.getBest("swm");
      bar.innerHTML =
        '<span>boxes&nbsp;<b>' + n + '</b></span>' +
        '<span>found&nbsp;<span class="swm-acc">' + found + '</span>/<b>' + n + '</b></span>' +
        (best === null ? "" : '<span>best&nbsp;<b>' + best + '</b></span>');
    }

    function renderTally() {
      tally.innerHTML = "";
      for (var i = 0; i < n; i++) {
        tally.appendChild(el("span", "swm-pip" + (i < found ? " swm-on" : "")));
      }
    }

    // ---- build a fresh level of n closed boxes at fixed positions ----
    function buildLevel() {
      var g = gridFor(n);
      var cols = g.cols, rows = g.rows;
      // fractional cell size + gap, expressed in % of the board (CSS-var free).
      var pad = 4;                                  // outer padding, % of board
      var gap = 4;                                  // gap between cells, % of board
      var spanW = 100 - pad * 2;
      var spanH = 100 - pad * 2;
      var cellW = (spanW - gap * (cols - 1)) / cols;
      var cellH = (spanH - gap * (rows - 1)) / rows;

      // choose n distinct cells out of cols*rows, then place a box in each
      var slots = [];
      var total = cols * rows;
      for (var s = 0; s < total; s++) slots.push(s);
      slots = shuffle(slots).slice(0, n);

      board.innerHTML = "";
      boxes = [];
      banked = [];
      for (var i = 0; i < n; i++) {
        var slot = slots[i];
        var r = Math.floor(slot / cols);
        var c = slot % cols;
        var b = el("button", "swm-box", '<span class="swm-lid"></span><span class="swm-token"></span>');
        b.type = "button";
        b.setAttribute("aria-label", "box");
        b.style.left = (pad + c * (cellW + gap)) + "%";
        b.style.top = (pad + r * (cellH + gap)) + "%";
        b.style.width = cellW + "%";
        b.style.height = cellH + "%";
        b.dataset.i = i;
        b.addEventListener("click", onBox);   // bound to the element (no global listeners)
        board.appendChild(b);
        boxes.push(b);
        banked.push(false);
      }
    }

    // ---- place the current token in a random still-unfound box ----
    function placeToken() {
      var pool = [];
      for (var i = 0; i < n; i++) if (!banked[i]) pool.push(i);
      // pool is never empty here: we only place while found < n
      current = pool[rand(pool.length)];
      openIdx = -1;
    }

    function startLevel() {
      phase = "search";
      found = 0;
      buildLevel();
      placeToken();
      setBar();
      renderTally();
      hint.className = "swm-hint";
      hint.textContent = "open boxes to find a token — never reopen a found box";
      board.classList.remove("swm-locked");
    }

    // close the transiently-opened empty box (if any) before the next pick
    function closeOpen() {
      if (openIdx >= 0 && boxes[openIdx]) {
        boxes[openIdx].classList.remove("swm-open", "swm-empty");
      }
      openIdx = -1;
    }

    function onBox() {
      if (phase !== "search") return;
      var i = Number(this.dataset.i);
      if (i === openIdx) return;            // already showing this empty box

      if (banked[i]) {                      // revisiting a completed box = fatal error
        betweenSearchError(i);
        return;
      }

      if (i === current) {                  // found the current token
        closeOpen();
        banked[i] = true;
        found++;
        current = -1;
        var box = this;
        box.classList.remove("swm-open", "swm-empty");
        box.classList.add("swm-banked", "swm-hit");
        renderTally();
        setBar();
        hint.className = "swm-hint swm-good";
        hint.textContent = "token banked — don't reopen it";
        if (found >= n) {
          levelCleared();
        } else {
          // brief beat, then resume the search for the next token
          board.classList.add("swm-locked");
          after(420, function () {
            phase = "search";
            board.classList.remove("swm-locked");
            placeToken();
            hint.className = "swm-hint";
            hint.textContent = "find the next token";
          });
          phase = "wait";                   // ignore clicks during the beat
        }
      } else {                              // empty box: show it, then re-close
        closeOpen();
        openIdx = i;
        this.classList.add("swm-open", "swm-empty");
      }
    }

    function levelCleared() {
      phase = "wait";
      cleared = n;                          // highest box-count level cleared so far
      board.classList.add("swm-locked");
      hint.className = "swm-hint swm-good";
      hint.textContent = "level cleared — " + n + " boxes";
      after(820, function () {
        if (n + STEP > MAX_BOXES) { finish(); return; }
        n += STEP;
        startLevel();
      });
    }

    function betweenSearchError(i) {
      phase = "over";
      board.classList.add("swm-locked");
      var box = boxes[i];
      if (box) box.classList.add("swm-error");
      // reveal where the current token actually was, for clarity
      if (current >= 0 && boxes[current]) {
        boxes[current].classList.add("swm-open", "swm-hit");
      }
      hint.className = "swm-hint swm-warn";
      hint.textContent = "that box was already done — between-search error";
      after(900, finish);
    }

    // ---- end of the test: submit the metric once, show result + retake ----
    function finish() {
      phase = "over";
      board.classList.add("swm-locked");
      var isBest = ctx.submitScore(cleared);   // max -> highest box-count level cleared
      overlay.innerHTML =
        '<div class="g-result">' +
        '<div class="g-big">' + cleared + '</div>' +
        '<div class="g-sub">' + (isBest && cleared > 0 ? "new best &middot; " : "") + 'boxes cleared</div>' +
        '<div class="g-sub">' + (cleared > 0
          ? "highest level solved with no repeats"
          : "find every token without reopening a solved box") + '</div>' +
        '<button class="g-btn">retake</button>' +
        '</div>';
      overlay.querySelector("button").addEventListener("click", startTest);
      overlay.classList.add("show");
    }

    function startTest() {
      clearTimers();
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      n = START;
      cleared = 0;
      startLevel();
    }

    // ---- idle preview behind the start overlay ----
    function showStart() {
      n = START;
      found = 0;
      cleared = 0;
      buildLevel();
      board.classList.add("swm-locked");
      setBar();
      renderTally();
      hint.className = "swm-hint";
      hint.textContent = "one token hides at a time — search without repeats";
      overlay.innerHTML =
        '<div class="g-result">' +
        '<div class="g-sub">open boxes to find a hidden token. once a box gives a token, <b>never open it again</b>.</div>' +
        '<div class="g-sub">clear all ' + START + ' with no repeats &rarr; more boxes. one repeat ends the test.</div>' +
        '<button class="g-btn">start</button>' +
        '</div>';
      overlay.querySelector("button").addEventListener("click", startTest);
      overlay.classList.add("show");
    }

    showStart();

    // teardown: clear every tracked timer; all clicks are on box elements inside
    // root (no document/window listeners), so removing the subtree releases them.
    return function teardown() {
      phase = "over";
      clearTimers();
    };
  }
});
