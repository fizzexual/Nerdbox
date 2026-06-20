/* Dual N-Back (dual 2-back) — the hard one. Each trial flashes BOTH a position
   in a 3x3 grid AND a letter, at the same time. Press POSITION if the current
   cell matches the cell 2 trials back; press LETTER if the current letter
   matches the letter 2 trials back. The two streams are independent, so a trial
   can match on both, one, or neither. 20 trials, ~2.5s each. */
NERDBOX.injectStyle("dualnback", `
  .dualnback-wrap { position: relative; width: 100%; max-width: 460px; display: flex; flex-direction: column; align-items: center; gap: 1.1rem; }
  .dualnback-stage { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 1.2rem 0; border-radius: 18px; background: var(--bg-alt); border: 3px solid var(--bg-alt); transition: border-color 0.12s ease; }
  .dualnback-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 222px; height: 222px; }
  .dualnback-cell { border-radius: 10px; background: var(--sub-alt); transition: background 0.1s ease, box-shadow 0.1s ease; }
  .dualnback-cell.dualnback-on { background: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent); }
  .dualnback-letter { font-family: "JetBrains Mono", monospace; font-size: 3.6rem; font-weight: 700; color: var(--text); line-height: 1; min-height: 1em; user-select: none; }
  .dualnback-letter.dualnback-dim { color: var(--sub-alt); }
  .dualnback-btns { display: flex; gap: 0.7rem; width: 100%; max-width: 460px; }
  .dualnback-btn { flex: 1; min-width: 0; }
  .dualnback-btn:disabled { opacity: 0.45; cursor: default; }
  .dualnback-btn.dualnback-armed { background: var(--go); }
  .dualnback-hint { font-family: "JetBrains Mono", monospace; font-size: 0.78rem; color: var(--sub); text-align: center; line-height: 1.5; }
  .dualnback-hint b { color: var(--accent); font-weight: 500; }
`);

