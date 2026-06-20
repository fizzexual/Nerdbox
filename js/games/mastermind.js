/* Mastermind — a hidden code of 4 pegs, each one of 6 colours (repeats allowed).
   Pick a colour, drop it into a slot (or click a slot to cycle through colours),
   then guess. Feedback uses the STANDARD algorithm:
     BLACK = exact position+colour matches.
     WHITE = colour matches in the wrong position, from the non-exact remainder,
             counted as sum over colours of min(guess-remainder, code-remainder)
             (no double counting). White excludes the black pegs.
   10 guesses per code. Crack it (4 black) to extend your streak; run out and the
   code is revealed. Best = codes cracked in a row. */
NERDBOX.injectStyle("mastermind", `
  .mastermind-wrap { position: relative; width: 100%; max-width: 560px; margin: 0 auto;
    display: flex; flex-direction: column; align-items: center; gap: 1.1rem; }
  .mastermind-board { width: 100%; display: flex; flex-direction: column; gap: 0.5rem;
    max-height: 340px; overflow-y: auto; padding-right: 2px; }
  .mastermind-row { display: flex; align-items: center; gap: 0.9rem;
    background: var(--bg-alt); border: 1px solid color-mix(in srgb, var(--text) 5%, transparent);
    border-radius: 12px; padding: 0.5rem 0.8rem; }
  .mastermind-row.mastermind-empty-row { opacity: 0.4; }
  .mastermind-num { font-family: "JetBrains Mono", monospace; font-size: 0.8rem;
    color: var(--sub); width: 1.6rem; flex: none; text-align: right; }
  .mastermind-pegs { display: flex; gap: 0.5rem; }
  .mastermind-peg { width: 28px; height: 28px; border-radius: 50%; flex: none;
    border: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
    box-shadow: inset 0 2px 4px rgba(0,0,0,0.28); }
  .mastermind-peg.mastermind-blank { background: var(--bg);
    border: 1px dashed var(--sub-alt); box-shadow: none; }
  .mastermind-fb { margin-left: auto; display: grid; grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr; gap: 3px; width: 26px; height: 26px; flex: none; }
  .mastermind-fb i { display: block; width: 100%; height: 100%; border-radius: 50%;
    background: var(--bg); border: 1px solid var(--sub-alt); }
  .mastermind-fb i.mastermind-black { background: var(--text); border-color: var(--text); }
  .mastermind-fb i.mastermind-white { background: transparent;
    border: 2px solid var(--text); }

  .mastermind-active .mastermind-peg { cursor: pointer; transition: transform 0.08s ease,
    box-shadow 0.15s ease; }
  .mastermind-active .mastermind-peg:hover { transform: translateY(-2px); }
  .mastermind-active .mastermind-peg.mastermind-sel {
    box-shadow: 0 0 0 2px var(--accent), inset 0 2px 4px rgba(0,0,0,0.28); }

  .mastermind-palette { display: flex; gap: 0.6rem; flex-wrap: wrap; justify-content: center; }
  .mastermind-swatch { width: 40px; height: 40px; border-radius: 50%; border: none; padding: 0;
    cursor: pointer; position: relative;
    box-shadow: inset 0 2px 5px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
    transition: transform 0.1s ease; }
  .mastermind-swatch:hover { transform: translateY(-2px); }
  .mastermind-swatch:active { transform: translateY(0); }
  .mastermind-swatch.mastermind-picked {
    box-shadow: 0 0 0 3px var(--accent), inset 0 2px 5px rgba(0,0,0,0.3); }

  .mastermind-controls { display: flex; gap: 0.7rem; align-items: center; flex-wrap: wrap;
    justify-content: center; }
  .mastermind-clear { border: 1px solid var(--sub-alt); background: transparent; color: var(--sub);
    border-radius: 8px; padding: 0.55rem 1.1rem; font-family: "JetBrains Mono", monospace;
    font-size: 0.85rem; cursor: pointer; transition: color 0.15s, border-color 0.15s, background 0.15s; }
  .mastermind-clear:hover { color: var(--text); border-color: var(--accent); background: var(--bg-alt); }
  .mastermind-go { padding: 0.55rem 1.6rem; }
  .mastermind-go:disabled { opacity: 0.4; cursor: not-allowed; filter: none; }

  .mastermind-hint { font-family: "JetBrains Mono", monospace; font-size: 0.82rem;
    color: var(--sub); min-height: 1.2em; text-align: center; }
  .mastermind-hint.mastermind-nice { color: var(--go); }
  .mastermind-hint.mastermind-bad { color: var(--error); }
  .mastermind-legend { font-family: "JetBrains Mono", monospace; font-size: 0.72rem;
    color: var(--sub); text-align: center; line-height: 1.5; }
  .mastermind-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%;
    vertical-align: middle; margin: 0 2px; }
  .mastermind-legend i.mastermind-black { background: var(--text); }
  .mastermind-legend i.mastermind-white { border: 2px solid var(--text); box-sizing: border-box; }
`);

