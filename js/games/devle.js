/* Devle — Wordle for developers. Guess the hidden 5-letter dev word in 6 tries.
   Pure vanilla JS. Registers itself with the global NERDBOX object.
   Uses a text input + submit button (no global keydown listener) to avoid leaks. */
NERDBOX.injectStyle("devle", `
  .devle-wrap { width: 100%; max-width: 360px; display: flex; flex-direction: column; align-items: center; gap: 1.1rem; }
  .devle-grid { display: grid; grid-template-rows: repeat(6, 1fr); gap: 0.4rem; width: 100%; max-width: 320px; }
  .devle-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.4rem; }
  .devle-cell {
    aspect-ratio: 1 / 1; display: flex; align-items: center; justify-content: center;
    font-family: "JetBrains Mono", monospace; font-size: 1.5rem; font-weight: 700;
    text-transform: uppercase; color: var(--text);
    background: var(--bg-alt); border: 2px solid var(--sub-alt);
    border-radius: 8px; user-select: none;
    transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.12s;
  }
  .devle-cell.devle-filled { border-color: var(--sub); }
  .devle-cell.devle-pop { transform: scale(1.06); }
  .devle-cell.devle-correct { background: var(--go); border-color: var(--go); color: var(--bg); }
  .devle-cell.devle-present { background: var(--accent); border-color: var(--accent); color: var(--bg); }
  .devle-cell.devle-absent { background: var(--sub-alt); border-color: var(--sub-alt); color: var(--bg); }
  .devle-controls { display: flex; align-items: center; gap: 0.5rem; width: 100%; max-width: 320px; }
  .devle-input {
    flex: 1; min-width: 0; background: var(--bg-alt); border: 1px solid var(--sub-alt);
    border-radius: 10px; padding: 0.6rem 0.85rem; color: var(--text);
    font-family: "JetBrains Mono", monospace; font-size: 1.1rem; letter-spacing: 0.28em;
    text-transform: uppercase; transition: border-color 0.12s;
  }
  .devle-input::placeholder { letter-spacing: normal; text-transform: none; color: var(--sub); }
  .devle-input:focus { outline: none; border-color: var(--accent); }
  .devle-input:disabled { opacity: 0.5; }
  .devle-note { font-family: "JetBrains Mono", monospace; font-size: 0.8rem; min-height: 1.2em; color: var(--error); text-align: center; }
  .devle-note.devle-good { color: var(--go); }
`);

