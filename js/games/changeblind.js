/* Spot the Change — change-blindness flicker. Two grids, A and B, identical
   except ONE cell differs. The classic flicker masks the change:
       A (600ms) -> BLANK (200ms) -> B (600ms) -> BLANK (200ms) -> repeat
   Click the cell you think changes. Right -> streak++ + bigger grid; wrong ->
   game over, the changed cell is revealed. Score is the best streak reached.

   Timer safety: the flicker is a single recursive setTimeout chain — only ever
   ONE pending id (flickerTimer) at a time — plus a generation token. teardown
   clears that id AND bumps the token, so any callback still in flight becomes a
   no-op. There are no setIntervals and no other timers to leak. */
NERDBOX.injectStyle("changeblind", `
.changeblind-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.3rem;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  position: relative;
}
.changeblind-grid {
  display: grid;
  gap: 8px;
  width: 100%;
  max-width: 380px;
  aspect-ratio: 1 / 1;
}
.changeblind-cell {
  position: relative;
  border: none;
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  border-radius: 9px;
  background: var(--bg-alt);
  cursor: pointer;
  transition: background 0.12s ease, transform 0.07s ease, box-shadow 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}
.changeblind-cell:hover { transform: translateY(-1px); }
.changeblind-cell:active { transform: translateY(1px); }
/* during BLANK every cell drops to the neutral colour (the mask) */
.changeblind-grid.blank .changeblind-cell { background: var(--bg-alt) !important; }
.changeblind-grid.locked .changeblind-cell { cursor: default; pointer-events: none; }
/* reveal flash on the cell that was actually changing */
.changeblind-cell.reveal {
  animation: changeblind-flash 0.5s steps(1, end) 0s 6;
  box-shadow: 0 0 0 3px var(--error), 0 0 16px color-mix(in srgb, var(--error) 60%, transparent);
  z-index: 2;
}
@keyframes changeblind-flash {
  0%   { box-shadow: 0 0 0 3px var(--error), 0 0 16px color-mix(in srgb, var(--error) 60%, transparent); }
  50%  { box-shadow: 0 0 0 3px transparent; }
  100% { box-shadow: 0 0 0 3px var(--error), 0 0 16px color-mix(in srgb, var(--error) 60%, transparent); }
}
.changeblind-bar {
  display: flex;
  gap: 1.5rem;
  justify-content: center;
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.95rem;
}
.changeblind-bar b { color: var(--text); font-weight: 500; }
.changeblind-hint {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.82rem;
  text-align: center;
  line-height: 1.5;
  min-height: 1.1em;
}
.changeblind-hint .changeblind-go { color: var(--go); font-weight: 700; }
.changeblind-hint .changeblind-bad { color: var(--error); font-weight: 700; }
`);

