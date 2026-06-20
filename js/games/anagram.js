/* Anagram — a 60-second word scramble. A word is picked from a hardcoded list and
   its letters are shuffled (always into an arrangement different from the original)
   and shown as big tiles. Type the unscrambled word and submit (Enter or button).
   Right = +1 and a fresh word; wrong = red flash, same word, try again (or skip).
   Comparison is case-insensitive. Score (scoreMode max) = words solved in 60s. */
NERDBOX.injectStyle("anagram", `
  .anagram-wrap { position: relative; width: 100%; max-width: 560px; display: flex; flex-direction: column; align-items: center; gap: 1.5rem; }
  .anagram-stage { width: 100%; min-height: 150px; border-radius: 18px; background: var(--bg-alt); border: 3px solid var(--bg-alt); display: flex; align-items: center; justify-content: center; padding: 1.4rem 1rem; transition: border-color 0.12s ease, background 0.12s ease; }
  .anagram-stage.anagram-good { border-color: var(--go); background: color-mix(in srgb, var(--go) 14%, var(--bg-alt)); }
  .anagram-stage.anagram-bad { border-color: var(--error); background: color-mix(in srgb, var(--error) 14%, var(--bg-alt)); }
  .anagram-tiles { display: flex; flex-wrap: wrap; gap: 0.6rem; justify-content: center; }
  .anagram-tile { font-family: "JetBrains Mono", monospace; font-size: 2.2rem; font-weight: 700; color: var(--text); text-transform: uppercase; width: 3rem; height: 3.4rem; display: flex; align-items: center; justify-content: center; background: var(--bg); border-radius: 10px; user-select: none; box-shadow: 0 2px 0 color-mix(in srgb, var(--bg) 60%, #000); }
  .anagram-controls { display: flex; gap: 0.7rem; width: 100%; flex-wrap: wrap; justify-content: center; }
  .anagram-input { flex: 1 1 220px; min-width: 0; font-family: "JetBrains Mono", monospace; font-size: 1.3rem; font-weight: 500; text-align: center; letter-spacing: 0.12em; color: var(--text); background: var(--bg-alt); border: 2px solid var(--bg-alt); border-radius: 10px; padding: 0.65rem 0.8rem; outline: none; text-transform: lowercase; transition: border-color 0.12s ease; }
  .anagram-input:focus { border-color: var(--accent); }
  .anagram-input:disabled { opacity: 0.5; }
  .anagram-go { background: var(--accent); color: var(--bg); }
  .anagram-skip { background: var(--sub); color: var(--bg); }
  .anagram-go:disabled, .anagram-skip:disabled { opacity: 0.45; cursor: default; }
  .anagram-hint { font-family: "JetBrains Mono", monospace; font-size: 0.8rem; color: var(--sub); text-align: center; }
  .anagram-hint b { color: var(--accent); font-weight: 500; }
`);

