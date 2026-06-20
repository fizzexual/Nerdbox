/* Cryptogram (hard language/deduction) — a short quote is encrypted with a random
   substitution cipher (a permutation of A–Z with NO letter mapping to itself). The
   ciphertext is shown as letter slots; under each DISTINCT cipher letter is an input
   for the guessed plaintext letter. Typing a letter fills every matching slot live.
   One freebie is pre-filled & locked: the single most frequent cipher letter. When the
   decoded preview matches the plaintext (letters only, case-insensitive) the round is
   solved: streak++, submitScore(streak), next quote. "reveal" fills the solution and
   ends the run (game over → best = solved-in-a-row). Score (scoreMode max) = streak. */
NERDBOX.injectStyle("cryptogram", `
  .cryptogram-wrap { position: relative; width: 100%; max-width: 720px; display: flex; flex-direction: column; align-items: center; gap: 1.4rem; }
  .cryptogram-board { width: 100%; background: var(--bg-alt); border: 3px solid var(--bg-alt); border-radius: 16px; padding: 1.5rem 1.3rem; display: flex; flex-wrap: wrap; gap: 0.35rem 0.55rem; justify-content: center; transition: border-color 0.15s ease, background 0.15s ease; }
  .cryptogram-board.cryptogram-good { border-color: var(--go); background: color-mix(in srgb, var(--go) 13%, var(--bg-alt)); }
  .cryptogram-word { display: inline-flex; gap: 0.3rem; margin: 0 0.15rem; }
  .cryptogram-cell { display: inline-flex; flex-direction: column; align-items: center; gap: 0.3rem; font-family: "JetBrains Mono", monospace; }
  .cryptogram-plain { font-size: 1.55rem; font-weight: 700; line-height: 1; height: 1.55rem; color: var(--text); min-width: 1.1ch; text-align: center; }
  .cryptogram-plain.cryptogram-empty { color: var(--sub-alt); }
  .cryptogram-in { width: 1.7ch; min-width: 1.7ch; height: 2rem; text-align: center; text-transform: uppercase; font-family: "JetBrains Mono", monospace; font-size: 1.05rem; font-weight: 500; color: var(--accent); background: var(--bg); border: none; border-bottom: 2px solid var(--sub-alt); border-radius: 4px 4px 0 0; padding: 0; outline: none; transition: border-color 0.12s ease, color 0.12s ease; }
  .cryptogram-in:focus { border-bottom-color: var(--accent); }
  .cryptogram-in:disabled { color: var(--go); border-bottom-color: var(--go); opacity: 1; cursor: default; }
  .cryptogram-cipher { font-size: 0.82rem; font-weight: 500; color: var(--sub); height: 0.95rem; line-height: 1; letter-spacing: 0.05em; }
  .cryptogram-cell.cryptogram-locked .cryptogram-cipher { color: var(--go); }
  .cryptogram-cell.cryptogram-active .cryptogram-cipher { color: var(--accent); }
  .cryptogram-punct { font-family: "JetBrains Mono", monospace; font-size: 1.55rem; font-weight: 700; color: var(--sub); align-self: flex-start; line-height: 1; height: 1.55rem; }
  .cryptogram-controls { display: flex; gap: 0.7rem; flex-wrap: wrap; justify-content: center; }
  .cryptogram-clear { background: var(--sub); color: var(--bg); }
  .cryptogram-reveal { background: var(--error); color: var(--bg); }
  .cryptogram-hint { font-family: "JetBrains Mono", monospace; font-size: 0.8rem; color: var(--sub); text-align: center; max-width: 640px; line-height: 1.5; }
  .cryptogram-hint b { color: var(--accent); font-weight: 500; }
`);