NERDBOX.register({
  id: "changeblind",
  name: "Spot the Change",
  tagline: "what changed between the flashes?",
  category: "attention",
  scoreMode: "max",
  formatScore: function (v) { return v + " streak"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/><path d="M12 5V3M12 21v-2"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;

    /* ---- config ---- */
    var SHOW_MS = 600;     // each version (A or B) is visible this long
    var BLANK_MS = 200;    // the masking blank between versions
    var START_SIZE = 3;    // first round is 3x3
    var MAX_SIZE = 8;      // cap so cells stay clickable

    // distinct cell palette — readable against bg-alt, clearly different hues
    var PALETTE = [
      "#e74c3c", "#3498db", "#2ecc71", "#f1c40f",
      "#9b59b6", "#e67e22", "#1abc9c", "#ff6ec7"
    ];

    /* ---- the ONE flicker timer + a generation token ---- */
    var flickerTimer = null;   // only ever one pending id at a time
    var token = 0;             // bumped on every (re)start and on teardown

    /* ---- state ---- */
    var running = false;
    var streak = 0;
    var size = START_SIZE;
    var colorsA = [];          // version A colours, length size*size
    var colorsB = [];          // version B colours — identical to A except one cell
    var changedIndex = -1;     // the single differing cell
    var btns = [];             // cell <button>s for the current grid
    var phase = 0;             // 0=A, 1=blank-after-A, 2=B, 3=blank-after-B

    /* ---- layout ---- */
    var wrap = el("div", "changeblind-wrap");
    var bar = el("div", "changeblind-bar");
    var grid = el("div", "changeblind-grid");
    var hint = el("div", "changeblind-hint", "");
    var overlay = el("div", "g-overlay");

    wrap.appendChild(bar);
    wrap.appendChild(grid);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    function clearFlicker() {
      if (flickerTimer !== null) { clearTimeout(flickerTimer); flickerTimer = null; }
    }

    function renderBar() {
      bar.innerHTML =
        "<span>streak&nbsp;<b>" + streak + "</b></span>" +
        "<span>grid&nbsp;<b>" + size + "×" + size + "</b></span>";
    }

    // Build versions A and B for a fresh round: pick a random colour per cell,
    // copy to B, then change exactly ONE cell in B to a *different* palette hue.
    function buildRound() {
      var n = size * size;
      colorsA = [];
      colorsB = [];
      for (var i = 0; i < n; i++) {
        var c = PALETTE[ctx.util.rand(PALETTE.length)];
        colorsA.push(c);
        colorsB.push(c);
      }
      changedIndex = ctx.util.rand(n);
      var oldColor = colorsA[changedIndex];
      // choose a replacement guaranteed different from the original cell colour
      var alt = oldColor;
      while (alt === oldColor) {
        alt = PALETTE[ctx.util.rand(PALETTE.length)];
      }
      colorsB[changedIndex] = alt;
    }

    // Build the clickable grid of buttons once per round. The grid stays in
    // place across the whole flicker so the player can click at any moment.
    function buildGrid() {
      grid.innerHTML = "";
      btns = [];
      grid.style.gridTemplateColumns = "repeat(" + size + ", 1fr)";
      var n = size * size;
      for (var i = 0; i < n; i++) {
        var b = el("button", "changeblind-cell");
        b.dataset.i = i;
        b.setAttribute("aria-label", "cell");
        b.addEventListener("click", onCell);
        grid.appendChild(b);
        btns.push(b);
      }
    }

    // Paint the grid for a given version's colour array.
    function paint(colors) {
      grid.classList.remove("blank");
      for (var i = 0; i < btns.length; i++) {
        btns[i].style.background = colors[i];
      }
    }

    // Drop to the neutral blank mask (colours hidden, grid still clickable).
    function paintBlank() {
      grid.classList.add("blank");
    }

    // The recursive flicker step. ONE setTimeout schedules the next phase, so at
    // most one timer id is ever live. Every callback re-checks the token, so a
    // stale tick (after teardown or restart) is a harmless no-op.
    function tick(myToken) {
      if (!running || myToken !== token) return;
      if (phase === 0) {           // show A
        paint(colorsA);
        flickerTimer = setTimeout(function () { phase = 1; tick(myToken); }, SHOW_MS);
      } else if (phase === 1) {    // blank
        paintBlank();
        flickerTimer = setTimeout(function () { phase = 2; tick(myToken); }, BLANK_MS);
      } else if (phase === 2) {    // show B
        paint(colorsB);
        flickerTimer = setTimeout(function () { phase = 3; tick(myToken); }, SHOW_MS);
      } else {                     // blank, then loop back to A
        paintBlank();
        flickerTimer = setTimeout(function () { phase = 0; tick(myToken); }, BLANK_MS);
      }
    }

    function startRound() {
      clearFlicker();
      buildRound();
      buildGrid();
      grid.classList.remove("locked");
      renderBar();
      hint.innerHTML = "one cell keeps changing — click it";
      phase = 0;
      tick(token);
    }

    function onCell() {
      if (!running) return;
      var i = Number(this.dataset.i);
      if (i === changedIndex) {
        // correct: lock streak in, then advance with a bigger (harder) grid
        streak++;
        ctx.submitScore(streak);
        clearFlicker();
        grid.classList.add("locked");
        hint.innerHTML = '<span class="changeblind-go">correct!</span> next grid…';
        renderBar();
        var myToken = ++token; // invalidate the just-finished flicker chain
        flickerTimer = setTimeout(function () {
          flickerTimer = null;
          if (!running || myToken !== token) return;
          if (size < MAX_SIZE) size++;
          startRound();
        }, 650);
      } else {
        gameOver(i);
      }
    }

    function gameOver(clickedIndex) {
      running = false;
      clearFlicker();
      token++;                       // kill any in-flight flicker callback
      grid.classList.add("locked");

      // freeze on version B so the colours are visible, then flash the real one
      paint(colorsB);
      if (changedIndex >= 0 && btns[changedIndex]) {
        btns[changedIndex].classList.add("reveal");
      }

      var reached = streak;
      var best = ctx.submitScore(reached);
      hint.innerHTML = clickedIndex === changedIndex
        ? "" // unreachable here, but keep hint tidy
        : '<span class="changeblind-bad">that wasn\'t it</span> — the flashing cell is outlined';

      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + reached + '</div>' +
          '<div class="g-sub">' +
            (best ? "new best! · " : "") + "streak of " + reached +
          '</div>' +
          '<button class="g-btn">play again</button>' +
        '</div>'
      );
    }

    function start() {
      clearFlicker();
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      // clear any leftover reveal flash from a previous game
      for (var i = 0; i < btns.length; i++) btns[i].classList.remove("reveal");
      running = true;
      streak = 0;
      size = START_SIZE;
      token++;                       // fresh generation for the new game
      startRound();
    }

    function showOverlay(html) {
      overlay.innerHTML = html;
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", start);
      overlay.classList.add("show");
    }

    /* ---- initial idle state: a calm preview grid behind the start overlay ---- */
    renderBar();
    buildRound();
    buildGrid();
    paint(colorsA);
    grid.classList.add("locked");
    showOverlay(
      '<div class="g-result">' +
        '<div class="g-sub" style="margin-bottom:.4rem">a–blank–b flickers · spot the one cell that changes</div>' +
        '<button class="g-btn">start</button>' +
      '</div>'
    );

    /* ---- teardown: stop the round and clear the (single) flicker timer so
       nothing can fire after unmount; bump token to neutralise any pending
       callback already queued. ---- */
    return function () {
      running = false;
      token++;
      clearFlicker();
      for (var i = 0; i < btns.length; i++) {
        btns[i].removeEventListener("click", onCell);
      }
    };
  }
});
