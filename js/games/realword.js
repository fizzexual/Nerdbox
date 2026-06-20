/* Word or Not (lexical decision speed) — a string flashes BIG; decide whether it
   is a real, common English word (WORD) or a plausible-but-fake nonword (NOT).
   60-second round. Correct = +1 and the next string appears instantly; wrong = a
   brief red flash, then the next string (no point). Optional keys: ← = WORD,
   → = NOT. Score = points earned before time runs out. */
NERDBOX.injectStyle("realword", `
  .realword-wrap { position: relative; width: 100%; max-width: 540px; display: flex; flex-direction: column; align-items: center; gap: 1.4rem; }
  .realword-stage { width: 100%; min-height: 200px; border-radius: 18px; background: var(--bg-alt); border: 3px solid var(--bg-alt); display: flex; align-items: center; justify-content: center; padding: 1.4rem; transition: border-color 0.1s ease, background 0.1s ease; }
  .realword-stage.realword-bad { border-color: var(--error); background: color-mix(in srgb, var(--error) 16%, var(--bg-alt)); }
  .realword-word { font-family: "JetBrains Mono", monospace; font-size: 3.6rem; font-weight: 700; color: var(--text); line-height: 1.05; text-align: center; letter-spacing: 0.04em; word-break: break-word; user-select: none; }
  .realword-buttons { display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; }
  .realword-btn { min-width: 150px; }
  .realword-btn:disabled { opacity: 0.45; cursor: default; }
  .realword-word-btn { background: var(--go); color: var(--bg); }
  .realword-not-btn { background: var(--sub); color: var(--bg); }
  .realword-hint { font-family: "JetBrains Mono", monospace; font-size: 0.8rem; color: var(--sub); text-align: center; }
  .realword-hint b { color: var(--accent); font-weight: 500; }
  .realword-time { font-family: "JetBrains Mono", monospace; font-size: 1.3rem; font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }
  .realword-time.realword-low { color: var(--error); }
`);

