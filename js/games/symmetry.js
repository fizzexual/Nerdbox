/* Symmetry — visual perception, 60-second round.
   Each trial shows an N×N grid of filled / empty cells that is EITHER a
   perfect left-right mirror image OR not, decided 50/50. Press "symmetric"
   or "not". Correct → +1 and a green flash; wrong → red flash. Both advance
   to the next trial. Live countdown + score; score = correct answers in 60s.

   Generation (the load-bearing bit):
     · symmetric  → fill the LEFT half at random, then copy each cell to its
                    mirror column c -> N-1-c. For odd N the middle column maps
                    to itself (N-1-c === c) so it may be filled freely and the
                    grid stays symmetric. This ALWAYS produces a symmetric grid.
     · asymmetric → fill every cell at random, then VERIFY isSymmetric() is
                    false; regenerate while it isn't. (With N=6 / 36 cells an
                    accidental mirror is vanishingly rare, but the guard is
                    explicit, and a final fallback flips one mirrored pair so
                    the function can never return a symmetric "not" grid.)
*/
NERDBOX.injectStyle("symmetry", `
  .symmetry-wrap {
    position: relative; width: 100%; max-width: 460px;
    display: flex; flex-direction: column; align-items: center; gap: 1.4rem;
    margin: 0 auto;
  }
  .symmetry-board {
    display: grid;
    gap: 6px;
    width: 100%;
    max-width: 360px;
    padding: 14px;
    background: var(--bg-alt);
    border: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
    border-radius: 16px;
    transition: box-shadow 0.14s, border-color 0.14s;
  }
  .symmetry-board.symmetry-good {
    border-color: var(--go);
    box-shadow: 0 0 0 1px var(--go), 0 0 26px -8px var(--go);
  }
  .symmetry-board.symmetry-bad {
    border-color: var(--error);
    box-shadow: 0 0 0 1px var(--error), 0 0 26px -8px var(--error);
  }
  .symmetry-cell {
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 5px;
    background: var(--bg-alt);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 7%, transparent);
    transition: background 0.1s ease;
  }
  .symmetry-cell.symmetry-on {
    background: var(--accent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .symmetry-controls {
    display: flex;
    gap: 0.9rem;
    width: 100%;
    max-width: 360px;
  }
  .symmetry-choice {
    flex: 1 1 0;
    border: 1px solid var(--sub-alt);
    background: transparent;
    color: var(--text);
    border-radius: 12px;
    padding: 0.85rem 0.6rem;
    font-family: "JetBrains Mono", monospace;
    font-size: 1.05rem;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.14s, border-color 0.14s, background 0.14s, transform 0.08s;
  }
  .symmetry-choice:hover { border-color: var(--accent); background: var(--bg-alt); }
  .symmetry-choice:active { transform: translateY(1px); }
  .symmetry-controls.symmetry-locked .symmetry-choice {
    pointer-events: none; opacity: 0.6;
  }
  .symmetry-hint {
    font-family: "JetBrains Mono", monospace;
    font-size: 0.85rem;
    color: var(--sub);
    text-align: center;
    min-height: 1.2em;
  }
`);