NERDBOX.register({
  id: "dualnback",
  name: "Dual N-Back",
  tagline: "position AND letter, 2 steps back",
  category: "memory",
  difficulty: "hard",
  scoreMode: "max",
  formatScore: function (v) { return v + "%"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/><path d="M3 9h18"/><path d="M3 15h18"/><rect x="9" y="9" width="6" height="6" rx="0.5" fill="currentColor" stroke="none"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;

    var N = 2, TRIALS = 20, TRIAL_MS = 2500, GAP_MS = 450;
    var POS_RATE = 0.30, LET_RATE = 0.30;
    var LETTERS = "CHKLQRST".split("");
    var ELIGIBLE = (TRIALS - N) * 2;   // 18 trials * 2 modalities = 36

    // ---- timers: every setTimeout id is stored, cleared in teardown + finish ----
    var timers = [];
    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    function clearTimers() { for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers = []; }

    // ---- streams: position 0..8 and letter, each an INDEPENDENT ~30% match ----
    function buildStreams() {
      var pos = [], let_ = [], posMatch = [], letMatch = [];
      for (var i = 0; i < TRIALS; i++) {
        // POSITION stream
        var pm = false;
        if (i >= N && Math.random() < POS_RATE) {
          pos.push(pos[i - N]);                 // force a position match
          pm = true;
        } else {
          var p = rand(9);
          if (i >= N) { while (p === pos[i - N]) p = rand(9); }  // guarantee a real non-match
          pos.push(p);
        }
        posMatch.push(pm);

        // LETTER stream — generated independently of the position decision
        var lm = false;
        if (i >= N && Math.random() < LET_RATE) {
          let_.push(let_[i - N]);               // force a letter match
          lm = true;
        } else {
          var c = LETTERS[rand(LETTERS.length)];
          if (i >= N) { while (c === let_[i - N]) c = LETTERS[rand(LETTERS.length)]; }
          let_.push(c);
        }
        letMatch.push(lm);
      }
      return { pos: pos, let_: let_, posMatch: posMatch, letMatch: letMatch };
    }

    var data = null;
    var idx = -1;
    var correct = 0;
    var running = false;           // current trial is showing & answerable
    var posPressed = false, letPressed = false;

    // ---- DOM ----
    var status = el("div", "g-status", "");

    var stage = el("div", "dualnback-stage");
    var grid = el("div", "dualnback-grid");
    var cells = [];
    for (var k = 0; k < 9; k++) {
      var c = el("div", "dualnback-cell");
      cells.push(c);
      grid.appendChild(c);
    }
    var letter = el("div", "dualnback-letter dualnback-dim", "•");
    stage.appendChild(grid);
    stage.appendChild(letter);

    var btns = el("div", "dualnback-btns");
    var posBtn = el("button", "g-btn dualnback-btn", "POSITION");
    var letBtn = el("button", "g-btn dualnback-btn", "LETTER");
    posBtn.disabled = true;
    letBtn.disabled = true;
    posBtn.addEventListener("click", function () { pressPos(); });
    letBtn.addEventListener("click", function () { pressLet(); });
    btns.appendChild(posBtn);
    btns.appendChild(letBtn);

    var hint = el("div", "dualnback-hint",
      'press <b>POSITION</b> if the cell matches <b>2</b> back &middot; ' +
      'press <b>LETTER</b> if the letter matches <b>2</b> back');

    var overlay = el("div", "g-overlay");

    var wrap = el("div", "dualnback-wrap");
    wrap.appendChild(stage);
    wrap.appendChild(btns);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    function setStatus() {
      status.innerHTML =
        '<span>trial ' + (idx < 0 ? 0 : idx + 1) + ' / ' + TRIALS + '</span>' +
        '<span class="gl-score">correct ' + correct + ' / ' + ELIGIBLE + '</span>';
    }

    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      var b = overlay.querySelector("button");
      if (b) b.addEventListener("click", function () { overlay.classList.remove("show"); onPlay(); });
      overlay.classList.add("show");
    }

    function clearGrid() {
      for (var i = 0; i < cells.length; i++) cells[i].classList.remove("dualnback-on");
    }

    // ---- one press per modality per trial; extra presses ignored ----
    function pressPos() {
      if (!running || posPressed) return;
      posPressed = true;
      posBtn.classList.add("dualnback-armed");
      posBtn.disabled = true;
    }
    function pressLet() {
      if (!running || letPressed) return;
      letPressed = true;
      letBtn.classList.add("dualnback-armed");
      letBtn.disabled = true;
    }

    function resetButtons() {
      posBtn.classList.remove("dualnback-armed");
      letBtn.classList.remove("dualnback-armed");
    }

    function start() {
      clearTimers();
      overlay.classList.remove("show");
      data = buildStreams();
      idx = -1;
      correct = 0;
      running = false;
      posPressed = letPressed = false;
      clearGrid();
      resetButtons();
      stage.style.borderColor = "";
      letter.className = "dualnback-letter dualnback-dim";
      letter.textContent = "•";
      posBtn.disabled = letBtn.disabled = true;
      setStatus();
      later(nextTrial, 450);
    }

    function nextTrial() {
      idx++;
      if (idx >= TRIALS) { finish(); return; }
      running = true;
      posPressed = letPressed = false;
      resetButtons();
      posBtn.disabled = letBtn.disabled = false;
      stage.style.borderColor = "";
      // present BOTH stimuli at once
      clearGrid();
      cells[data.pos[idx]].classList.add("dualnback-on");
      letter.className = "dualnback-letter";
      letter.textContent = data.let_[idx];
      setStatus();
      later(endTrial, TRIAL_MS);
    }

    function endTrial() {
      running = false;
      posBtn.disabled = letBtn.disabled = true;

      // per-modality scoring (only modalities count, only from index N on)
      var posOK = true, letOK = true;
      if (idx >= N) {
        var pm = data.posMatch[idx];
        var lm = data.letMatch[idx];
        posOK = (pm && posPressed) || (!pm && !posPressed);
        letOK = (lm && letPressed) || (!lm && !letPressed);
        if (posOK) correct++;
        if (letOK) correct++;
      }

      // brief feedback on the stage border (green only if both decisions right)
      var bothOK = posOK && letOK;
      stage.style.borderColor = (idx < N)
        ? ""
        : (bothOK ? "var(--go)" : "var(--error)");
      clearGrid();
      letter.className = "dualnback-letter dualnback-dim";
      letter.textContent = "•";
      setStatus();

      later(function () {
        stage.style.borderColor = "";
        nextTrial();
      }, GAP_MS);
    }

    function finish() {
      clearTimers();
      running = false;
      posBtn.disabled = letBtn.disabled = true;
      resetButtons();
      clearGrid();
      stage.style.borderColor = "";
      letter.className = "dualnback-letter dualnback-dim";
      letter.textContent = "•";

      var accuracy = Math.round(100 * correct / ELIGIBLE);
      var best = ctx.submitScore(accuracy);
      idx = TRIALS;
      status.innerHTML = '<span>done &mdash; ' + correct + ' / ' + ELIGIBLE + ' decisions correct</span>';
      showOverlay(
        '<div class="g-result"><div class="g-big">' + accuracy + '%</div>' +
        '<div class="g-sub">' + (best ? "new best! &middot; " : "") + 'dual 2-back accuracy</div>' +
        '<button class="g-btn">play again</button></div>',
        start
      );
    }

    // ---- initial start overlay ----
    setStatus();
    showOverlay(
      '<div class="g-result">' +
      '<div class="g-sub">' + TRIALS + ' trials &middot; track position AND letter, 2 back</div>' +
      '<button class="g-btn">start</button></div>',
      start
    );

    return function teardown() { clearTimers(); };
  }
});
