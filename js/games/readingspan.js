/* Reading Span (Daneman & Carpenter style complex working-memory span).
   A SET of size N shows sentences one at a time. For each sentence the player
   judges whether it MAKES SENSE (T / "✓ sense") or is NONSENSE (F / "✗ nonsense")
   — this sense-judgement is the secondary load task and is logged but does not
   gate progression. The player must silently remember the LAST WORD of each
   sentence. After all N sentences, a recall prompt asks for the N final words IN
   ORDER (space/enter-separated, compared case-insensitively + trimmed). All N
   correct -> set cleared, submitScore(N), N++. Any miss -> game over: reveal the
   correct words + highest span cleared, play again (N resets to 2). Self-contained:
   exactly one injectStyle + one register; all timers + the document keydown
   listener are released in teardown. */
NERDBOX.injectStyle("readingspan", `
  .rsp-wrap {
    position: relative; width: 100%; max-width: 600px;
    display: flex; flex-direction: column; align-items: center; gap: 1.3rem;
  }
  .rsp-card {
    width: 100%; min-height: 180px; background: var(--bg-alt);
    border: 1px solid color-mix(in srgb, var(--text) 6%, transparent);
    border-radius: 18px; padding: 2rem 1.6rem;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 1.5rem; transition: border-color 0.12s, box-shadow 0.12s;
  }
  .rsp-card.rsp-good { border-color: var(--go); box-shadow: 0 0 0 1px var(--go), 0 0 24px -8px var(--go); }
  .rsp-card.rsp-bad { border-color: var(--error); box-shadow: 0 0 0 1px var(--error), 0 0 24px -8px var(--error); }
  .rsp-sentence {
    font-family: "JetBrains Mono", monospace; font-weight: 600;
    font-size: clamp(1.3rem, 4.5vw, 2rem); line-height: 1.35;
    color: var(--text); text-align: center; user-select: none; max-width: 100%;
  }
  .rsp-prompt {
    font-family: "JetBrains Mono", monospace; font-size: 1.05rem;
    color: var(--sub); text-align: center;
  }
  .rsp-prompt b { color: var(--accent); font-weight: 500; }
  .rsp-buttons { display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; }
  .rsp-judge { min-width: 150px; }
  .rsp-judge:disabled { opacity: 0.45; cursor: default; }
  .rsp-sense { background: var(--sub); color: var(--bg); }
  .rsp-form { display: flex; flex-direction: column; gap: 0.8rem; align-items: stretch; width: 100%; max-width: 420px; }
  .rsp-input {
    width: 100%; background: var(--bg); color: var(--text);
    border: 1px solid var(--sub-alt); border-radius: 12px;
    padding: 0.7rem 0.9rem; text-align: center;
    font-family: "JetBrains Mono", monospace; font-size: 1.3rem; font-weight: 500;
    letter-spacing: 0.04em; transition: border-color 0.12s;
  }
  .rsp-input::placeholder { color: var(--sub); opacity: 0.55; }
  .rsp-input:focus { outline: none; border-color: var(--accent); }
  .rsp-input:disabled { opacity: 0.5; }
  .rsp-hint {
    font-family: "JetBrains Mono", monospace; font-size: 0.9rem;
    color: var(--sub); min-height: 1.2em; text-align: center;
  }
  .rsp-hint.rsp-was { color: var(--error); }
  .rsp-hint.rsp-win { color: var(--go); }
  .rsp-hint b { color: var(--accent); font-weight: 500; }
  .rsp-keys {
    font-family: "JetBrains Mono", monospace; font-size: 0.78rem;
    color: var(--sub); text-align: center;
  }
  .rsp-keys b { color: var(--accent); font-weight: 500; }
`);

