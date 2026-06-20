/* Make 24 — the classic hard arithmetic puzzle.
   Four numbers (each 1–9) are dealt as big tiles. Combine ALL FOUR, each used
   exactly once, with + − × ÷ and parentheses to make exactly 24. Type an
   expression (× and ÷ are accepted, or just * and /) and submit.

   Everything is vanilla JS and self-contained. NO eval / Function anywhere:
     • a hand-written recursive-descent parser evaluates the expression and,
       in the same pass, records every numeric literal so we can verify the
       four given numbers are each used exactly once (multiset check);
     • a brute-force solver (all value-combination orders × operators) decides
       whether a deal is solvable, so only solvable deals are ever dealt, and
       it can surface one concrete solution string on demand.

   Score = puzzles solved in a row (a streak); best is the longest streak. */
NERDBOX.injectStyle("make24", `
  .make24-wrap {
    position: relative; width: 100%; max-width: 520px;
    display: flex; flex-direction: column; align-items: center; gap: 1.3rem;
  }
  .make24-goal {
    font-family: "JetBrains Mono", monospace; font-size: 0.8rem;
    letter-spacing: 0.5px; color: var(--sub); text-align: center;
  }
  .make24-goal b { color: var(--accent); font-weight: 700; }
  .make24-tiles {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.7rem;
    width: 100%;
  }
  .make24-tile {
    aspect-ratio: 1 / 1; background: var(--bg-alt);
    border: 1px solid color-mix(in srgb, var(--text) 7%, transparent);
    border-radius: 16px; display: flex; align-items: center; justify-content: center;
    font-family: "JetBrains Mono", monospace; font-weight: 700;
    font-size: clamp(2rem, 11vw, 3.1rem); color: var(--text);
    user-select: none; transition: border-color 0.12s, box-shadow 0.12s, transform 0.1s;
  }
  .make24-tile.make24-used {
    border-color: var(--accent); color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent), 0 0 22px -10px var(--accent);
  }
  .make24-tile.make24-pop { animation: make24-pop 0.18s ease; }
  @keyframes make24-pop {
    0% { transform: scale(0.7); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }
  .make24-ops {
    display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center;
  }
  .make24-key {
    min-width: 2.6rem; padding: 0.45rem 0.6rem; background: var(--bg-alt);
    border: 1px solid var(--sub-alt); border-radius: 10px;
    color: var(--text); font-family: "JetBrains Mono", monospace;
    font-size: 1.15rem; font-weight: 500; cursor: pointer;
    transition: border-color 0.12s, background 0.12s, color 0.12s;
  }
  .make24-key:hover { border-color: var(--accent); color: var(--accent); }
  .make24-key:active { transform: translateY(1px); }
  .make24-key.make24-clear { color: var(--sub); }
  .make24-form { display: flex; gap: 0.6rem; width: 100%; }
  .make24-input {
    flex: 1; min-width: 0; background: var(--bg); color: var(--text);
    border: 1px solid var(--sub-alt); border-radius: 12px;
    padding: 0.7rem 0.9rem; text-align: center;
    font-family: "JetBrains Mono", monospace; font-size: 1.5rem; font-weight: 500;
    letter-spacing: 1px; transition: border-color 0.12s, box-shadow 0.12s;
  }
  .make24-input::placeholder { color: var(--sub); opacity: 0.6; }
  .make24-input:focus { outline: none; border-color: var(--accent); }
  .make24-input.make24-good { border-color: var(--go); box-shadow: 0 0 0 1px var(--go); }
  .make24-input.make24-bad { border-color: var(--error); box-shadow: 0 0 0 1px var(--error); }
  .make24-go { padding: 0.7rem 1.3rem; font-size: 1rem; white-space: nowrap; }
  .make24-msg {
    font-family: "JetBrains Mono", monospace; font-size: 0.92rem;
    min-height: 1.3em; text-align: center; color: var(--sub);
  }
  .make24-msg.make24-err { color: var(--error); }
  .make24-msg.make24-win { color: var(--go); }
  .make24-msg b { color: var(--accent); font-weight: 700; }
  .make24-actions { display: flex; gap: 0.7rem; flex-wrap: wrap; justify-content: center; }
  .make24-mini {
    background: transparent; border: 1px solid var(--sub-alt); color: var(--sub);
    border-radius: 10px; padding: 0.5rem 1rem; font-size: 0.88rem; cursor: pointer;
    font-family: inherit; transition: border-color 0.12s, color 0.12s;
  }
  .make24-mini:hover { border-color: var(--accent); color: var(--accent); }
`);

