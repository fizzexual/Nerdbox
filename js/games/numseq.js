/* Number Sequence — a 5-term sequence is shown followed by "?", e.g.
   "2, 4, 8, 16, ?". Type the next number. Sequences are generated
   programmatically from a known rule, so the answer is always derivable.
   Correct -> streak++ and a slightly harder mix; wrong -> game over,
   the answer + rule name are revealed. Best score = longest streak. */
NERDBOX.injectStyle("numseq", "\
.numseq-wrap { position: relative; width: 100%; max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 1.3rem; }\
.numseq-seq { font-family: \"JetBrains Mono\", monospace; font-size: 2rem; font-weight: 500; color: var(--text); text-align: center; line-height: 1.35; letter-spacing: 1px; word-break: break-word; min-height: 1.4em; transition: color 0.12s; }\
.numseq-seq .numseq-q { color: var(--accent); }\
.numseq-form { display: flex; gap: 0.6rem; align-items: stretch; width: 100%; max-width: 420px; }\
.numseq-input { flex: 1; min-width: 0; font-family: \"JetBrains Mono\", monospace; font-size: 1.3rem; text-align: center; color: var(--text); background: var(--bg-alt); border: 2px solid var(--sub-alt); border-radius: 10px; padding: 0.7rem 0.9rem; transition: border-color 0.12s, box-shadow 0.12s; }\
.numseq-input::placeholder { color: var(--sub); }\
.numseq-input::-webkit-outer-spin-button, .numseq-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }\
.numseq-input[type=number] { -moz-appearance: textfield; }\
.numseq-input:focus { outline: none; border-color: var(--accent); }\
.numseq-form.numseq-ok .numseq-input { border-color: var(--go); box-shadow: 0 0 0 3px color-mix(in srgb, var(--go) 28%, transparent); }\
.numseq-form.numseq-bad .numseq-input { border-color: var(--error); box-shadow: 0 0 0 3px color-mix(in srgb, var(--error) 28%, transparent); }\
.numseq-go { flex: 0 0 auto; }\
.numseq-feedback { font-family: \"JetBrains Mono\", monospace; font-size: 0.9rem; text-align: center; min-height: 1.4em; color: var(--sub); }\
.numseq-feedback.numseq-ok { color: var(--go); }\
.numseq-feedback b { color: var(--text); font-weight: 500; }\
.numseq-streak { color: var(--accent); }\
.numseq-rule b { color: var(--accent); font-weight: 500; }\
");

