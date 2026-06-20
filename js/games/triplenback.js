/* Triple N-Back (triple 2-back) — the brutal one. Each trial flashes THREE
   simultaneous streams in a 3x3 grid: a POSITION (which cell lights), a LETTER
   (a consonant shown in that cell), and a COLOR (the highlight hue). Each stream
   is independent and matches if it equals its value 2 trials back. Press A for a
   position match, S for a colour match, L for a letter match. 22 trials. */
NERDBOX.injectStyle("triplenback", `
  .tnb-wrap { position: relative; width: 100%; max-width: 460px; display: flex; flex-direction: column; align-items: center; gap: 1.1rem; }
  .tnb-stage { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 1.2rem 0; border-radius: 18px; background: var(--bg-alt); border: 3px solid var(--bg-alt); transition: border-color 0.12s ease; }
  .tnb-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 222px; height: 222px; }
  .tnb-cell { position: relative; border-radius: 10px; background: var(--sub-alt); display: flex; align-items: center; justify-content: center; transition: background 0.1s ease, box-shadow 0.1s ease; }
  .tnb-cell.tnb-on { box-shadow: 0 0 0 2px color-mix(in srgb, var(--text) 30%, transparent); }
  .tnb-glyph { font-family: "JetBrains Mono", monospace; font-size: 2.6rem; font-weight: 700; line-height: 1; color: var(--bg); user-select: none; }
  .tnb-hint { font-family: "JetBrains Mono", monospace; font-size: 0.78rem; color: var(--sub); text-align: center; line-height: 1.5; }
  .tnb-hint b { color: var(--accent); font-weight: 500; }
  .tnb-btns { display: flex; gap: 0.6rem; width: 100%; max-width: 460px; }
  .tnb-btn { flex: 1; min-width: 0; }
  .tnb-btn:disabled { opacity: 0.45; cursor: default; }
  .tnb-btn.tnb-armed { background: var(--accent); color: var(--bg); }
  .tnb-count { font-family: "JetBrains Mono", monospace; font-size: 4rem; font-weight: 700; color: var(--accent); line-height: 1; }
  .tnb-rows { font-family: "JetBrains Mono", monospace; font-size: 0.85rem; color: var(--sub); line-height: 1.7; margin: 0.3rem 0 0.2rem; }
  .tnb-rows b { color: var(--text); font-weight: 500; }
`);

