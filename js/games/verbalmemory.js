/* Verbal Memory (Human-Benchmark style) — one word at a time. Press SEEN if the
   word has appeared before, NEW if it hasn't. Correct = +1 point. A miss costs a
   life; out of 3 lives ends the run. Score = points before running out of lives. */
NERDBOX.injectStyle("verbalmemory", `
  .verbalmemory-wrap { position: relative; width: 100%; max-width: 520px; display: flex; flex-direction: column; align-items: center; gap: 1.4rem; }
  .verbalmemory-stage { width: 100%; min-height: 200px; border-radius: 18px; background: var(--bg-alt); border: 3px solid var(--bg-alt); display: flex; align-items: center; justify-content: center; padding: 1.4rem; transition: border-color 0.12s ease, background 0.12s ease; }
  .verbalmemory-stage.verbalmemory-good { border-color: var(--go); background: color-mix(in srgb, var(--go) 14%, var(--bg-alt)); }
  .verbalmemory-stage.verbalmemory-bad { border-color: var(--error); background: color-mix(in srgb, var(--error) 14%, var(--bg-alt)); }
  .verbalmemory-word { font-family: "JetBrains Mono", monospace; font-size: 3.4rem; font-weight: 700; color: var(--text); line-height: 1.05; text-align: center; word-break: break-word; user-select: none; }
  .verbalmemory-buttons { display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; }
  .verbalmemory-btn { min-width: 150px; }
  .verbalmemory-btn:disabled { opacity: 0.45; cursor: default; }
  .verbalmemory-seen { background: var(--sub); color: var(--bg); }
  .verbalmemory-lives { font-family: "JetBrains Mono", monospace; font-size: 1.3rem; letter-spacing: 0.18em; }
  .verbalmemory-life { color: var(--error); }
  .verbalmemory-life.verbalmemory-lost { color: var(--sub-alt); }
  .verbalmemory-hint { font-family: "JetBrains Mono", monospace; font-size: 0.8rem; color: var(--sub); text-align: center; }
  .verbalmemory-hint b { color: var(--accent); font-weight: 500; }
`);