NERDBOX.register({
  id: "numseq",
  name: "Number Sequence",
  tagline: "what number comes next?",
  category: "reasoning",
  scoreMode: "max",
  formatScore: function (v) { return v + " streak"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3v10"/><path d="M11 9a2.5 2.5 0 1 1 4.4 1.6L11 17h5"/><path d="M3.5 17h3"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;
    var TERMS = 5; // visible terms before the "?"

    // ---- helpers ----
    function ri(min, max) { return min + rand(max - min + 1); } // inclusive int in [min,max]
    function pick(arr) { return arr[rand(arr.length)]; }
    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    /* Each generator returns { terms: [n0..n4, next], rule: "label" }.
       The last element of `terms` is the correct answer. Every term is
       produced by the SAME formula/recurrence the rule describes, so the
       stored answer is guaranteed consistent. `level` (0+) gently widens
       the parameter ranges as the streak grows. */
    var GENERATORS = [
      // arithmetic: start + k*i
      function (level) {
        var start = ri(-6, 12);
        var k = pick([2, 3, 3, 4, 5, 6, 7, -2, -3, -4]);
        if (level >= 4) k = pick([2, 3, 4, 5, 6, 7, 8, 9, 11, -3, -4, -5, -7]);
        var t = [];
        for (var i = 0; i <= TERMS; i++) t.push(start + k * i);
        return { terms: t, rule: "arithmetic " + (k >= 0 ? "+" : "−") + Math.abs(k) };
      },
      // geometric: start * r^i  (kept small to avoid huge numbers)
      function (level) {
        var r = pick([2, 2, 3, 3]);
        if (level >= 3 && Math.random() < 0.4) r = pick([2, 3, 4]);
        var start = r === 2 ? ri(1, 5) : (r === 3 ? ri(1, 3) : 1);
        var t = [], v = start;
        for (var i = 0; i <= TERMS; i++) { t.push(v); v = v * r; }
        return { terms: t, rule: "geometric ×" + r };
      },
      // squares: (i + b)^2  -> consecutive perfect squares, offset by b
      function (level) {
        var b = ri(1, level >= 4 ? 7 : 4);
        var t = [];
        for (var i = 0; i <= TERMS; i++) { var n = i + b; t.push(n * n); }
        return { terms: t, rule: "perfect squares" };
      },
      // triangular numbers: T(i+b) = (i+b)(i+b+1)/2
      function (level) {
        var b = ri(1, level >= 4 ? 6 : 3);
        var t = [];
        for (var i = 0; i <= TERMS; i++) { var n = i + b; t.push(n * (n + 1) / 2); }
        return { terms: t, rule: "triangular numbers" };
      },
      // fibonacci-like: each term = sum of previous two
      function (level) {
        var a = ri(1, 4), b = ri(a, a + 4);
        if (level >= 4) { a = ri(1, 6); b = ri(a, a + 6); }
        var t = [a, b];
        for (var i = 2; i <= TERMS; i++) t.push(t[i - 1] + t[i - 2]);
        return { terms: t, rule: "sum of previous two" };
      },
      // alternating add: +p, +q, +p, +q, ...
      function (level) {
        var p = pick([2, 3, 4, 5]);
        var q = pick([2, 3, 4, 5, 6, 7]);
        while (q === p) q = pick([2, 3, 4, 5, 6, 7]); // ensure they differ
        if (level >= 4) { p = pick([2, 3, 4, 5, 6]); q = pick([3, 4, 5, 6, 7, 8]); while (q === p) q = pick([3, 4, 5, 6, 7, 8]); }
        var start = ri(1, 9), t = [start], v = start;
        for (var i = 0; i < TERMS; i++) { v += (i % 2 === 0) ? p : q; t.push(v); }
        return { terms: t, rule: "alternating +" + p + " / +" + q };
      },
      // add increasing: differences are step, 2*step, 3*step, ...
      function (level) {
        var start = ri(1, 8);
        var step = pick([1, 1, 2, 3]);
        if (level >= 4) step = pick([1, 2, 3, 4]);
        var t = [start], v = start;
        for (var i = 1; i <= TERMS; i++) { v += step * i; t.push(v); }
        return { terms: t, rule: step === 1 ? "add increasing (+1,+2,+3…)" : "add increasing (×" + step + ")" };
      }
    ];

    // Build a puzzle. `level` rises with the streak; harder generators are
    // unlocked progressively, and a cap keeps geometric values reasonable.
    function makePuzzle(streak) {
      var level = streak;
      // which generator indices are allowed at this level
      var pool;
      if (streak < 2)      pool = [0, 0, 5, 6];                 // arithmetic / alternating / add-increasing
      else if (streak < 4) pool = [0, 1, 2, 5, 6];             // + geometric, squares
      else if (streak < 7) pool = [0, 1, 2, 3, 4, 5, 6];       // + triangular, fibonacci
      else                 pool = [1, 2, 3, 4, 4, 6];          // lean into trickier patterns
      var puzzle, guard = 0;
      do {
        puzzle = GENERATORS[pick(pool)](level);
        guard++;
      } while (guard < 30 && !valid(puzzle));
      if (!valid(puzzle)) puzzle = GENERATORS[0](0); // safe fallback (simple arithmetic)
      return puzzle;
    }

    // Sanity guard: all terms are finite integers within a reasonable range.
    function valid(p) {
      if (!p || !p.terms || p.terms.length !== TERMS + 1) return false;
      for (var i = 0; i < p.terms.length; i++) {
        var n = p.terms[i];
        if (typeof n !== "number" || !isFinite(n) || Math.floor(n) !== n) return false;
        if (Math.abs(n) > 100000) return false; // keep numbers readable
      }
      return true;
    }

    // ---- DOM ----
    var status = el("div", "g-status", "");
    var wrap = el("div", "numseq-wrap");
    var seqEl = el("div", "numseq-seq");
    var form = el("form", "numseq-form");
    var input = el("input", "numseq-input");
    input.type = "number";
    input.step = "1";
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("spellcheck", "false");
    input.placeholder = "next number";
    var go = el("button", "g-btn numseq-go", "go");
    go.type = "submit";
    var feedback = el("div", "numseq-feedback");
    form.appendChild(input); form.appendChild(go);
    wrap.appendChild(seqEl); wrap.appendChild(form); wrap.appendChild(feedback);

    var overlay = el("div", "g-overlay");
    wrap.appendChild(overlay);
    root.appendChild(status); root.appendChild(wrap);

    // ---- state ----
    var streak = 0;
    var cur = null;        // current puzzle { terms, rule }
    var answer = null;     // correct next value
    var running = false;
    var flashT = null;

    function updateStatus() {
      status.innerHTML = '<span class="numseq-streak">streak ' + streak + '</span>';
    }

    function renderSeq() {
      var shown = cur.terms.slice(0, TERMS).join(", ");
      seqEl.innerHTML = esc(shown) + ', <span class="numseq-q">?</span>';
    }

    function nextRound() {
      cur = makePuzzle(streak);
      answer = cur.terms[TERMS];
      renderSeq();
      input.value = "";
      input.disabled = false;
      go.disabled = false;
      // auto-focus the input each round
      input.focus();
    }

    function flash(cls) {
      form.classList.remove("numseq-ok", "numseq-bad");
      void form.offsetWidth; // restart transition on consecutive flashes
      form.classList.add(cls);
      clearTimeout(flashT);
      flashT = setTimeout(function () { form.classList.remove("numseq-ok", "numseq-bad"); }, 450);
    }

    function submit() {
      if (!running || !cur) return;
      var raw = input.value.trim();
      // validate: must be a (signed) integer
      if (!/^[-+]?\d+$/.test(raw)) {
        feedback.className = "numseq-feedback numseq-bad";
        feedback.textContent = "enter a whole number";
        flash("numseq-bad");
        input.focus();
        input.select();
        return;
      }
      var guess = parseInt(raw, 10);
      if (guess === answer) {
        streak++;
        updateStatus();
        feedback.className = "numseq-feedback numseq-ok";
        feedback.textContent = "correct!";
        flash("numseq-ok");
        ctx.submitScore(streak);
        nextRound();
      } else {
        gameOver(guess);
      }
    }

    function gameOver(guess) {
      running = false;
      input.disabled = true;
      go.disabled = true;
      clearTimeout(flashT);
      form.classList.remove("numseq-ok", "numseq-bad");
      var reached = streak;
      var best = ctx.submitScore(reached);
      // reveal the full sequence with the answer in place of "?"
      seqEl.innerHTML = esc(cur.terms.slice(0, TERMS).join(", ")) +
        ', <span class="numseq-q">' + esc(answer) + '</span>';
      feedback.className = "numseq-feedback";
      feedback.textContent = "";
      updateStatus();
      overlay.innerHTML =
        '<div class="g-result">' +
        '<div class="g-big">' + reached + '</div>' +
        '<div class="g-sub">streak' + (best ? ' &middot; new best!' : '') + '</div>' +
        '<div class="numseq-rule">answer <b>' + esc(answer) + '</b> &middot; ' + esc(cur.rule) + '</div>' +
        '<button class="g-btn">play again</button></div>';
      overlay.querySelector("button").addEventListener("click", start);
      overlay.classList.add("show");
    }

    function start() {
      running = true;
      streak = 0;
      overlay.classList.remove("show");
      feedback.className = "numseq-feedback";
      feedback.textContent = "";
      updateStatus();
      nextRound();
    }

    form.addEventListener("submit", function (e) { e.preventDefault(); submit(); });

    // ---- intro ----
    updateStatus();
    seqEl.innerHTML = '2, 4, 8, 16, <span class="numseq-q">?</span>';
    feedback.innerHTML = 'figure out the rule, type the next number';
    overlay.innerHTML =
      '<div class="g-result">' +
      '<div class="g-sub">spot the pattern &middot; how long can your streak get?</div>' +
      '<button class="g-btn">start</button></div>';
    overlay.querySelector("button").addEventListener("click", start);
    overlay.classList.add("show");

    return function teardown() { clearTimeout(flashT); };
  }
});