NERDBOX.register({
  id: "cryptogram",
  name: "Cryptogram",
  tagline: "crack the substitution cipher",
  category: "language",
  difficulty: "hard",
  scoreMode: "max",
  formatScore: function (v) { return v + " solved"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><path d="M12 15v3"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand, shuffle = ctx.util.shuffle;
    var ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    // ~12 short quotes/phrases (UPPERCASE, ≤ ~40 letters each).
    var QUOTES = [
      "TALK IS CHEAP SHOW ME THE CODE",
      "STAY HUNGRY STAY FOOLISH",
      "MOVE FAST AND BREAK THINGS",
      "SIMPLICITY IS THE SOUL OF EFFICIENCY",
      "FIRST SOLVE THE PROBLEM THEN WRITE CODE",
      "THERE IS NO PLACE LIKE HOME",
      "KNOWLEDGE IS POWER GUARD IT WELL",
      "PROGRAMS MUST BE WRITTEN FOR PEOPLE",
      "MAKE IT WORK MAKE IT RIGHT MAKE IT FAST",
      "THE BEST WAY OUT IS ALWAYS THROUGH",
      "WHEN IN DOUBT USE BRUTE FORCE",
      "GOOD CODE IS ITS OWN BEST DOCUMENTATION"
    ];

    var streak = 0;
    var quote = "";          // current plaintext (uppercase)
    var cipher = "";         // ciphertext shown to the player
    var ended = false;       // true once a run is over (reveal pressed)
    var solving = false;     // true while a round is interactive
    var inputs = {};         // cipher letter -> its <input> element
    var lockedLetter = "";   // the freebie cipher letter (disabled input)
    var flashTimer = null;

    function clearFlash() { if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; } }

    function escapeHtml(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function isLetter(ch) { return ch >= "A" && ch <= "Z"; }

    // Build a derangement of A–Z: a bijection plain->cipher with NO fixed point.
    // Shuffle, then repair any position where the mapped letter equals itself by
    // swapping it with another slot that stays valid after the swap.
    function makeDerangement() {
      var perm;
      for (var attempt = 0; attempt < 200; attempt++) {
        perm = shuffle(ALPHA.split(""));
        var ok = true;
        for (var i = 0; i < 26; i++) {
          if (perm[i] === ALPHA[i]) {
            // find a partner j to swap with that breaks both fixed points
            var swapped = false;
            for (var k = 1; k < 26; k++) {
              var j = (i + k) % 26;
              if (perm[j] !== ALPHA[i] && perm[i] !== ALPHA[j] && perm[j] !== ALPHA[j]) {
                var t = perm[i]; perm[i] = perm[j]; perm[j] = t;
                swapped = true;
                break;
              }
            }
            if (!swapped) { ok = false; break; }
          }
        }
        if (!ok) continue;
        // verify: no fixed points anywhere
        var clean = true;
        for (var m = 0; m < 26; m++) if (perm[m] === ALPHA[m]) { clean = false; break; }
        if (clean) break;
      }
      var map = {};
      for (var p = 0; p < 26; p++) map[ALPHA[p]] = perm[p];
      return map; // plaintext letter -> cipher letter
    }

    function encrypt(text, map) {
      var out = "";
      for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        out += isLetter(ch) ? map[ch] : ch;
      }
      return out;
    }

    // most frequent cipher letter (the freebie)
    function mostFrequentLetter(text) {
      var counts = {}, best = "", bestN = -1;
      for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        if (!isLetter(ch)) continue;
        counts[ch] = (counts[ch] || 0) + 1;
        if (counts[ch] > bestN) { bestN = counts[ch]; best = ch; }
      }
      return best;
    }

    // ---- DOM ----
    var status = el("div", "g-status", "");
    var board = el("div", "cryptogram-board");
    var clearBtn = el("button", "g-btn cryptogram-clear", "clear");
    var revealBtn = el("button", "g-btn cryptogram-reveal", "reveal & end");
    var controls = el("div", "cryptogram-controls");
    controls.appendChild(clearBtn);
    controls.appendChild(revealBtn);
    var hint = el("div", "cryptogram-hint",
      'each cipher letter always stands for the same real letter · type a guess under any ' +
      'letter to fill it <b>everywhere</b> · the <b>green</b> letter is a freebie');
    var overlay = el("div", "g-overlay");
    var wrap = el("div", "cryptogram-wrap");
    wrap.appendChild(board);
    wrap.appendChild(controls);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    function setStatus() {
      status.innerHTML = '<span class="gl-score">streak ' + streak + '</span>';
    }

    function setControls(on) {
      clearBtn.disabled = !on;
      revealBtn.disabled = !on;
    }

    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      var b = overlay.querySelector("button");
      if (b) b.addEventListener("click", function () { overlay.classList.remove("show"); onPlay(); });
      overlay.classList.add("show");
    }

    // current guess map: cipher letter -> guessed plaintext letter (or "")
    function currentGuess() {
      var g = {};
      for (var c in inputs) {
        if (!Object.prototype.hasOwnProperty.call(inputs, c)) continue;
        var v = inputs[c].value.toUpperCase().replace(/[^A-Z]/g, "");
        g[c] = v.charAt(0) || "";
      }
      return g;
    }

    // refresh every decoded letter from the guess map
    function refreshPreview() {
      var g = currentGuess();
      var cells = board.querySelectorAll(".cryptogram-cell");
      for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        var c = cell.getAttribute("data-cipher");
        var out = cell.querySelector(".cryptogram-plain");
        var guessed = g[c] || "";
        if (guessed) {
          out.textContent = guessed;
          out.classList.remove("cryptogram-empty");
        } else {
          out.textContent = "·";
          out.classList.add("cryptogram-empty");
        }
      }
    }

    // build the decoded string (letters only) from the current guess, for win-check
    function decodedLetters() {
      var g = currentGuess();
      var s = "";
      for (var i = 0; i < cipher.length; i++) {
        var ch = cipher.charAt(i);
        if (!isLetter(ch)) continue;
        s += g[ch] || " "; // unknown -> space placeholder (never matches a letter)
      }
      return s;
    }

    function plainLetters() {
      var s = "";
      for (var i = 0; i < quote.length; i++) {
        var ch = quote.charAt(i);
        if (isLetter(ch)) s += ch;
      }
      return s;
    }

    function checkWin() {
      if (!solving) return;
      // compare letters only, case-insensitive
      if (decodedLetters().toUpperCase() === plainLetters().toUpperCase()) {
        solved();
      }
    }

    function setActive(cipherLetter, on) {
      var cells = board.querySelectorAll('.cryptogram-cell[data-cipher="' + cipherLetter + '"]');
      for (var i = 0; i < cells.length; i++) {
        if (on) cells[i].classList.add("cryptogram-active");
        else cells[i].classList.remove("cryptogram-active");
      }
    }

    function onInput(c) {
      return function () {
        var inp = inputs[c];
        var v = inp.value.toUpperCase().replace(/[^A-Z]/g, "");
        inp.value = v.charAt(0) || "";
        refreshPreview();
        checkWin();
      };
    }

    // render ciphertext as words of slots; one input per DISTINCT cipher letter
    function renderBoard() {
      board.className = "cryptogram-board";
      board.innerHTML = "";
      inputs = {};
      var words = cipher.split(" ");
      for (var w = 0; w < words.length; w++) {
        var word = words[w];
        var wordEl = el("div", "cryptogram-word");
        for (var i = 0; i < word.length; i++) {
          var ch = word.charAt(i);
          if (isLetter(ch)) {
            var locked = (ch === lockedLetter);
            var cell = el("div", "cryptogram-cell" + (locked ? " cryptogram-locked" : ""));
            cell.setAttribute("data-cipher", ch);
            var plain = el("div", "cryptogram-plain cryptogram-empty", "·");
            var input = el("input", "cryptogram-in");
            input.type = "text";
            input.maxLength = 1;
            input.setAttribute("maxlength", "1");
            input.autocomplete = "off";
            input.autocapitalize = "characters";
            input.spellcheck = false;
            input.setAttribute("aria-label", "plaintext for cipher letter " + ch);
            var cipherLab = el("div", "cryptogram-cipher", escapeHtml(ch));
            cell.appendChild(plain);
            cell.appendChild(input);
            cell.appendChild(cipherLab);
            wordEl.appendChild(cell);

            if (!inputs[ch]) {
              // first slot for this cipher letter owns the live input
              inputs[ch] = input;
              if (locked) {
                input.value = mapPlainFor(ch);
                input.disabled = true;
              } else {
                (function (cipherLetter) {
                  input.addEventListener("input", onInput(cipherLetter));
                  input.addEventListener("focus", function () { setActive(cipherLetter, true); });
                  input.addEventListener("blur", function () { setActive(cipherLetter, false); });
                  input.addEventListener("keydown", function (e) {
                    if (e.key === "Enter") { e.preventDefault(); focusNextEmpty(cipherLetter); }
                  });
                })(ch);
              }
            } else {
              // duplicate occurrence: mirror the owning input, read-only
              input.readOnly = true;
              input.setAttribute("tabindex", "-1");
              input.disabled = (ch === lockedLetter);
              (function (cipherLetter, mirror) {
                mirror.addEventListener("focus", function () {
                  if (inputs[cipherLetter] && !inputs[cipherLetter].disabled) inputs[cipherLetter].focus();
                });
              })(ch, input);
            }
          } else {
            // punctuation inside a word (apostrophe, hyphen, etc.) — shown unchanged
            var p = el("div", "cryptogram-punct", escapeHtml(ch));
            wordEl.appendChild(p);
          }
        }
        board.appendChild(wordEl);
      }
      refreshPreview();
    }

    // keep a reference to the active plain<-cipher solution for freebie + reveal
    var solutionPlainOf = {}; // cipher letter -> correct plaintext letter
    function mapPlainFor(cipherLetter) { return solutionPlainOf[cipherLetter] || ""; }

    function focusNextEmpty(fromCipher) {
      // move focus to the next distinct unsolved input after `fromCipher`
      var order = [];
      var cells = board.querySelectorAll(".cryptogram-cell");
      var seen = {};
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i].getAttribute("data-cipher");
        if (!seen[c]) { seen[c] = true; order.push(c); }
      }
      var start = order.indexOf(fromCipher);
      for (var k = 1; k <= order.length; k++) {
        var c2 = order[(start + k) % order.length];
        var inp = inputs[c2];
        if (inp && !inp.disabled && !inp.value) { inp.focus(); return; }
      }
    }

    function solved() {
      solving = false;
      setControls(false);
      clearFlash();
      board.classList.add("cryptogram-good");
      streak++;
      var best = ctx.submitScore(streak);
      setStatus();
      // brief celebratory pause, then the next quote
      flashTimer = setTimeout(function () {
        flashTimer = null;
        nextRound(best);
      }, 850);
    }

    // optional toast text passed through from a solve
    function nextRound() {
      ended = false;
      solving = true;
      overlay.classList.remove("show");

      quote = QUOTES[rand(QUOTES.length)];
      var map = makeDerangement();           // plain -> cipher
      cipher = encrypt(quote, map);

      // invert for the solution lookup (cipher -> plain)
      solutionPlainOf = {};
      for (var pl in map) {
        if (Object.prototype.hasOwnProperty.call(map, pl)) solutionPlainOf[map[pl]] = pl;
      }

      lockedLetter = mostFrequentLetter(cipher); // freebie cipher letter
      renderBoard();
      setControls(true);
      setStatus();

      // focus the first non-locked input
      var cells = board.querySelectorAll(".cryptogram-cell");
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i].getAttribute("data-cipher");
        if (inputs[c] && !inputs[c].disabled) { inputs[c].focus(); break; }
      }
    }

    function clearGuesses() {
      if (!solving) return;
      for (var c in inputs) {
        if (!Object.prototype.hasOwnProperty.call(inputs, c)) continue;
        if (inputs[c].disabled) continue; // keep the freebie
        inputs[c].value = "";
      }
      refreshPreview();
      // refocus first editable
      for (var c2 in inputs) {
        if (!Object.prototype.hasOwnProperty.call(inputs, c2)) continue;
        if (!inputs[c2].disabled) { inputs[c2].focus(); break; }
      }
    }

    function reveal() {
      if (!solving) return;
      solving = false;
      ended = true;
      setControls(false);
      clearFlash();
      // fill the solution everywhere
      for (var c in inputs) {
        if (!Object.prototype.hasOwnProperty.call(inputs, c)) continue;
        inputs[c].value = mapPlainFor(c);
      }
      refreshPreview();
      gameOver();
    }

    function gameOver() {
      var best = NERDBOX.getBest("cryptogram");
      var isBest = (best !== null && streak === best && streak > 0);
      showOverlay(
        '<div class="g-result"><div class="g-big">' + streak + '</div>' +
        '<div class="g-sub">' + (isBest ? "best! · " : "") + 'solved in a row</div>' +
        '<button class="g-btn">play again</button></div>',
        start
      );
    }

    function start() {
      clearFlash();
      overlay.classList.remove("show");
      board.classList.remove("cryptogram-good");
      streak = 0;
      setStatus();
      nextRound();
    }

    clearBtn.addEventListener("click", clearGuesses);
    revealBtn.addEventListener("click", reveal);

    // ---- initial start overlay ----
    setStatus();
    setControls(false);
    showOverlay(
      '<div class="g-result">' +
      '<div class="g-sub">decode the substitution cipher · one freebie letter · solve for a streak</div>' +
      '<button class="g-btn">start</button></div>',
      start
    );

    return function teardown() { clearFlash(); };
  }
});