NERDBOX.register({
  id: "verbalmemory",
  name: "Verbal Memory",
  tagline: "have you seen this word before?",
  category: "memory",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;
    var START_LIVES = 3;

    // ~120 common English words (the unseen pool).
    var POOL = [
      "apple", "river", "table", "chair", "house", "garden", "window", "candle",
      "bridge", "forest", "mountain", "valley", "ocean", "island", "desert", "meadow",
      "pencil", "letter", "ticket", "pocket", "button", "mirror", "ladder", "anchor",
      "pillow", "blanket", "kettle", "saucer", "basket", "barrel", "wagon", "saddle",
      "winter", "summer", "autumn", "morning", "evening", "shadow", "thunder", "lantern",
      "silver", "golden", "copper", "marble", "crystal", "velvet", "cotton", "leather",
      "doctor", "farmer", "sailor", "painter", "baker", "tailor", "miner", "hunter",
      "tiger", "eagle", "rabbit", "turtle", "spider", "salmon", "donkey", "beaver",
      "music", "guitar", "violin", "trumpet", "whistle", "rhythm", "melody", "chorus",
      "planet", "comet", "galaxy", "meteor", "orbit", "rocket", "shuttle", "station",
      "pepper", "ginger", "honey", "butter", "cheese", "yogurt", "biscuit", "muffin",
      "engine", "wheel", "piston", "cable", "switch", "circuit", "battery", "magnet",
      "castle", "tower", "palace", "temple", "cabin", "cottage", "mansion", "shelter",
      "feather", "ribbon", "needle", "thimble", "buckle", "zipper", "collar", "sleeve",
      "harbor", "wharf", "beacon", "compass", "rudder", "paddle", "current", "voyage"
    ];

    var pool = [];        // shuffled remaining unseen words
    var seen = null;      // Set of words already shown
    var seenList = [];    // same words, indexable for random repeats
    var current = "";
    var fromSeen = false; // whether the current word was pulled from the seen set
    var lives = START_LIVES;
    var score = 0;
    var locked = false;   // true between an answer and the next word

    var timers = [];
    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    function clearTimers() { for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers = []; }

    function escapeHtml(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    // ---- DOM ----
    var status = el("div", "g-status", "");
    var stage = el("div", "verbalmemory-stage");
    var word = el("div", "verbalmemory-word", "");
    stage.appendChild(word);
    var seenBtn = el("button", "g-btn verbalmemory-btn verbalmemory-seen", "SEEN");
    var newBtn = el("button", "g-btn verbalmemory-btn", "NEW");
    var buttons = el("div", "verbalmemory-buttons");
    buttons.appendChild(seenBtn);
    buttons.appendChild(newBtn);
    var hint = el("div", "verbalmemory-hint",
      'press <b>SEEN</b> if the word appeared before, <b>NEW</b> if it is new');

    var overlay = el("div", "g-overlay");
    var wrap = el("div", "verbalmemory-wrap");
    wrap.appendChild(stage);
    wrap.appendChild(buttons);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    seenBtn.addEventListener("click", function () { answer(true); });
    newBtn.addEventListener("click", function () { answer(false); });

    function livesHtml() {
      var s = "";
      for (var i = 0; i < START_LIVES; i++) {
        var lost = i >= lives;
        s += '<span class="verbalmemory-life' + (lost ? " verbalmemory-lost" : "") + '">' +
          (lost ? "♡" : "♥") + "</span>";
      }
      return s;
    }

    function setStatus() {
      status.innerHTML =
        '<span class="gl-score">score ' + score + '</span>' +
        '<span class="verbalmemory-lives">' + livesHtml() + "</span>";
    }

    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      var b = overlay.querySelector("button");
      if (b) b.addEventListener("click", function () { overlay.classList.remove("show"); onPlay(); });
      overlay.classList.add("show");
    }

    function setButtons(on) {
      seenBtn.disabled = !on;
      newBtn.disabled = !on;
    }

    // Decide & display the next word. Repeat probability grows with the seen set,
    // settling near ~45% once the set is non-trivial.
    function nextWord() {
      locked = false;
      stage.className = "verbalmemory-stage";

      var pRepeat = 0;
      if (seenList.length > 0) {
        pRepeat = Math.min(0.45, 0.18 + seenList.length * 0.05);
      }
      // Force a brand-new word if the pool would otherwise run dry on a non-repeat,
      // and force a repeat only when words exist to repeat.
      var doRepeat = seenList.length > 0 && (pool.length === 0 || Math.random() < pRepeat);

      if (doRepeat) {
        current = seenList[rand(seenList.length)];
        fromSeen = true;
      } else {
        current = pool.pop();
        fromSeen = false;
      }
      word.textContent = current;            // textContent is safe; escape only for innerHTML
      setButtons(true);
    }

    function answer(pressedSeen) {
      if (locked) return;
      locked = true;
      setButtons(false);

      var correct = pressedSeen ? fromSeen : !fromSeen;

      if (!fromSeen) {                        // first sighting — remember it
        if (!seen.has(current)) { seen.add(current); seenList.push(current); }
      }

      if (correct) {
        score++;
        stage.classList.add("verbalmemory-good");
        setStatus();
        later(nextWord, 240);
      } else {
        lives--;
        stage.classList.add("verbalmemory-bad");
        setStatus();
        if (lives <= 0) { later(gameOver, 520); }
        else { later(nextWord, 520); }
      }
    }

    function gameOver() {
      clearTimers();
      setButtons(false);
      var best = ctx.submitScore(score);
      status.innerHTML = '<span>out of lives — ' + score + ' pts</span>';
      showOverlay(
        '<div class="g-result"><div class="g-big">' + score + '</div>' +
        '<div class="g-sub">' + (best ? "new best! · " : "") + 'points</div>' +
        '<button class="g-btn">play again</button></div>',
        start
      );
    }

    function start() {
      clearTimers();
      overlay.classList.remove("show");
      pool = ctx.util.shuffle(POOL);
      seen = (typeof Set === "function") ? new Set() : {
        _o: {},
        has: function (k) { return Object.prototype.hasOwnProperty.call(this._o, k); },
        add: function (k) { this._o[k] = true; }
      };
      seenList = [];
      lives = START_LIVES;
      score = 0;
      setStatus();
      nextWord();
    }

    // ---- initial start overlay ----
    setStatus();
    setButtons(false);
    showOverlay(
      '<div class="g-result"><div class="g-sub">3 lives · SEEN if you saw the word before, else NEW</div>' +
      '<button class="g-btn">start</button></div>',
      start
    );

    return function teardown() { clearTimers(); };
  }
});