NERDBOX.register({
  id: "anagram",
  name: "Anagram",
  tagline: "unscramble the word",
  category: "language",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5a1 1 0 0 1 1-1h6"/><path d="M9 4l-5 16"/><path d="M20 17v2a1 1 0 0 1-1 1h-6"/><path d="M15 20l5-16"/><path d="M3 12h7"/><path d="M14 12h7"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, shuffle = ctx.util.shuffle, rand = ctx.util.rand;
    var ROUND_MS = 60000;

    // ~60 common words, 4–7 letters.
    var WORDS = [
      "table", "chair", "house", "water", "music", "light", "world", "money",
      "river", "plant", "stone", "cloud", "field", "horse", "bread", "dance",
      "smile", "dream", "ocean", "tiger", "lemon", "candy", "frame", "glove",
      "north", "south", "ghost", "brush", "chess", "pearl",
      "garden", "window", "pencil", "summer", "winter", "forest", "silver",
      "bridge", "basket", "castle", "flower", "orange", "pocket", "rocket",
      "guitar", "planet", "shadow", "yellow", "purple", "letter",
      "morning", "evening", "kitchen", "diamond", "journey", "library",
      "picture", "October", "blanket", "compass"
    ];

    var word = "";        // current target word
    var score = 0;
    var deadline = 0;     // performance.now()-style end time
    var locked = false;   // true once time is up

    var roundTimer = null;   // the per-round / countdown ticker (cleared in teardown)
    var flashTimer = null;   // brief green/red flash reset

    function clearRoundTimer() { if (roundTimer) { clearInterval(roundTimer); roundTimer = null; } }
    function clearFlash() { if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; } }

    function escapeHtml(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    // Scramble a word into an arrangement guaranteed different from the original.
    // Guard against single-distinct-letter / very short words so it can't loop forever.
    function scramble(w) {
      var letters = w.split("");
      var distinct = {};
      for (var i = 0; i < letters.length; i++) distinct[letters[i].toLowerCase()] = true;
      var canDiffer = letters.length > 1 && Object.keys(distinct).length > 1;
      var out = letters.slice();
      for (var tries = 0; tries < 50; tries++) {
        out = shuffle(letters);
        if (!canDiffer || out.join("") !== w) break;
      }
      return out;
    }

    // ---- DOM ----
    var status = el("div", "g-status", "");
    var stage = el("div", "anagram-stage");
    var tiles = el("div", "anagram-tiles");
    stage.appendChild(tiles);

    var input = el("input", "anagram-input");
    input.type = "text";
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "your answer");
    input.placeholder = "type the word";

    var goBtn = el("button", "g-btn anagram-go", "submit");
    var skipBtn = el("button", "g-btn anagram-skip", "skip");
    var controls = el("div", "anagram-controls");
    controls.appendChild(input);
    controls.appendChild(goBtn);
    controls.appendChild(skipBtn);

    var hint = el("div", "anagram-hint",
      'unscramble the tiles · <b>Enter</b> to submit · <b>skip</b> for a new word');

    var overlay = el("div", "g-overlay");
    var wrap = el("div", "anagram-wrap");
    wrap.appendChild(stage);
    wrap.appendChild(controls);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    function setInputs(on) {
      input.disabled = !on;
      goBtn.disabled = !on;
      skipBtn.disabled = !on;
    }

    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      var b = overlay.querySelector("button");
      if (b) b.addEventListener("click", function () { overlay.classList.remove("show"); onPlay(); });
      overlay.classList.add("show");
    }

    function setStatus() {
      var left = locked ? 0 : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      status.innerHTML =
        '<span class="gl-score">score ' + score + '</span>' +
        '<span class="gl-time">' + left + 's</span>';
    }

    function renderTiles() {
      var scram = scramble(word);
      tiles.innerHTML = "";
      for (var i = 0; i < scram.length; i++) {
        // textContent keeps tile letters safe; escaped only where innerHTML is used.
        tiles.appendChild(el("div", "anagram-tile", escapeHtml(scram[i])));
      }
    }

    function flash(cls) {
      clearFlash();
      stage.classList.add(cls);
      flashTimer = setTimeout(function () { stage.classList.remove(cls); flashTimer = null; }, 260);
    }

    function nextWord() {
      word = WORDS[rand(WORDS.length)];
      renderTiles();
      input.value = "";
      input.focus();
    }

    function submit() {
      if (locked) return;
      var guess = input.value.replace(/\s+/g, "").toLowerCase();
      if (!guess) { input.focus(); return; }
      if (guess === word.toLowerCase()) {   // case-insensitive match
        score++;
        setStatus();
        flash("anagram-good");
        nextWord();
      } else {
        flash("anagram-bad");               // wrong: no point, keep the same word
        input.select();
      }
    }

    function skip() {
      if (locked) return;
      nextWord();
    }

    function timeUp() {
      clearRoundTimer();
      clearFlash();
      locked = true;
      setInputs(false);
      stage.classList.remove("anagram-good", "anagram-bad");
      setStatus();
      var best = ctx.submitScore(score);
      showOverlay(
        '<div class="g-result"><div class="g-big">' + score + '</div>' +
        '<div class="g-sub">' + (best ? "new best! · " : "") + 'words in 60s</div>' +
        '<button class="g-btn">play again</button></div>',
        start
      );
    }

    function tick() {
      setStatus();
      if (Date.now() >= deadline) timeUp();
    }

    function start() {
      clearRoundTimer();
      clearFlash();
      overlay.classList.remove("show");
      stage.classList.remove("anagram-good", "anagram-bad");
      locked = false;
      score = 0;
      setInputs(true);
      deadline = Date.now() + ROUND_MS;
      setStatus();
      nextWord();
      roundTimer = setInterval(tick, 200);
    }

    goBtn.addEventListener("click", submit);
    skipBtn.addEventListener("click", function () { skip(); input.focus(); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    });

    // ---- initial start overlay ----
    setStatus();
    setInputs(false);
    showOverlay(
      '<div class="g-result"><div class="g-sub">60 seconds · unscramble as many words as you can</div>' +
      '<button class="g-btn">start</button></div>',
      start
    );

    return function teardown() { clearRoundTimer(); clearFlash(); };
  }
});