NERDBOX.register({
  id: "mastermind",
  name: "Mastermind",
  tagline: "crack the hidden colour code",
  category: "reasoning",
  difficulty: "hard",
  scoreMode: "max",
  formatScore: function (v) { return v + " solved"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="8" r="2.4"/><circle cx="15.5" cy="6.5" r="2.4"/><circle cx="17" cy="15" r="2.4"/><circle cx="8" cy="16.5" r="2.4"/><path d="M9.2 9.1l4.2-1.4M15.9 8.7l.7 4M15.2 16.6l-5 .3"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;
    var SLOTS = 4, COLOURS = 6, MAX_GUESSES = 10;

    // six visually distinct peg colours (independent of theme accent on purpose)
    var PALETTE = [
      "#e5484d", // red
      "#f5a623", // amber
      "#f7e017", // yellow
      "#46b96a", // green
      "#3f8ae0", // blue
      "#b06fe0"  // purple
    ];

    var streak = 0;
    var code = [];                 // hidden code: 4 colour indices (0..5), repeats allowed
    var current = [];              // current working guess slots: null or colour index
    var selected = 0;              // currently-picked palette colour index
    var guessesUsed = 0;
    var roundOver = true;          // true between rounds / before start
    var timer = null;

    // --- layout ---------------------------------------------------------
    var status = el("div", "g-status", "");
    var wrap = el("div", "mastermind-wrap");

    var board = el("div", "mastermind-board");

    // the editable current-guess row
    var inputRow = el("div", "mastermind-row mastermind-active");
    var inputNum = el("div", "mastermind-num", "›");
    var inputPegs = el("div", "mastermind-pegs");
    var slotEls = [];
    for (var s = 0; s < SLOTS; s++) {
      var pg = el("div", "mastermind-peg mastermind-blank");
      pg.dataset.slot = s;
      pg.setAttribute("role", "button");
      pg.setAttribute("aria-label", "slot " + (s + 1));
      pg.addEventListener("click", onSlotClick);
      inputPegs.appendChild(pg);
      slotEls.push(pg);
    }
    inputRow.appendChild(inputNum);
    inputRow.appendChild(inputPegs);
    var inputFb = el("div", "mastermind-fb", "<i></i><i></i><i></i><i></i>");
    inputRow.appendChild(inputFb);
    board.appendChild(inputRow);

    // palette of colour swatches
    var palette = el("div", "mastermind-palette");
    var swatchEls = [];
    for (var c = 0; c < COLOURS; c++) {
      var sw = el("button", "mastermind-swatch");
      sw.dataset.colour = c;
      sw.style.background = PALETTE[c];
      sw.setAttribute("aria-label", "colour " + (c + 1));
      sw.addEventListener("click", onSwatch);
      palette.appendChild(sw);
      swatchEls.push(sw);
    }

    var controls = el("div", "mastermind-controls");
    var clearBtn = el("button", "mastermind-clear", "clear");
    clearBtn.addEventListener("click", onClear);
    var goBtn = el("button", "g-btn mastermind-go", "guess");
    goBtn.addEventListener("click", onGuess);
    controls.appendChild(clearBtn);
    controls.appendChild(goBtn);

    var hint = el("div", "mastermind-hint", "");
    var legend = el("div", "mastermind-legend",
      '<i class="mastermind-black"></i> right colour &amp; spot &nbsp;·&nbsp; ' +
      '<i class="mastermind-white"></i> right colour, wrong spot');

    wrap.appendChild(board);
    wrap.appendChild(palette);
    wrap.appendChild(controls);
    wrap.appendChild(hint);
    wrap.appendChild(legend);

    var overlay = el("div", "g-overlay");
    wrap.appendChild(overlay);

    root.appendChild(status);
    root.appendChild(wrap);

    // --- helpers --------------------------------------------------------
    function later(fn, ms) { clearTimeout(timer); timer = setTimeout(fn, ms); }

    function setStatus() {
      var left = MAX_GUESSES - guessesUsed;
      status.innerHTML =
        '<span class="gl-score">streak ' + streak + '</span>' +
        '<span class="gl-time">' + left + ' guess' + (left === 1 ? "" : "es") + ' left</span>';
    }

    function paintSlot(i) {
      var pg = slotEls[i];
      if (current[i] == null) {
        pg.className = "mastermind-peg mastermind-blank";
        pg.style.background = "";
      } else {
        pg.className = "mastermind-peg";
        pg.style.background = PALETTE[current[i]];
      }
    }

    function paintAllSlots() { for (var i = 0; i < SLOTS; i++) paintSlot(i); }

    function paintSelection() {
      for (var i = 0; i < COLOURS; i++) {
        if (i === selected) swatchEls[i].classList.add("mastermind-picked");
        else swatchEls[i].classList.remove("mastermind-picked");
      }
    }

    function isFull() {
      for (var i = 0; i < SLOTS; i++) if (current[i] == null) return false;
      return true;
    }

    function refreshGo() { goBtn.disabled = roundOver || !isFull(); }

    // STANDARD Mastermind feedback. Returns {black, white}.
    // black: exact (position & colour) matches.
    // white: from the NON-exact remainder, sum over colours of
    //        min(count in guess-remainder, count in code-remainder).
    function feedback(guess, secret) {
      var black = 0;
      var codeRem = {}, guessRem = {};
      for (var i = 0; i < SLOTS; i++) {
        if (guess[i] === secret[i]) {
          black++;
        } else {
          codeRem[secret[i]] = (codeRem[secret[i]] || 0) + 1;
          guessRem[guess[i]] = (guessRem[guess[i]] || 0) + 1;
        }
      }
      var white = 0;
      for (var k in guessRem) {
        if (codeRem.hasOwnProperty(k)) {
          white += Math.min(guessRem[k], codeRem[k]);
        }
      }
      return { black: black, white: white };
    }

    // build a small static peg row (used for logged past guesses)
    function makeGuessRow(num, guess, fb) {
      var row = el("div", "mastermind-row");
      row.appendChild(el("div", "mastermind-num", String(num)));
      var pegs = el("div", "mastermind-pegs");
      for (var i = 0; i < SLOTS; i++) {
        var p = el("div", "mastermind-peg");
        p.style.background = PALETTE[guess[i]];
        pegs.appendChild(p);
      }
      row.appendChild(pegs);
      var fbBox = el("div", "mastermind-fb");
      // render black pegs first, then white, then empties — 4 cells total
      var i2;
      for (i2 = 0; i2 < fb.black; i2++) fbBox.appendChild(el("i", "mastermind-black"));
      for (i2 = 0; i2 < fb.white; i2++) fbBox.appendChild(el("i", "mastermind-white"));
      var filled = fb.black + fb.white;
      for (i2 = filled; i2 < SLOTS; i2++) fbBox.appendChild(el("i"));
      row.appendChild(fbBox);
      return row;
    }

    function clearWorking() {
      current = [];
      for (var i = 0; i < SLOTS; i++) current.push(null);
      paintAllSlots();
      refreshGo();
    }

    // --- interaction ----------------------------------------------------
    function onSwatch() {
      if (roundOver) return;
      selected = Number(this.dataset.colour);
      paintSelection();
    }

    function onSlotClick() {
      if (roundOver) return;
      var i = Number(this.dataset.slot);
      if (current[i] == null) {
        // empty slot: drop the currently-picked palette colour
        current[i] = selected;
      } else {
        // filled slot: cycle to the next colour (wraps 5 -> 0)
        current[i] = (current[i] + 1) % COLOURS;
      }
      paintSlot(i);
      refreshGo();
    }

    function onClear() {
      if (roundOver) return;
      clearWorking();
      hint.className = "mastermind-hint";
      hint.textContent = "pick a colour, then tap the slots — or tap a slot to cycle";
    }

    function onGuess() {
      if (roundOver || !isFull()) return;
      var guess = current.slice();
      var fb = feedback(guess, code);
      guessesUsed++;

      // log this guess as a static row above the input row
      var row = makeGuessRow(guessesUsed, guess, fb);
      board.insertBefore(row, inputRow);

      if (fb.black === SLOTS) {
        win(guess);
        return;
      }

      if (guessesUsed >= MAX_GUESSES) {
        lose();
        return;
      }

      clearWorking();
      setStatus();
      hint.className = "mastermind-hint";
      hint.textContent = fb.black + " black · " + fb.white + " white — keep deducing";
      board.scrollTop = board.scrollHeight;
    }

    function win(guess) {
      roundOver = true;
      refreshGo();
      streak++;
      ctx.submitScore(streak);
      setStatus();
      hint.className = "mastermind-hint mastermind-nice";
      hint.textContent = "cracked it in " + guessesUsed + "! streak " + streak + " — next code…";
      board.scrollTop = board.scrollHeight;
      later(function () {
        if (roundOver && overlay.className.indexOf("show") === -1) newRound();
      }, 1200);
    }

    function lose() {
      roundOver = true;
      refreshGo();
      hint.className = "mastermind-hint mastermind-bad";
      hint.textContent = "out of guesses — the code is revealed";

      // reveal the code in the input row's slots
      for (var i = 0; i < SLOTS; i++) {
        slotEls[i].className = "mastermind-peg";
        slotEls[i].style.background = PALETTE[code[i]];
      }
      inputNum.textContent = "✕";

      // dot string of the secret for the overlay sub-line
      var dots = '<span style="display:inline-flex;gap:5px;vertical-align:middle;">';
      for (var j = 0; j < SLOTS; j++) {
        dots += '<span style="width:14px;height:14px;border-radius:50%;display:inline-block;' +
          'background:' + PALETTE[code[j]] + ';border:1px solid rgba(255,255,255,0.2);"></span>';
      }
      dots += '</span>';

      showOverlay(
        '<div class="g-result">' +
        '<div class="g-big">' + streak + '</div>' +
        '<div class="g-sub">codes cracked in a row · the code was ' + dots + '</div>' +
        '<button class="g-btn">play again</button>' +
        '</div>',
        start
      );
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

    function newRound() {
      overlay.classList.remove("show");
      // clear logged guess rows (everything before the input row)
      while (board.firstChild && board.firstChild !== inputRow) {
        board.removeChild(board.firstChild);
      }
      // fresh hidden code: 4 pegs, each independently one of 6 colours (repeats allowed)
      code = [];
      for (var i = 0; i < SLOTS; i++) code.push(rand(COLOURS));
      guessesUsed = 0;
      roundOver = false;
      inputNum.textContent = "›";
      selected = 0;
      paintSelection();
      clearWorking();
      setStatus();
      hint.className = "mastermind-hint";
      hint.textContent = "pick a colour, then tap the slots — or tap a slot to cycle";
    }

    function start() {
      streak = 0;
      newRound();
    }

    // --- idle / start state --------------------------------------------
    clearWorking();
    paintSelection();
    setStatus();
    status.textContent = "crack the hidden 4-colour code in 10 guesses";
    showOverlay('<button class="g-btn">start</button>', start);

    // teardown: clear any pending timer so nothing fires after unmount
    return function () { clearTimeout(timer); timer = null; };
  }
});