NERDBOX.register({
  id: "triplenback",
  name: "Triple N-Back",
  tagline: "three streams, all at once",
  category: "memory",
  difficulty: "extreme",
  scoreMode: "max",
  formatScore: function (v) { return v + "%"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="5" rx="1"/><rect x="4" y="9.5" width="16" height="5" rx="1"/><rect x="4" y="16" width="16" height="5" rx="1"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;

    var N = 2, TRIALS = 22, TRIAL_MS = 2800;
    var RATE = 0.30;
    var LETTERS = "BCDFGHKLMNPQRST".split("");
    // four distinct highlight colours: accent + error from theme, plus two fixed hues
    var COLORS = [ctx.themeColor("--accent"), ctx.themeColor("--error"), "#4f8df0", "#4caf72"];
    var SCORABLE = TRIALS - N;          // trials 3..22 are scored (20 trials)

    // ---- timers: every handle stored, all cleared in teardown + finish ----
    var timers = [];
    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    function clearTimers() { for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers = []; }

    // ---- build three INDEPENDENT streams, each matching ~30% of the time ----
    function buildStream(maxVal) {
      var seq = [], match = [];
      for (var i = 0; i < TRIALS; i++) {
        var m = false;
        if (i >= N && Math.random() < RATE) {
          seq.push(seq[i - N]);                  // force a match
          m = true;
        } else {
          var v = rand(maxVal);
          if (i >= N) { var guard = 0; while (v === seq[i - N] && guard++ < 50) v = rand(maxVal); }
          seq.push(v);
        }
        match.push(m);
      }
      return { seq: seq, match: match };
    }

    var pos = null, col = null, ltr = null;
    var idx = -1;
    var running = false;                  // current trial is showing & answerable
    var pressed = { a: false, s: false, l: false };
    // per-stream tallies of correct decisions over scorable trials
    var got = { a: 0, s: 0, l: 0 };

    // ---- DOM ----
    var status = el("div", "g-status", "");
    var stage = el("div", "tnb-stage");
    var grid = el("div", "tnb-grid");
    var cells = [], glyphs = [];
    for (var k = 0; k < 9; k++) {
      var c = el("div", "tnb-cell");
      var g = el("div", "tnb-glyph", "");
      c.appendChild(g);
      cells.push(c); glyphs.push(g);
      grid.appendChild(c);
    }
    stage.appendChild(grid);

    var btns = el("div", "tnb-btns");
    var aBtn = el("button", "g-btn tnb-btn", "A position");
    var sBtn = el("button", "g-btn tnb-btn", "S colour");
    var lBtn = el("button", "g-btn tnb-btn", "L letter");
    aBtn.disabled = sBtn.disabled = lBtn.disabled = true;
    aBtn.addEventListener("click", function () { press("a"); });
    sBtn.addEventListener("click", function () { press("s"); });
    lBtn.addEventListener("click", function () { press("l"); });
    btns.appendChild(aBtn); btns.appendChild(sBtn); btns.appendChild(lBtn);
    var btnOf = { a: aBtn, s: sBtn, l: lBtn };

    var hint = el("div", "tnb-hint",
      '<b>A</b> position &middot; <b>S</b> colour &middot; <b>L</b> letter &mdash; ' +
      'flag any that match <b>2</b> trials back');

    var overlay = el("div", "g-overlay");

    var wrap = el("div", "tnb-wrap");
    wrap.appendChild(stage);
    wrap.appendChild(btns);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    function setStatus() {
      var done = got.a + got.s + got.l;
      var total = SCORABLE * 3;
      status.innerHTML =
        '<span>trial ' + (idx < 0 ? 0 : Math.min(idx + 1, TRIALS)) + ' / ' + TRIALS + '</span>' +
        '<span class="gl-score">correct ' + done + ' / ' + total + '</span>';
    }

    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      var b = overlay.querySelector("button");
      if (b) b.addEventListener("click", function () { overlay.classList.remove("show"); onPlay(); });
      overlay.classList.add("show");
    }

    function clearGrid() {
      for (var i = 0; i < cells.length; i++) {
        cells[i].classList.remove("tnb-on");
        cells[i].style.background = "";
        glyphs[i].textContent = "";
      }
    }

    function resetButtons() {
      aBtn.classList.remove("tnb-armed");
      sBtn.classList.remove("tnb-armed");
      lBtn.classList.remove("tnb-armed");
    }

    // ---- one press per stream per trial; extras ignored ----
    function press(key) {
      if (!running || pressed[key]) return;
      pressed[key] = true;
      btnOf[key].classList.add("tnb-armed");
    }

    function onKey(e) {
      var k = (e.key || "").toLowerCase();
      if (k === "a" || k === "s" || k === "l") { press(k); }
    }
    document.addEventListener("keydown", onKey);

    function start() {
      clearTimers();
      overlay.classList.remove("show");
      pos = buildStream(9);
      col = buildStream(COLORS.length);
      ltr = buildStream(LETTERS.length);
      idx = -1;
      running = false;
      pressed.a = pressed.s = pressed.l = false;
      got.a = got.s = got.l = 0;
      clearGrid();
      resetButtons();
      stage.style.borderColor = "";
      aBtn.disabled = sBtn.disabled = lBtn.disabled = true;
      setStatus();
      countdown(3);
    }

    function countdown(n) {
      if (n <= 0) { later(nextTrial, 300); return; }
      showOverlay('<div class="g-result"><div class="tnb-count">' + n + '</div></div>', function () {});
      var ovBtn = overlay.querySelector("button"); // none, but keep overlay non-dismissible
      if (ovBtn) ovBtn.disabled = true;
      later(function () { overlay.classList.remove("show"); countdown(n - 1); }, 700);
    }

    function nextTrial() {
      idx++;
      if (idx >= TRIALS) { finish(); return; }
      running = true;
      pressed.a = pressed.s = pressed.l = false;
      resetButtons();
      aBtn.disabled = sBtn.disabled = lBtn.disabled = false;
      stage.style.borderColor = "";
      // present ALL THREE stimuli at once
      clearGrid();
      var cell = cells[pos.seq[idx]];
      cell.classList.add("tnb-on");
      cell.style.background = COLORS[col.seq[idx]];
      glyphs[pos.seq[idx]].textContent = LETTERS[ltr.seq[idx]];
      setStatus();
      later(endTrial, TRIAL_MS);
    }

    function score1(stream, key) {
      var m = stream.match[idx];
      var hit = (m && pressed[key]) || (!m && !pressed[key]);
      if (hit) got[key]++;
      return hit;
    }

    function endTrial() {
      running = false;
      aBtn.disabled = sBtn.disabled = lBtn.disabled = true;

      var allOK = true;
      if (idx >= N) {
        var a = score1(pos, "a");
        var s = score1(col, "s");
        var l = score1(ltr, "l");
        allOK = a && s && l;
      }

      stage.style.borderColor = (idx < N) ? "" : (allOK ? "var(--go)" : "var(--error)");
      clearGrid();
      setStatus();

      later(function () {
        stage.style.borderColor = "";
        nextTrial();
      }, 450);
    }

    function finish() {
      clearTimers();
      running = false;
      aBtn.disabled = sBtn.disabled = lBtn.disabled = true;
      resetButtons();
      clearGrid();
      stage.style.borderColor = "";

      var total = SCORABLE * 3;
      var correct = got.a + got.s + got.l;
      var accuracy = Math.round(100 * correct / total);
      var best = ctx.submitScore(accuracy);
      idx = TRIALS;
      var pct = function (n) { return Math.round(100 * n / SCORABLE); };
      status.innerHTML = '<span>done &mdash; ' + correct + ' / ' + total + ' decisions correct</span>';
      showOverlay(
        '<div class="g-result"><div class="g-big">' + accuracy + '%</div>' +
        '<div class="g-sub">' + (best ? "new best! &middot; " : "") + 'triple 2-back accuracy</div>' +
        '<div class="tnb-rows">' +
          'position <b>' + pct(got.a) + '%</b> &middot; ' +
          'colour <b>' + pct(got.s) + '%</b> &middot; ' +
          'letter <b>' + pct(got.l) + '%</b>' +
        '</div>' +
        '<button class="g-btn">play again</button></div>',
        start
      );
    }

    // ---- initial start overlay ----
    setStatus();
    showOverlay(
      '<div class="g-result">' +
      '<div class="g-sub">' + TRIALS + ' trials &middot; track position, colour AND letter, 2 back</div>' +
      '<button class="g-btn">start</button></div>',
      start
    );

    return function teardown() {
      clearTimers();
      document.removeEventListener("keydown", onKey);
      running = false;
    };
  }
});
