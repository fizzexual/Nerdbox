/* N-Back (2-back) — a stream of letters appears one at a time. Press MATCH
   whenever the current letter is the same as the one shown 2 steps back. */
NERDBOX.injectStyle("nback", `
  .nback-wrap { position: relative; width: 100%; max-width: 480px; display: flex; flex-direction: column; align-items: center; gap: 1.1rem; }
  .nback-card { width: 100%; aspect-ratio: 7 / 5; max-height: 320px; border-radius: 18px; background: var(--bg-alt); display: flex; align-items: center; justify-content: center; border: 3px solid var(--bg-alt); transition: border-color 0.12s ease, background 0.12s ease; }
  .nback-letter { font-family: "JetBrains Mono", monospace; font-size: 6rem; font-weight: 700; color: var(--text); line-height: 1; user-select: none; }
  .nback-card.nback-empty .nback-letter { color: var(--sub-alt); }
  .nback-card.nback-good { border-color: var(--go); background: color-mix(in srgb, var(--go) 16%, var(--bg-alt)); }
  .nback-card.nback-bad { border-color: var(--error); background: color-mix(in srgb, var(--error) 16%, var(--bg-alt)); }
  .nback-match { min-width: 240px; }
  .nback-match:disabled { opacity: 0.45; cursor: default; }
  .nback-hint { font-family: "JetBrains Mono", monospace; font-size: 0.8rem; color: var(--sub); text-align: center; }
  .nback-hint b { color: var(--accent); font-weight: 500; }
`);

NERDBOX.register({
  id: "nback",
  name: "N-Back",
  tagline: "match the letter from 2 steps back",
  category: "memory",
  scoreMode: "max",
  formatScore: function (v) { return v + "%"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5H7"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;
    var N = 2, TRIALS = 20, SHOW_MS = 2200, GAP_MS = 500;
    var LETTERS = "BCDFGHJKLMNPQRSTVWXZ".split("");

    var timers = [];
    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    function clearTimers() { for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers = []; }

    // ---- build a stream where ~35% of trials (from index N on) are matches ----
    function buildStream() {
      var stream = [], match = [];
      for (var i = 0; i < TRIALS; i++) {
        var isMatch = false;
        if (i >= N && Math.random() < 0.35) {
          stream.push(stream[i - N]);            // same letter as N back
          isMatch = true;
        } else {
          var c = LETTERS[rand(LETTERS.length)];
          if (i >= N) {                          // ensure a real non-match
            while (c === stream[i - N]) c = LETTERS[rand(LETTERS.length)];
          }
          stream.push(c);
        }
        match.push(isMatch);
      }
      return { stream: stream, match: match };
    }

    var data = null;          // { stream, match }
    var pressed = [];         // per-trial: did player press?
    var idx = -1;             // current trial index
    var correct = 0;
    var running = false;      // a letter is currently showing & answerable

    // ---- DOM ----
    var status = el("div", "g-status", "");
    var card = el("div", "nback-card nback-empty");
    var letter = el("div", "nback-letter", "•");
    card.appendChild(letter);
    var matchBtn = el("button", "g-btn nback-match", "MATCH (2-back)");
    matchBtn.disabled = true;
    matchBtn.addEventListener("click", press);
    var hint = el("div", "nback-hint", 'press <b>MATCH</b> when this letter equals the one <b>2</b> back');

    var overlay = el("div", "g-overlay");
    var wrap = el("div", "nback-wrap");
    wrap.appendChild(card);
    wrap.appendChild(matchBtn);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    function setStatus() {
      status.innerHTML =
        '<span>trial ' + (idx + 1) + ' / ' + TRIALS + '</span>' +
        '<span class="gl-score">correct ' + correct + '</span>';
    }

    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      var b = overlay.querySelector("button");
      if (b) b.addEventListener("click", function () { overlay.classList.remove("show"); onPlay(); });
      overlay.classList.add("show");
    }

    // ---- a single press during the current trial (extra presses ignored) ----
    function press() {
      if (!running || pressed[idx]) return;
      pressed[idx] = true;
      matchBtn.disabled = true;          // one answer per trial
    }

    function start() {
      clearTimers();
      overlay.classList.remove("show");
      data = buildStream();
      pressed = [];
      idx = -1;
      correct = 0;
      running = false;
      card.className = "nback-card nback-empty";
      letter.textContent = "•";
      setStatus();
      later(nextTrial, 450);
    }

    function nextTrial() {
      idx++;
      if (idx >= TRIALS) { finish(); return; }
      pressed[idx] = false;
      running = true;
      matchBtn.disabled = false;
      card.className = "nback-card";
      letter.textContent = data.stream[idx];
      setStatus();
      // letter visible for SHOW_MS, then score + brief feedback gap
      later(endTrial, SHOW_MS);
    }

    function endTrial() {
      running = false;
      matchBtn.disabled = true;
      var isMatch = data.match[idx];
      var didPress = pressed[idx];
      var ok = (isMatch && didPress) || (!isMatch && !didPress);
      if (ok) correct++;
      card.classList.remove("nback-empty");
      card.classList.add(ok ? "nback-good" : "nback-bad");
      setStatus();
      later(function () {
        card.classList.remove("nback-good", "nback-bad");
        nextTrial();
      }, GAP_MS);
    }

    function finish() {
      clearTimers();
      running = false;
      matchBtn.disabled = true;
      card.className = "nback-card nback-empty";
      letter.textContent = "•";
      var accuracy = Math.round(100 * correct / TRIALS);
      var best = ctx.submitScore(accuracy);
      status.innerHTML = '<span>done — ' + correct + ' / ' + TRIALS + ' correct</span>';
      showOverlay(
        '<div class="g-result"><div class="g-big">' + accuracy + '%</div>' +
        '<div class="g-sub">' + (best ? "new best! · " : "") + 'accuracy</div>' +
        '<button class="g-btn">play again</button></div>',
        start
      );
    }

    // ---- initial start overlay ----
    status.innerHTML = '<span>trial 0 / ' + TRIALS + '</span><span class="gl-score">correct 0</span>';
    showOverlay(
      '<div class="g-result"><div class="g-sub">' + TRIALS + ' letters · press MATCH on a 2-back repeat</div>' +
      '<button class="g-btn">start</button></div>',
      start
    );

    return function teardown() { clearTimers(); };
  }
});
