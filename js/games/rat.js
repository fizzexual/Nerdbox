/* Word Link (Remote Associates Test) — a verbal-creativity puzzle. Three seemingly
   unrelated words are shown; type the single word that links / combines with all
   three (compound words or strong associations), e.g. COTTAGE / SWISS / CAKE → CHEESE.
   Correct (case-insensitive) = green, streak++, submitScore(streak), next puzzle.
   Wrong = red "try again" and you keep guessing. "give up" reveals the answer and
   ends the run. Score (scoreMode max) = longest streak of solved puzzles. */
NERDBOX.injectStyle("rat", `
  .rat-wrap { position: relative; width: 100%; max-width: 540px; display: flex; flex-direction: column; align-items: center; gap: 1.5rem; }
  .rat-stage { width: 100%; min-height: 170px; border-radius: 18px; background: var(--bg-alt); border: 3px solid var(--bg-alt); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; padding: 1.6rem 1rem; transition: border-color 0.12s ease, background 0.12s ease; }
  .rat-stage.rat-good { border-color: var(--go); background: color-mix(in srgb, var(--go) 14%, var(--bg-alt)); }
  .rat-stage.rat-bad { border-color: var(--error); background: color-mix(in srgb, var(--error) 14%, var(--bg-alt)); }
  .rat-cues { display: flex; flex-wrap: wrap; gap: 0.7rem; justify-content: center; align-items: center; }
  .rat-cue { font-family: "JetBrains Mono", monospace; font-size: 1.5rem; font-weight: 700; color: var(--text); text-transform: uppercase; letter-spacing: 0.06em; padding: 0.45rem 0.95rem; background: var(--bg); border-radius: 10px; user-select: none; box-shadow: 0 2px 0 color-mix(in srgb, var(--bg) 60%, #000); }
  .rat-plus { font-family: "JetBrains Mono", monospace; font-size: 1.3rem; font-weight: 700; color: var(--sub); user-select: none; }
  .rat-reveal { font-family: "JetBrains Mono", monospace; font-size: 1rem; color: var(--sub); text-align: center; }
  .rat-reveal b { color: var(--accent); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  .rat-controls { display: flex; gap: 0.7rem; width: 100%; flex-wrap: wrap; justify-content: center; }
  .rat-input { flex: 1 1 220px; min-width: 0; font-family: "JetBrains Mono", monospace; font-size: 1.3rem; font-weight: 500; text-align: center; letter-spacing: 0.12em; color: var(--text); background: var(--bg-alt); border: 2px solid var(--bg-alt); border-radius: 10px; padding: 0.65rem 0.8rem; outline: none; text-transform: lowercase; transition: border-color 0.12s ease; }
  .rat-input:focus { border-color: var(--accent); }
  .rat-input:disabled { opacity: 0.5; }
  .rat-go { background: var(--accent); color: var(--bg); }
  .rat-skip { background: var(--sub); color: var(--bg); }
  .rat-go:disabled, .rat-skip:disabled { opacity: 0.45; cursor: default; }
  .rat-msg { font-family: "JetBrains Mono", monospace; font-size: 0.85rem; min-height: 1.2em; text-align: center; color: var(--sub); }
  .rat-msg.rat-msg-bad { color: var(--error); }
  .rat-hint { font-family: "JetBrains Mono", monospace; font-size: 0.8rem; color: var(--sub); text-align: center; }
  .rat-hint b { color: var(--accent); font-weight: 500; }
`);