NERDBOX.register({
  id: "symmetry",
  name: "Symmetry",
  tagline: "symmetrical, or not?",
  category: "perception",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><path d="M9 6 4 12l5 6"/><path d="M15 6l5 6-5 6"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;

    /* ---- config ---- */
    var N = 6;               // grid is N×N (even here, but logic handles odd)
    var ROUND = 60;          // seconds per round
    var FILL = 0.5;          // probability a generated cell is filled
    var FLASH_MS = 220;      // green/red board flash before the next trial

    /* ---- state ---- */
    var running = false;
    var timer = null;        // 1s countdown interval (cleared in teardown)
    var flashT = null;       // board-flash timeout (cleared in teardown)
    var timeLeft = ROUND;
    var score = 0;
    var curSymmetric = false; // truth value of the trial currently shown
    var locked = false;       // input ignored during a flash / between trials

    /* ---- layout ---- */
    var status = el("div", "g-status", "");
    var wrap = el("div", "symmetry-wrap");

    var board = el("div", "symmetry-board");
    board.style.gridTemplateColumns = "repeat(" + N + ", 1fr)";

    // build N*N cells once; we only toggle the on-class per trial
    var cells = [];
    for (var i = 0; i < N * N; i++) {
      var c = el("div", "symmetry-cell");
      board.appendChild(c);
      cells.push(c);
    }

    var controls = el("div", "symmetry-controls");
    var symBtn = el("button", "symmetry-choice", "symmetric");
    var notBtn = el("button", "symmetry-choice", "not");
    symBtn.type = "button";
    notBtn.type = "button";
    controls.appendChild(symBtn);
    controls.appendChild(notBtn);

    var hint = el("div", "symmetry-hint", "left-right mirror?");

    wrap.appendChild(board);
    wrap.appendChild(controls);
    wrap.appendChild(hint);

    var overlay = el("div", "g-overlay");
    wrap.appendChild(overlay);

    root.appendChild(status);
    root.appendChild(wrap);

    /* ---- grid helpers ---- */
    function idx(r, c) { return r * N + c; }

    // true iff every cell equals its left-right mirror across the centre line
    function isSymmetric(grid) {
      for (var r = 0; r < N; r++) {
        for (var c = 0; c < N >> 1; c++) {           // only need to check the left half
          if (grid[idx(r, c)] !== grid[idx(r, N - 1 - c)]) return false;
        }
      }
      return true;
    }

    // fill the left half at random, mirror it to the right; for odd N the
    // middle column (c === N-1-c) is filled freely and stays self-symmetric.
    function makeSymmetric() {
      var grid = new Array(N * N);
      var half = (N + 1) >> 1; // columns 0..half-1 are the "source" (incl. middle if odd)
      for (var r = 0; r < N; r++) {
        for (var c = 0; c < half; c++) {
          var v = Math.random() < FILL ? 1 : 0;
          grid[idx(r, c)] = v;
          grid[idx(r, N - 1 - c)] = v; // mirror (no-op write when c is the middle col)
        }
      }
      return grid;
    }

    // fill everything at random, then GUARANTEE it is not symmetric.
    function makeAsymmetric() {
      var grid, tries = 0;
      do {
        grid = new Array(N * N);
        for (var i = 0; i < N * N; i++) grid[i] = Math.random() < FILL ? 1 : 0;
        tries++;
      } while (isSymmetric(grid) && tries < 50);

      // Fallback: if we somehow still hold a symmetric grid (essentially never
      // for N=6), break it deterministically by flipping one off-centre cell so
      // its mirror no longer matches.
      if (isSymmetric(grid)) {
        var r2 = rand(N);
        var c2 = rand(N >> 1);          // an off-centre column (has a distinct mirror)
        grid[idx(r2, c2)] = grid[idx(r2, c2)] ? 0 : 1;
      }
      return grid;
    }

    function paint(grid) {
      for (var i = 0; i < cells.length; i++) {
        if (grid[i]) cells[i].classList.add("symmetry-on");
        else cells[i].classList.remove("symmetry-on");
      }
    }

    function setStatus() {
      status.innerHTML =
        '<span class="gl-score">score ' + score + '</span>' +
        '<span class="gl-time">' + timeLeft + 's</span>';
    }

    /* ---- trial flow ---- */
    function nextTrial() {
      curSymmetric = Math.random() < 0.5;
      var grid = curSymmetric ? makeSymmetric() : makeAsymmetric();
      paint(grid);
      locked = false;
      controls.classList.remove("symmetry-locked");
    }

    function flash(cls) {
      if (flashT) { clearTimeout(flashT); flashT = null; }
      board.classList.remove("symmetry-good", "symmetry-bad");
      void board.offsetWidth; // reflow so the same class re-triggers the transition
      board.classList.add(cls);
      flashT = setTimeout(function () {
        flashT = null;
        board.classList.remove("symmetry-good", "symmetry-bad");
        if (running) nextTrial();
      }, FLASH_MS);
    }

    function answer(saidSymmetric) {
      if (!running || locked) return;
      locked = true;
      controls.classList.add("symmetry-locked");
      if (saidSymmetric === curSymmetric) {
        score++;
        setStatus();
        flash("symmetry-good");
      } else {
        flash("symmetry-bad");
      }
    }

    symBtn.addEventListener("click", function () { answer(true); });
    notBtn.addEventListener("click", function () { answer(false); });

    /* ---- round lifecycle ---- */
    function tick() {
      timeLeft--;
      if (timeLeft <= 0) {
        timeLeft = 0;
        setStatus();
        end();
        return;
      }
      setStatus();
    }

    function start() {
      if (timer) { clearInterval(timer); timer = null; }
      if (flashT) { clearTimeout(flashT); flashT = null; }
      running = true;
      score = 0;
      timeLeft = ROUND;
      board.classList.remove("symmetry-good", "symmetry-bad");
      overlay.classList.remove("show");
      setStatus();
      nextTrial();
      timer = setInterval(tick, 1000);
    }

    function end() {
      running = false;
      locked = true;
      if (timer) { clearInterval(timer); timer = null; }
      if (flashT) { clearTimeout(flashT); flashT = null; }
      board.classList.remove("symmetry-good", "symmetry-bad");
      controls.classList.add("symmetry-locked");
      var best = ctx.submitScore(score);
      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + score + '</div>' +
          '<div class="g-sub">' + (best ? "new best! · " : "") + 'correct in 60s</div>' +
          '<button class="g-btn">play again</button>' +
        '</div>'
      );
    }

    function showOverlay(html) {
      overlay.innerHTML = html;
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", start);
      overlay.classList.add("show");
    }

    /* ---- initial idle screen ---- */
    status.textContent = "60 seconds · symmetric, or not?";
    paint(makeSymmetric()); // calm symmetric preview behind the overlay
    controls.classList.add("symmetry-locked");
    showOverlay(
      '<div class="g-result">' +
        '<div class="g-sub" style="margin-bottom:.4rem">spot the left-right mirror · 60s</div>' +
        '<button class="g-btn">start</button>' +
      '</div>'
    );

    /* ---- teardown: stop the round and clear every timer ---- */
    return function () {
      running = false;
      locked = true;
      if (timer) { clearInterval(timer); timer = null; }
      if (flashT) { clearTimeout(flashT); flashT = null; }
    };
  }
});