NERDBOX.register({
  id: "realword",
  name: "Word or Not",
  tagline: "real word? decide fast",
  category: "language",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/><path d="M12 4v16"/><path d="m16 12 2 2 4-4"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand, shuffle = ctx.util.shuffle;
    var ROUND_MS = 60000;

    // ~120 real, common, correctly-spelled English words.
    var WORDS = [
      "table", "garden", "window", "candle", "bridge", "forest", "mountain", "valley",
      "ocean", "island", "desert", "meadow", "pencil", "letter", "ticket", "pocket",
      "button", "mirror", "ladder", "anchor", "pillow", "blanket", "kettle", "basket",
      "barrel", "saddle", "winter", "summer", "autumn", "morning", "evening", "shadow",
      "thunder", "lantern", "silver", "golden", "copper", "marble", "crystal", "velvet",
      "cotton", "leather", "doctor", "farmer", "sailor", "painter", "tailor", "hunter",
      "tiger", "eagle", "rabbit", "turtle", "spider", "salmon", "donkey", "beaver",
      "music", "guitar", "violin", "trumpet", "whistle", "rhythm", "melody", "chorus",
      "planet", "comet", "galaxy", "meteor", "orbit", "rocket", "shuttle", "station",
      "pepper", "ginger", "honey", "butter", "cheese", "biscuit", "muffin", "engine",
      "wheel", "cable", "switch", "circuit", "battery", "magnet", "castle", "tower",
      "palace", "temple", "cabin", "cottage", "mansion", "shelter", "feather", "ribbon",
      "needle", "buckle", "zipper", "collar", "sleeve", "harbor", "beacon", "compass",
      "paddle", "current", "voyage", "river", "flower", "branch", "pebble", "cabbage",
      "kitchen", "ceiling", "carpet", "curtain", "drawer", "shelf", "mattress", "pillar",
      "pottery", "jacket", "sandal", "wallet", "helmet", "glove", "scarf", "umbrella"
    ];

    // ~120 pronounceable nonwords — each checked to NOT be a real English word,
    // common slang, or recognized term. Deliberately built from fake roots.
    var NONWORDS = [
      "brundle", "flonk", "gleeb", "sprandle", "tarvis", "frell", "blorn", "quabble",
      "drockle", "snurp", "plimth", "grunnel", "vorth", "clatch", "fendle", "skritch",
      "morbil", "twazzle", "glunk", "prendle", "scrabnit", "dwurp", "flornce", "blesk",
      "tronk", "grymble", "skadle", "venthor", "plonkish", "drebble", "sworb", "clunth",
      "fimble", "grawl", "snovel", "trisk", "blammo", "drupnik", "yorbis", "klenth",
      "swarble", "grindel", "ploon", "tarnex", "vundle", "spronk", "glimber", "drask",
      "morvik", "thrennel", "blunth", "crandle", "feltch", "gworm", "smudgel", "trind",
      "vapsit", "drennow", "blicker", "groxle", "snadle", "prazzle", "kvenn", "thrunk",
      "flandle", "burnick", "drovern", "splonk", "graddle", "yendle", "moskit", "trazil",
      "blint", "swendle", "grumple", "ploonk", "darvel", "frisple", "glonkey", "treldon",
      "wrindle", "scolp", "brennix", "twonkle", "grellow", "splandle", "vorkle", "drabnit",
      "snorl", "plendish", "graunt", "yibber", "flusker", "trommish", "blandle", "screnk",
      "morple", "dwizzle", "grinth", "splazzle", "vendrol", "tronkle", "blissp", "fradgel",
      "snubble", "praxel", "growltz", "tildren", "blompf", "scravel", "merdle", "twindle",
      "glonker", "drennith", "spludge", "yarnox", "frindle", "blasque", "tronvel", "skemble"
    ];

    var deck = [];        // queued items: { text, real }
    var current = null;
    var score = 0;
    var locked = false;   // brief lock during the wrong-answer flash
    var running = false;
    var remaining = ROUND_MS;

    var timers = [];
    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    var ticker = null;
    function clearTimers() {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers = [];
      if (ticker) { clearInterval(ticker); ticker = null; }
    }

    // ---- DOM ----
    var status = el("div", "g-status", "");
    var stage = el("div", "realword-stage");
    var word = el("div", "realword-word", "");
    stage.appendChild(word);
    var wordBtn = el("button", "g-btn realword-btn realword-word-btn", "WORD");
    var notBtn = el("button", "g-btn realword-btn realword-not-btn", "NOT");
    var buttons = el("div", "realword-buttons");
    buttons.appendChild(wordBtn);
    buttons.appendChild(notBtn);
    var hint = el("div", "realword-hint",
      'is it a real word? <b>WORD</b> (←) or <b>NOT</b> (→) — go fast');

    var overlay = el("div", "g-overlay");
    var wrap = el("div", "realword-wrap");
    wrap.appendChild(stage);
    wrap.appendChild(buttons);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    function onWord() { answer(true); }
    function onNot() { answer(false); }
    wordBtn.addEventListener("click", onWord);
    notBtn.addEventListener("click", onNot);

    function onKey(e) {
      if (!running || locked) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); answer(true); }
      else if (e.key === "ArrowRight") { e.preventDefault(); answer(false); }
    }
    document.addEventListener("keydown", onKey);

    function setButtons(on) {
      wordBtn.disabled = !on;
      notBtn.disabled = !on;
    }

    function fmtTime(ms) {
      var s = Math.max(0, Math.ceil(ms / 1000));
      return s + "s";
    }

    function setStatus() {
      var low = remaining <= 10000;
      status.innerHTML =
        '<span class="gl-score">score ' + score + '</span>' +
        '<span class="realword-time' + (low ? " realword-low" : "") + '">' +
        fmtTime(remaining) + '</span>';
    }

    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      var b = overlay.querySelector("button");
      if (b) b.addEventListener("click", function () { overlay.classList.remove("show"); onPlay(); });
      overlay.classList.add("show");
    }

    // Build a fresh shuffled deck of ~50/50 words and nonwords. When the queue is
    // exhausted mid-round it is simply rebuilt, so play never stalls.
    function buildDeck() {
      var reals = shuffle(WORDS).map(function (w) { return { text: w, real: true }; });
      var fakes = shuffle(NONWORDS).map(function (w) { return { text: w, real: false }; });
      var n = Math.min(reals.length, fakes.length);
      var merged = [];
      for (var i = 0; i < n; i++) { merged.push(reals[i]); merged.push(fakes[i]); }
      return shuffle(merged);
    }

    function nextItem() {
      locked = false;
      stage.className = "realword-stage";
      if (deck.length === 0) deck = buildDeck();
      current = deck.pop();
      word.textContent = current.text;   // textContent — no escaping needed
      setButtons(true);
    }

    function answer(saidWord) {
      if (!running || locked || !current) return;
      var correct = (saidWord === current.real);
      if (correct) {
        score++;
        setStatus();
        nextItem();                       // next instantly
      } else {
        locked = true;
        setButtons(false);
        stage.classList.add("realword-bad");
        setStatus();
        later(function () { if (running) nextItem(); }, 320);
      }
    }

    function tick() {
      remaining -= 100;
      if (remaining <= 0) {
        remaining = 0;
        setStatus();
        finish();
        return;
      }
      setStatus();
    }

    function finish() {
      running = false;
      clearTimers();
      setButtons(false);
      stage.className = "realword-stage";
      var best = ctx.submitScore(score);
      status.innerHTML = '<span>time! — ' + score + ' pts</span>';
      showOverlay(
        '<div class="g-result"><div class="g-big">' + score + '</div>' +
        '<div class="g-sub">' + (best ? "new best! · " : "") + 'points in 60s</div>' +
        '<button class="g-btn">play again</button></div>',
        start
      );
    }

    function start() {
      clearTimers();
      overlay.classList.remove("show");
      deck = buildDeck();
      score = 0;
      remaining = ROUND_MS;
      running = true;
      setStatus();
      nextItem();
      ticker = setInterval(tick, 100);
    }

    // ---- initial start overlay ----
    setStatus();
    setButtons(false);
    showOverlay(
      '<div class="g-result"><div class="g-sub">60 seconds · is the flashed string a real word? WORD or NOT — as fast as you can</div>' +
      '<button class="g-btn">start</button></div>',
      start
    );

    return function teardown() {
      running = false;
      clearTimers();
      document.removeEventListener("keydown", onKey);
      wordBtn.removeEventListener("click", onWord);
      notBtn.removeEventListener("click", onNot);
    };
  }
});