NERDBOX.register({
  id: "readingspan",
  name: "Reading Span",
  tagline: "judge sentences, recall the last words",
  category: "language",
  difficulty: "extreme",
  scoreMode: "max",
  formatScore: function (v) { return "span " + v; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="16" y2="6"/><line x1="4" y1="11" x2="13" y2="11"/><line x1="4" y1="16" x2="11" y2="16"/><polyline points="15 17 18 20 22 14"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand, shuffle = ctx.util.shuffle;
    var START = 2;
    var MIN_READ_MS = 350;     // soft minimum read time before a judgement counts

    // ~16 sensible + ~12 nonsense sentences, each 6-10 words ending in a concrete noun.
    var BANK = [
      { text: "The hungry cat chased the small mouse", sensible: true },
      { text: "She poured the milk into a tall glass", sensible: true },
      { text: "The farmer planted rows of yellow corn", sensible: true },
      { text: "We watched the storm roll across the valley", sensible: true },
      { text: "He locked the door and hid the key", sensible: true },
      { text: "The children built a castle out of sand", sensible: true },
      { text: "A cold wind rattled the old wooden gate", sensible: true },
      { text: "The doctor wrote a note on her chart", sensible: true },
      { text: "They rowed the little boat across the lake", sensible: true },
      { text: "The baker pulled warm bread from the oven", sensible: true },
      { text: "My brother fixed the chain on his bike", sensible: true },
      { text: "The teacher handed each student a sharp pencil", sensible: true },
      { text: "Rain dripped slowly from the leaking roof", sensible: true },
      { text: "The dog buried a bone beneath the tree", sensible: true },
      { text: "She tied the boat to the wooden dock", sensible: true },
      { text: "The hikers followed the trail up the mountain", sensible: true },
      { text: "The angry pillow sang a loud breakfast", sensible: false },
      { text: "He fried a quiet rainbow on the carpet", sensible: false },
      { text: "The clock drank a heavy mountain at noon", sensible: false },
      { text: "Her shoes whispered a delicious thunder yesterday", sensible: false },
      { text: "The river knitted a purple sandwich for lunch", sensible: false },
      { text: "A polite ladder swallowed the laughing window", sensible: false },
      { text: "The moon ironed a furious bowl of music", sensible: false },
      { text: "His pencil galloped across a sleepy ocean", sensible: false },
      { text: "The toaster married a forgetful patch of grass", sensible: false },
      { text: "She painted the silence with a buttered cloud", sensible: false },
      { text: "The lonely chair barked at a square teapot", sensible: false },
      { text: "A nervous mountain folded the singing spoon", sensible: false }
    ];

    var n = START;             // current set size
    var setItems = [];         // the N sentences chosen for this set
    var lastWords = [];        // their final words, in order (the recall answer)
    var idx = 0;               // index of the sentence currently shown
    var judgeStart = 0;        // timestamp the current sentence appeared
    var senseRight = 0;        // sense-judgements correct (across the whole run)
    var senseTotal = 0;        // sense-judgements made
    var phase = "idle";        // "judge" | "recall" | "over" | "idle"

    // ---- timers + listener (all cleared in teardown) ----
    var advT = null;           // delay between sentences
    var flashT = null;         // clears the good/bad card flash
    var keyHandler = null;

    function clearAdv() { if (advT) { clearTimeout(advT); advT = null; } }
    function clearFlash() { if (flashT) { clearTimeout(flashT); flashT = null; } }
    function clearAll() { clearAdv(); clearFlash(); }

    function escapeHtml(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    function finalWord(sentence) {
      var parts = sentence.split(/\s+/);
      return parts[parts.length - 1].toLowerCase();
    }

    // ---- DOM ----
    var status = el("div", "g-status", "");
    var wrap = el("div", "rsp-wrap");

    var card = el("div", "rsp-card");
    var sentenceEl = el("div", "rsp-sentence", "");
    var promptEl = el("div", "rsp-prompt", "");
    card.appendChild(sentenceEl);
    card.appendChild(promptEl);

    var senseBtn = el("button", "g-btn rsp-judge rsp-sense", "✓ sense");
    var nonsenseBtn = el("button", "g-btn rsp-judge", "✗ nonsense");
    var buttons = el("div", "rsp-buttons");
    buttons.appendChild(senseBtn);
    buttons.appendChild(nonsenseBtn);
    card.appendChild(buttons);

    var form = document.createElement("form");
    form.className = "rsp-form";
    var input = document.createElement("input");
    input.type = "text";
    input.className = "rsp-input";
    input.autocomplete = "off";
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "off");
    input.spellcheck = false;
    input.placeholder = "the last words, in order";
    var goBtn = el("button", "g-btn", "submit");
    goBtn.type = "submit";
    form.appendChild(input);
    form.appendChild(goBtn);
    card.appendChild(form);

    var hint = el("div", "rsp-hint", "");
    var keys = el("div", "rsp-keys", "judge with <b>T</b> = sense &middot; <b>F</b> = nonsense");

    wrap.appendChild(card);
    wrap.appendChild(hint);
    wrap.appendChild(keys);

    var overlay = el("div", "g-overlay");
    wrap.appendChild(overlay);

    root.appendChild(status);
    root.appendChild(wrap);

    senseBtn.addEventListener("click", function () { judge(true); });
    nonsenseBtn.addEventListener("click", function () { judge(false); });
    form.addEventListener("submit", function (e) { e.preventDefault(); submitRecall(); });

    keyHandler = function (e) {
      if (phase !== "judge") return;
      var k = e.key ? e.key.toLowerCase() : "";
      if (k === "t") { e.preventDefault(); judge(true); }
      else if (k === "f") { e.preventDefault(); judge(false); }
    };
    document.addEventListener("keydown", keyHandler);

    // ---- helpers ----
    function setStatus() {
      var best = NERDBOX.getBest("readingspan");
      var pos = (phase === "judge") ? (" · sentence " + (idx + 1) + "/" + n) : "";
      status.innerHTML =
        '<span class="gl-score">set of ' + n + pos + '</span>' +
        (best === null ? "" : '<span class="gl-time">best ' + best + '</span>');
    }

    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      var b = overlay.querySelector("button");
      if (b) b.addEventListener("click", function () { overlay.classList.remove("show"); onPlay(); });
      overlay.classList.add("show");
    }

    function showJudgeUI(on) {
      buttons.style.display = on ? "" : "none";
      promptEl.style.display = on ? "" : "none";
      senseBtn.disabled = !on;
      nonsenseBtn.disabled = !on;
    }
    function showRecallUI(on) {
      form.style.display = on ? "" : "none";
      input.disabled = !on;
      goBtn.disabled = !on;
    }

    function flashCard(cls) {
      clearFlash();
      card.classList.remove("rsp-good", "rsp-bad");
      void card.offsetWidth; // restart transition
      card.classList.add(cls);
      flashT = setTimeout(function () {
        card.classList.remove("rsp-good", "rsp-bad");
        flashT = null;
      }, 260);
    }

    // Build a set of `size` distinct sentences (bounded: capped at the bank size),
    // mixing sensible + nonsense. Records their final words as the recall answer.
    function buildSet(size) {
      var cap = Math.min(size, BANK.length);
      var deck = shuffle(BANK.slice());
      setItems = deck.slice(0, cap);
      lastWords = [];
      for (var i = 0; i < setItems.length; i++) lastWords.push(finalWord(setItems[i].text));
    }

    // ---- a set: show sentences one at a time, judge each, then recall ----
    function startSet() {
      clearAll();
      phase = "judge";
      buildSet(n);
      idx = 0;
      card.classList.remove("rsp-good", "rsp-bad");
      hint.className = "rsp-hint";
      hint.textContent = "remember the LAST word of each sentence";
      showRecallUI(false);
      showSentence();
    }

    function showSentence() {
      phase = "judge";
      showJudgeUI(true);
      sentenceEl.style.display = "";
      sentenceEl.textContent = setItems[idx].text; // textContent is safe
      promptEl.innerHTML = "does this <b>make sense</b>?";
      senseBtn.disabled = false;
      nonsenseBtn.disabled = false;
      judgeStart = (typeof Date.now === "function") ? Date.now() : +new Date();
      setStatus();
    }

    function judge(saidSense) {
      if (phase !== "judge") return;
      var now = (typeof Date.now === "function") ? Date.now() : +new Date();
      if (now - judgeStart < MIN_READ_MS) return; // soft minimum read time
      senseBtn.disabled = true;
      nonsenseBtn.disabled = true;

      senseTotal++;
      if (saidSense === setItems[idx].sensible) {
        senseRight++;
        flashCard("rsp-good");
      } else {
        flashCard("rsp-bad");
      }

      idx++;
      if (idx < setItems.length) {
        clearAdv();
        advT = setTimeout(function () { advT = null; showSentence(); }, 320);
      } else {
        clearAdv();
        advT = setTimeout(function () { advT = null; askRecall(); }, 320);
      }
    }

    function askRecall() {
      phase = "recall";
      showJudgeUI(false);
      sentenceEl.style.display = "none";
      showRecallUI(true);
      input.value = "";
      hint.className = "rsp-hint";
      hint.innerHTML = "type the <b>" + n + "</b> last words, in order (space-separated)";
      setStatus();
      input.focus();
    }

    function submitRecall() {
      if (phase !== "recall") return;
      var raw = input.value.trim();
      if (raw === "") { input.focus(); return; }
      var given = raw.toLowerCase().split(/\s+/);

      var ok = given.length === lastWords.length;
      if (ok) {
        for (var i = 0; i < lastWords.length; i++) {
          if (given[i] !== lastWords[i]) { ok = false; break; }
        }
      }

      if (ok) {
        var best = ctx.submitScore(n);
        flashCard("rsp-good");
        hint.className = "rsp-hint rsp-win";
        hint.textContent = best ? ("all " + n + " correct! new best — " + n) : ("all " + n + " correct! — " + n);
        showRecallUI(false);
        phase = "idle";
        n++;
        setStatus();
        clearAdv();
        advT = setTimeout(function () { advT = null; startSet(); }, 900);
      } else {
        gameOver();
      }
    }

    function gameOver() {
      clearAll();
      phase = "over";
      showRecallUI(false);
      showJudgeUI(false);
      flashCard("rsp-bad");

      var reached = n - 1; // highest span cleared
      ctx.submitScore(reached);
      var best = NERDBOX.getBest("readingspan");
      var isBest = best !== null && best === reached && reached > 0;
      var answer = escapeHtml(lastWords.join(" "));
      var acc = senseTotal > 0 ? Math.round((senseRight / senseTotal) * 100) : 0;

      hint.className = "rsp-hint rsp-was";
      hint.innerHTML = "the words were <b>" + answer + "</b>";

      showOverlay(
        '<div class="g-result">' +
        '<div class="g-big">' + reached + '</div>' +
        '<div class="g-sub">' + (isBest ? "new best! · " : "") + 'highest span cleared</div>' +
        '<div class="g-sub">the words were ' + answer + '</div>' +
        '<div class="g-sub">sense judgement ' + acc + '% (' + senseRight + '/' + senseTotal + ')</div>' +
        '<button class="g-btn">play again</button>' +
        '</div>',
        start
      );
    }

    function start() {
      clearAll();
      overlay.classList.remove("show");
      card.classList.remove("rsp-good", "rsp-bad");
      n = START;
      senseRight = 0;
      senseTotal = 0;
      setStatus();
      startSet();
    }

    // ---- initial screen ----
    phase = "idle";
    sentenceEl.textContent = "judge each sentence, then recall the last words";
    showJudgeUI(false);
    showRecallUI(false);
    status.textContent = "complex working-memory span";
    showOverlay(
      '<div class="g-result">' +
      '<div class="g-sub">sentences appear one at a time — judge each <b>sense</b> or <b>nonsense</b></div>' +
      '<div class="g-sub">then recall the <b>last word</b> of each, in order</div>' +
      '<div class="g-sub">recall all to grow the set. starts at 2.</div>' +
      '<button class="g-btn">start</button>' +
      '</div>',
      start
    );

    // teardown: clear all timers + remove the document keydown listener
    return function teardown() {
      phase = "over";
      clearAll();
      if (keyHandler) { document.removeEventListener("keydown", keyHandler); keyHandler = null; }
    };
  }
});