NERDBOX.register({
  id: "devle",
  name: "Devle",
  tagline: "wordle for developers",
  category: "puzzle",
  scoreMode: "max",
  formatScore: function (v) { return v + " streak"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 3v18"/><path d="M14 13.5l1.4 1.4 2.6-2.9"/></svg>',
  mount: function (root, ctx) {
    /* Curated 5-letter dev words. De-duplicated to unique entries. The target is
       picked from this list, and every guess must also be in this list. */
    var WORD_LIST = [
      "class", "const", "async", "await", "array", "float", "yield", "catch",
      "while", "break", "macro", "crate", "mutex", "route", "query", "cache",
      "stack", "queue", "graph", "scope", "props", "fetch", "slice", "union",
      "field", "bytes", "regex", "enums", "types", "hooks", "redux", "nodes",
      "build", "debug", "parse", "token", "mount", "table", "index", "model",
      "value", "event", "react"
    ];
    // de-duplicate (keep only unique, valid 5-letter lowercase words)
    var seen = {};
    var WORDS = WORD_LIST.filter(function (w) {
      if (w.length !== 5 || !/^[a-z]{5}$/.test(w) || seen[w]) return false;
      seen[w] = true;
      return true;
    });
    var WORD_SET = {};
    WORDS.forEach(function (w) { WORD_SET[w] = true; });

    var ROWS = 6, COLS = 5;
    var streak = 0;
    var target = "";
    var rowIndex = 0;
    var gameDone = false;       // true once the board is solved/lost and awaiting reset
    var timers = [];

    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }

    /* ---------- DOM ---------- */
    var status = ctx.util.el("div", "g-status", "");
    var wrap = ctx.util.el("div", "devle-wrap");

    var grid = ctx.util.el("div", "devle-grid");
    var cells = [];             // cells[r][c]
    for (var r = 0; r < ROWS; r++) {
      var rowEl = ctx.util.el("div", "devle-row");
      var rowCells = [];
      for (var c = 0; c < COLS; c++) {
        var cell = ctx.util.el("div", "devle-cell");
        rowEl.appendChild(cell);
        rowCells.push(cell);
      }
      grid.appendChild(rowEl);
      cells.push(rowCells);
    }

    var controls = ctx.util.el("div", "devle-controls");
    var input = document.createElement("input");
    input.type = "text";
    input.className = "devle-input";
    input.maxLength = 5;
    input.setAttribute("placeholder", "type a guess");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("spellcheck", "false");
    var submitBtn = ctx.util.el("button", "g-btn devle-submit", "guess");
    controls.appendChild(input);
    controls.appendChild(submitBtn);

    var note = ctx.util.el("div", "devle-note", "");

    wrap.appendChild(grid);
    wrap.appendChild(controls);
    wrap.appendChild(note);
    root.appendChild(status);
    root.appendChild(wrap);

    /* keep input to letters only, mirror into the active row as you type */
    input.addEventListener("input", function () {
      var v = input.value.toLowerCase().replace(/[^a-z]/g, "").slice(0, COLS);
      if (v !== input.value) input.value = v;
      paintActiveRow(v);
      if (note.textContent) { note.textContent = ""; note.classList.remove("devle-good"); }
    });
    // Enter within the input submits (local listener on the input, not on window)
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); submitGuess(); }
    });
    submitBtn.addEventListener("click", submitGuess);

    /* ---------- rendering ---------- */
    function paintActiveRow(text) {
      if (gameDone || rowIndex >= ROWS) return;
      var rowCells = cells[rowIndex];
      for (var i = 0; i < COLS; i++) {
        var ch = text.charAt(i);
        rowCells[i].textContent = ch ? ch : "";
        if (ch) rowCells[i].classList.add("devle-filled");
        else rowCells[i].classList.remove("devle-filled");
      }
    }

    function setNote(msg, good) {
      note.textContent = msg || "";
      if (good) note.classList.add("devle-good");
      else note.classList.remove("devle-good");
    }

    /* Proper Wordle letter-counting:
       1) first pass marks exact-position greens and consumes those letters
       2) second pass marks "present" only while copies remain in the target,
          otherwise "absent". A letter is yellow at most as many times as it
          appears in the target, with greens consumed first. */
    function scoreGuess(guess, answer) {
      var result = new Array(COLS);       // "correct" | "present" | "absent"
      var counts = {};
      var i, ch;
      for (i = 0; i < COLS; i++) {
        ch = answer.charAt(i);
        counts[ch] = (counts[ch] || 0) + 1;
      }
      // pass 1: greens
      for (i = 0; i < COLS; i++) {
        if (guess.charAt(i) === answer.charAt(i)) {
          result[i] = "correct";
          counts[guess.charAt(i)]--;
        }
      }
      // pass 2: yellows / greys
      for (i = 0; i < COLS; i++) {
        if (result[i]) continue;
        ch = guess.charAt(i);
        if (counts[ch] > 0) { result[i] = "present"; counts[ch]--; }
        else { result[i] = "absent"; }
      }
      return result;
    }

    function revealRow(rowCells, guess, result) {
      for (var i = 0; i < COLS; i++) {
        (function (cell, ch, state, delay) {
          later(function () {
            cell.classList.remove("devle-filled");
            cell.classList.add("devle-" + state, "devle-pop");
            cell.textContent = ch;
            later(function () { cell.classList.remove("devle-pop"); }, 120);
          }, delay);
        })(rowCells[i], guess.charAt(i), result[i], i * 90);
      }
    }

    /* ---------- flow ---------- */
    function submitGuess() {
      if (gameDone) return;
      if (rowIndex >= ROWS) return;
      var guess = input.value.toLowerCase().replace(/[^a-z]/g, "");
      if (guess.length !== COLS) { setNote("5 letters please", false); return; }
      if (!WORD_SET[guess]) { setNote("not in word list", false); return; }

      var result = scoreGuess(guess, target);
      revealRow(cells[rowIndex], guess, result);
      input.value = "";

      var solved = guess === target;
      var lastRow = rowIndex;
      rowIndex++;

      if (solved) {
        endRoundSolved(lastRow);
      } else if (rowIndex >= ROWS) {
        endRoundFailed(lastRow);
      } else {
        // continue: keep focus for the next guess
        later(function () { try { input.focus(); } catch (e) {} }, 0);
      }
    }

    function endRoundSolved(lastRow) {
      gameDone = true;
      input.disabled = true;
      submitBtn.disabled = true;
      streak++;
      var best = ctx.submitScore(streak);
      status.textContent = "streak " + streak;
      setNote("solved!" + (best ? " new best!" : ""), true);
      // brief pause, then a fresh word with a cleared grid (streak carries on)
      later(function () { newRound(false); }, 1400);
    }

    function endRoundFailed(lastRow) {
      gameDone = true;
      input.disabled = true;
      submitBtn.disabled = true;
      ctx.submitScore(streak);          // best is a max of streak; record it
      status.textContent = "game over";
      setNote("the word was “" + target.toUpperCase() + "”", false);
      wrap.appendChild(buildResult(
        streak,
        "best streak",
        "play again",
        function () { streak = 0; newRound(true); }
      ));
    }

    function buildResult(big, sub, btnLabel, onClick) {
      var res = ctx.util.el("div", "g-result",
        '<div class="g-big">' + big + '</div>' +
        '<div class="g-sub">' + sub + '</div>' +
        '<button class="g-btn">' + btnLabel + '</button>');
      res.querySelector("button").addEventListener("click", function () {
        onClick();
      });
      return res;
    }

    /* Start (or restart) a single round. resetStreak only affects the status text;
       streak itself is changed by the caller before calling. */
    function newRound(clearResult) {
      // remove any lingering result card
      var old = wrap.querySelector(".g-result");
      if (old) old.parentNode.removeChild(old);

      gameDone = false;
      rowIndex = 0;
      target = WORDS[ctx.util.rand(WORDS.length)];
      input.value = "";
      input.disabled = false;
      submitBtn.disabled = false;
      setNote("", false);

      // wipe the grid
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          var cell = cells[r][c];
          cell.textContent = "";
          cell.className = "devle-cell";
        }
      }
      status.textContent = "streak " + streak;
      later(function () { try { input.focus(); } catch (e) {} }, 0);
    }

    /* intro */
    status.textContent = "guess the 5-letter dev word";
    newRound(true);

    return function teardown() { clearTimers(); };
  }
});