NERDBOX.register({
  id: "rat",
  name: "Word Link",
  tagline: "find the word that links all three",
  category: "language",
  scoreMode: "max",
  formatScore: function (v) { return v + " streak"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="6" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="12" r="2.5"/><path d="M7.2 7.1 16.8 11"/><path d="M7.2 16.9 16.8 13"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, shuffle = ctx.util.shuffle;

    // Verified RAT triples: [word1, word2, word3, answer]. The three cues each
    // form a compound word or strong association with the single answer word.
    var PUZZLES = [
      ["COTTAGE", "SWISS", "CAKE", "CHEESE"],
      ["FALLING", "ACTOR", "DUST", "STAR"],
      ["BROKEN", "CLEAR", "EYE", "GLASS"],
      ["WIDOW", "BITE", "MONKEY", "SPIDER"],
      ["DUCK", "FOLD", "DOLLAR", "BILL"],
      ["SLEEPING", "BEAN", "TRASH", "BAG"],
      ["DEW", "COMB", "BEE", "HONEY"],
      ["FOUNTAIN", "BAKING", "POP", "SODA"],
      ["AID", "RUBBER", "WAGON", "BAND"],
      ["FLAKE", "MOBILE", "CONE", "SNOW"],
      ["CROSS", "RAIN", "TIE", "BOW"],
      ["SANDWICH", "HOUSE", "GOLF", "CLUB"],
      ["NIGHT", "WRIST", "STOP", "WATCH"],
      ["FISH", "MINE", "RUSH", "GOLD"],
      ["SHOW", "LIFE", "ROW", "BOAT"],
      ["PINE", "CRAB", "SAUCE", "APPLE"],
      ["HOUND", "PRESSURE", "SHOT", "BLOOD"],
      ["PIE", "LUCK", "BELLY", "POT"],
      ["RIVER", "NOTE", "ACCOUNT", "BANK"],
      ["PRINT", "BERRY", "BIRD", "BLUE"],
      // A few more well-known triples.
      ["MAN", "GLUE", "STICK", "HORSE"],
      ["PALM", "SHOE", "HOUSE", "TREE"],
      ["BASKET", "EIGHT", "SNOW", "BALL"],
      ["WATER", "TOBACCO", "STAND", "PIPE"],
      ["CANE", "DADDY", "PLUM", "SUGAR"],
      ["DREAM", "BREAK", "LIGHT", "DAY"],
      ["HOME", "SEA", "BED", "SICK"],
      ["BARREL", "ROOT", "BELT", "BEER"],
      ["RIGHT", "CAT", "CARBON", "COPY"],
      ["SUN", "GLASS", "DECK", "HOUSE"]
    ];

    var order = [];     // shuffled indices into PUZZLES
    var pos = 0;        // pointer into order
    var answer = "";    // current answer (uppercase as stored)
    var streak = 0;
    var locked = false; // true once the run is over

    var flashTimer = null;
    function clearFlash() { if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; } }

    function escapeHtml(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    // ---- DOM ----
    var status = el("div", "g-status", "");

    var stage = el("div", "rat-stage");
    var cues = el("div", "rat-cues");
    var reveal = el("div", "rat-reveal");
    reveal.style.display = "none";
    stage.appendChild(cues);
    stage.appendChild(reveal);

    var input = el("input", "rat-input");
    input.type = "text";
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "your answer");
    input.placeholder = "the linking word";

    var goBtn = el("button", "g-btn rat-go", "submit");
    var skipBtn = el("button", "g-btn rat-skip", "give up");
    var controls = el("div", "rat-controls");
    controls.appendChild(input);
    controls.appendChild(goBtn);
    controls.appendChild(skipBtn);

    var msg = el("div", "rat-msg", "");
    var hint = el("div", "rat-hint",
      'one word links all three · <b>Enter</b> to submit · <b>give up</b> reveals it & ends the run');

    var overlay = el("div", "g-overlay");
    var wrap = el("div", "rat-wrap");
    wrap.appendChild(stage);
    wrap.appendChild(controls);
    wrap.appendChild(msg);
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
      status.innerHTML =
        '<span class="gl-score">streak ' + streak + '</span>' +
        '<span class="gl-time">puzzle ' + Math.min(pos + 1, PUZZLES.length) + '/' + PUZZLES.length + '</span>';
    }

    function setMsg(text, bad) {
      msg.textContent = text || "";
      msg.className = "rat-msg" + (bad ? " rat-msg-bad" : "");
    }

    function flash(cls) {
      clearFlash();
      stage.classList.add(cls);
      flashTimer = setTimeout(function () { stage.classList.remove(cls); flashTimer = null; }, 260);
    }

    // Render the three cue words for the current puzzle (separated by "+").
    function renderCues(trip) {
      cues.innerHTML = "";
      reveal.style.display = "none";
      for (var i = 0; i < 3; i++) {
        if (i > 0) cues.appendChild(el("span", "rat-plus", "+"));
        // textContent keeps the cue safe; the source list is trusted but consistent.
        cues.appendChild(el("span", "rat-cue", escapeHtml(trip[i])));
      }
    }

    function loadPuzzle() {
      // If the player exhausts every puzzle, reshuffle and continue — the streak lives on.
      if (pos >= order.length) { order = shuffle(order); pos = 0; }
      var trip = PUZZLES[order[pos]];
      answer = trip[3];
      renderCues(trip);
      input.value = "";
      setMsg("");
      stage.classList.remove("rat-good", "rat-bad");
      input.focus();
      setStatus();
    }

    function submit() {
      if (locked) return;
      var guess = input.value.replace(/\s+/g, " ").trim().toLowerCase();
      if (!guess) { input.focus(); return; }
      if (guess === answer.toLowerCase()) {   // case-insensitive match
        streak++;
        ctx.submitScore(streak);
        flash("rat-good");
        setMsg("");
        pos++;
        loadPuzzle();
      } else {
        flash("rat-bad");                      // wrong: keep the same puzzle, let them retry
        setMsg("try again", true);
        input.select();
      }
    }

    // Give up: reveal the answer for the current puzzle and end the run.
    function giveUp() {
      if (locked) return;
      locked = true;
      setInputs(false);
      clearFlash();
      stage.classList.remove("rat-good", "rat-bad");
      reveal.innerHTML = "the word was <b>" + escapeHtml(answer) + "</b>";
      reveal.style.display = "";
      setMsg("");
      gameOver();
    }

    function gameOver() {
      var best = ctx.submitScore(streak);
      status.innerHTML = '<span>gave up — streak of ' + streak + '</span>';
      showOverlay(
        '<div class="g-result"><div class="g-big">' + streak + '</div>' +
        '<div class="g-sub">' + (best ? "new best! · " : "") + 'longest streak</div>' +
        '<button class="g-btn">play again</button></div>',
        start
      );
    }

    function start() {
      clearFlash();
      overlay.classList.remove("show");
      stage.classList.remove("rat-good", "rat-bad");
      locked = false;
      streak = 0;
      pos = 0;
      order = shuffle(PUZZLES.map(function (_, i) { return i; }));   // randomize order each run
      setInputs(true);
      loadPuzzle();
    }

    goBtn.addEventListener("click", submit);
    skipBtn.addEventListener("click", giveUp);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    });

    // ---- initial start overlay ----
    setStatus();
    setInputs(false);
    showOverlay(
      '<div class="g-result"><div class="g-sub">three words, one link · keep your streak alive</div>' +
      '<button class="g-btn">start</button></div>',
      start
    );

    return function teardown() { clearFlash(); };
  }
});