NERDBOX.register({
  id: "make24",
  name: "Make 24",
  tagline: "combine 4 numbers to make 24",
  category: "reasoning",
  difficulty: "hard",
  scoreMode: "max",
  formatScore: function (v) { return v + " solved"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><line x1="6.5" y1="17.5" x2="6.5" y2="17.5"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand, shuffle = ctx.util.shuffle;
    var EPS = 1e-6;

    var escapeHTML = function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    };

    /* ----------------------------------------------------------------
       SOLVER — does any arrangement of these values reach 24?
       Works on a list of numbers: repeatedly pick two, combine them with
       one of + − × ÷ (both orders for − and ÷), and recurse on the smaller
       list. This enumerates every operator choice and every parenthesization.
       Returns a solution expression string, or null if unsolvable.
       Each entry is { v: numericValue, s: expressionString }.
       ---------------------------------------------------------------- */
    function solveList(items) {
      if (items.length === 1) {
        return Math.abs(items[0].v - 24) < EPS ? items[0].s : null;
      }
      for (var i = 0; i < items.length; i++) {
        for (var j = 0; j < items.length; j++) {
          if (i === j) continue;
          var a = items[i], b = items[j];
          // rest = everything except positions i and j
          var rest = [];
          for (var k = 0; k < items.length; k++) {
            if (k !== i && k !== j) rest.push(items[k]);
          }
          var combos = [
            { v: a.v + b.v, s: "(" + a.s + "+" + b.s + ")" },
            { v: a.v * b.v, s: "(" + a.s + "*" + b.s + ")" },
            { v: a.v - b.v, s: "(" + a.s + "-" + b.s + ")" }
          ];
          if (Math.abs(b.v) > EPS) {
            combos.push({ v: a.v / b.v, s: "(" + a.s + "/" + b.s + ")" });
          }
          for (var c = 0; c < combos.length; c++) {
            var next = rest.concat([combos[c]]);
            var found = solveList(next);
            if (found) return found;
          }
        }
      }
      return null;
    }

    // Find one solution for an array of plain numbers (or null).
    function solveNumbers(nums) {
      var items = nums.map(function (n) { return { v: n, s: String(n) }; });
      return solveList(items);
    }

    /* ----------------------------------------------------------------
       PUZZLE GENERATION — deal four digits 1–9 and only accept the deal
       if the solver proves it reaches 24. Guaranteed solvable.
       ---------------------------------------------------------------- */
    function newPuzzle() {
      for (var tries = 0; tries < 4000; tries++) {
        var nums = [
          1 + rand(9), 1 + rand(9), 1 + rand(9), 1 + rand(9)
        ];
        var sol = solveNumbers(nums);
        if (sol) return { nums: nums, solution: sol };
      }
      // Extremely unlikely fallback — a known-solvable classic deal.
      return { nums: [4, 6, 6, 6], solution: solveNumbers([4, 6, 6, 6]) };
    }

    /* ----------------------------------------------------------------
       SAFE EXPRESSION PARSER (recursive descent, NO eval / Function).
       Grammar (standard precedence, left-associative):
         expr   = term (('+' | '-') term)*
         term   = factor (('*' | '/') factor)*
         factor = number | '(' expr ')'
       Multi-digit numbers supported. Unary +/- are NOT supported, which
       keeps the literal multiset unambiguous (each token is a real operand).
       On success returns { value, literals:[...] }; on any malformed input
       it throws so the caller can report "couldn't parse that".
       ---------------------------------------------------------------- */
    function evaluateExpression(src) {
      // Normalise the friendly operator glyphs to ASCII.
      var s = String(src)
        .replace(/×/g, "*")
        .replace(/÷/g, "/")
        .replace(/[−–—]/g, "-")  // unicode minus / en / em dash
        .replace(/\s+/g, "");

      if (s === "") throw new Error("empty");

      var literals = [];
      var pos = 0;

      function peek() { return s.charAt(pos); }

      function parseExpr() {
        var value = parseTerm();
        for (;;) {
          var ch = peek();
          if (ch === "+") { pos++; value += parseTerm(); }
          else if (ch === "-") { pos++; value -= parseTerm(); }
          else break;
        }
        return value;
      }

      function parseTerm() {
        var value = parseFactor();
        for (;;) {
          var ch = peek();
          if (ch === "*") { pos++; value *= parseFactor(); }
          else if (ch === "/") {
            pos++;
            var divisor = parseFactor();
            if (divisor === 0) throw new Error("divide by zero");
            value /= divisor;
          } else break;
        }
        return value;
      }

      function parseFactor() {
        var ch = peek();
        if (ch === "(") {
          pos++;
          var inner = parseExpr();
          if (peek() !== ")") throw new Error("missing )");
          pos++;
          return inner;
        }
        // a number literal (one or more digits)
        if (ch >= "0" && ch <= "9") {
          var start = pos;
          while (peek() >= "0" && peek() <= "9") pos++;
          var lit = parseInt(s.slice(start, pos), 10);
          literals.push(lit);
          return lit;
        }
        throw new Error("unexpected '" + (ch || "end") + "'");
      }

      var result = parseExpr();
      if (pos !== s.length) throw new Error("trailing '" + s.charAt(pos) + "'");
      return { value: result, literals: literals };
    }

    // Multiset equality: same numbers, same multiplicities, ignoring order.
    function sameMultiset(a, b) {
      if (a.length !== b.length) return false;
      var x = a.slice().sort(function (p, q) { return p - q; });
      var y = b.slice().sort(function (p, q) { return p - q; });
      for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
      return true;
    }

    /* ---------------------------------- state ---------------------------------- */
    var streak = 0;
    var puzzle = null;
    var solutionShown = false;
    var timers = [];
    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }

    /* ---------------------------------- DOM ---------------------------------- */
    var status = el("div", "g-status", "");
    var wrap = el("div", "make24-wrap");

    var goal = el("div", "make24-goal", 'make all four into exactly <b>24</b> — each used once');

    var tilesEl = el("div", "make24-tiles");
    var tiles = [];
    for (var t = 0; t < 4; t++) {
      var tile = el("div", "make24-tile", "");
      tilesEl.appendChild(tile);
      tiles.push(tile);
    }

    // on-screen operator / paren keypad (handy on touch)
    var ops = el("div", "make24-ops");
    var keys = ["+", "−", "×", "÷", "(", ")"];
    keys.forEach(function (label) {
      var b = el("button", "make24-key", escapeHTML(label));
      b.type = "button";
      b.addEventListener("click", function () { insertAtCursor(label); });
      ops.appendChild(b);
    });
    var clearKey = el("button", "make24-key make24-clear", "clear");
    clearKey.type = "button";
    clearKey.addEventListener("click", function () {
      input.value = ""; refreshUsage(); input.focus();
    });
    ops.appendChild(clearKey);

    var form = document.createElement("form");
    form.className = "make24-form";
    var input = document.createElement("input");
    input.type = "text";
    input.className = "make24-input";
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("spellcheck", "false");
    input.setAttribute("inputmode", "text");
    input.placeholder = "e.g. (3+1)*6";
    var goBtn = el("button", "g-btn make24-go", "make 24");
    goBtn.type = "submit";
    form.appendChild(input);
    form.appendChild(goBtn);

    var msg = el("div", "make24-msg", "");

    var actions = el("div", "make24-actions");
    var skipBtn = el("button", "make24-mini", "new numbers");
    skipBtn.type = "button";
    var solBtn = el("button", "make24-mini", "show a solution");
    solBtn.type = "button";
    actions.appendChild(skipBtn);
    actions.appendChild(solBtn);

    wrap.appendChild(goal);
    wrap.appendChild(tilesEl);
    wrap.appendChild(ops);
    wrap.appendChild(form);
    wrap.appendChild(msg);
    wrap.appendChild(actions);

    var overlay = el("div", "g-overlay");
    wrap.appendChild(overlay);

    root.appendChild(status);
    root.appendChild(wrap);

    /* ---------------------------------- helpers ---------------------------------- */
    function setStatus() {
      status.innerHTML =
        '<span class="gl-score">streak ' + streak + '</span>' +
        '<span class="gl-time">target 24</span>';
    }

    function insertAtCursor(text) {
      var start = input.selectionStart, end = input.selectionEnd;
      if (typeof start !== "number") { input.value += text; }
      else {
        var v = input.value;
        input.value = v.slice(0, start) + text + v.slice(end);
        var caret = start + text.length;
        try { input.setSelectionRange(caret, caret); } catch (e) {}
      }
      refreshUsage();
      input.focus();
    }

    // Highlight tiles whose digit currently appears (best-effort, by multiset)
    // so the player can see which numbers they've already placed.
    function refreshUsage() {
      var used;
      try {
        used = evaluateExpression(input.value).literals.slice();
      } catch (e) {
        used = [];
      }
      tiles.forEach(function (tile, idx) {
        var n = puzzle.nums[idx];
        var at = used.indexOf(n);
        if (at !== -1) { used.splice(at, 1); tile.classList.add("make24-used"); }
        else tile.classList.remove("make24-used");
      });
    }

    function showMsg(text, kind) {
      msg.className = "make24-msg" + (kind ? " make24-" + kind : "");
      msg.innerHTML = text; // callers pass already-escaped / trusted markup
    }

    function flashInput(kind) {
      input.classList.remove("make24-good", "make24-bad");
      void input.offsetWidth;
      input.classList.add("make24-" + kind);
      later(function () { input.classList.remove("make24-good", "make24-bad"); }, 600);
    }

    function deal(resetStreak) {
      if (resetStreak) streak = 0;
      puzzle = newPuzzle();
      solutionShown = false;
      input.value = "";
      input.disabled = false;
      goBtn.disabled = false;
      solBtn.disabled = false;
      tiles.forEach(function (tile, idx) {
        tile.textContent = String(puzzle.nums[idx]);
        tile.classList.remove("make24-used", "make24-pop");
        void tile.offsetWidth;
        tile.classList.add("make24-pop");
      });
      setStatus();
      showMsg("type an expression using all four numbers", "");
      later(function () { try { input.focus(); } catch (e) {} }, 0);
    }

    /* ---------------------------------- submit ---------------------------------- */
    function submit() {
      var raw = input.value.trim();
      if (raw === "") { input.focus(); return; }

      var parsed;
      try {
        parsed = evaluateExpression(raw);
      } catch (e) {
        flashInput("bad");
        showMsg("couldn't parse that — use the four numbers with + − × ÷ ( )", "err");
        return;
      }

      // Must use each given number exactly once (as a multiset).
      if (!sameMultiset(parsed.literals, puzzle.nums)) {
        flashInput("bad");
        showMsg("use each of the 4 numbers exactly once", "err");
        return;
      }

      // Must evaluate to 24.
      if (Math.abs(parsed.value - 24) >= EPS) {
        flashInput("bad");
        var shown = Number.isInteger(parsed.value)
          ? String(parsed.value)
          : (Math.round(parsed.value * 1000) / 1000);
        showMsg("that equals <b>" + escapeHTML(String(shown)) + "</b>, not 24", "err");
        return;
      }

      // Solved!
      streak++;
      setStatus();
      flashInput("good");
      var best = ctx.submitScore(streak);
      showMsg(
        "solved! " + (best ? "new best — " : "") + "streak <b>" + streak + "</b>",
        "win"
      );
      input.disabled = true;
      goBtn.disabled = true;
      solBtn.disabled = true;
      later(function () { deal(false); }, 950);
    }

    form.addEventListener("submit", function (e) { e.preventDefault(); submit(); });
    input.addEventListener("input", refreshUsage);

    skipBtn.addEventListener("click", function () {
      // Skipping resets the run only if a streak is in progress, mirroring
      // "show a solution" — a fresh deal you didn't solve breaks the chain.
      var hadStreak = streak > 0;
      deal(true);
      if (hadStreak) showMsg("new numbers — streak reset", "");
    });

    solBtn.addEventListener("click", function () {
      if (!puzzle || solutionShown) return;
      solutionShown = true;
      // Revealing a solution ends the current streak.
      streak = 0;
      setStatus();
      var pretty = puzzle.solution
        .replace(/\*/g, "×")
        .replace(/\//g, "÷");
      // Trim one layer of outermost parentheses for readability.
      if (/^\(.*\)$/.test(pretty)) {
        var inner = pretty.slice(1, -1), depth = 0, ok = true;
        for (var i = 0; i < inner.length; i++) {
          if (inner[i] === "(") depth++;
          else if (inner[i] === ")") { depth--; if (depth < 0) { ok = false; break; } }
        }
        if (ok && depth === 0) pretty = inner;
      }
      showMsg("one solution: <b>" + escapeHTML(pretty) + "</b> = 24", "");
    });

    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", function () {
        overlay.classList.remove("show");
        onPlay();
      });
      overlay.classList.add("show");
    }

    /* ---------------------------------- intro ---------------------------------- */
    // Seed the tiles with a first (solvable) deal behind the overlay so the
    // board looks alive, then start for real when the player hits start.
    puzzle = newPuzzle();
    tiles.forEach(function (tile, idx) { tile.textContent = String(puzzle.nums[idx]); });
    setStatus();
    status.textContent = "make 24 from four numbers · how long a streak?";
    showOverlay('<button class="g-btn">start</button>', function () { deal(true); });

    return function teardown() {
      timers.forEach(clearTimeout);
      timers = [];
    };
  }
});
