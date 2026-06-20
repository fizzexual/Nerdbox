/* Stroop Test — name the INK color, ignore the WORD. 60-second round. */
NERDBOX.injectStyle("stroop", `
.stroop-wrap { display: flex; flex-direction: column; align-items: center; gap: 1.4rem; width: 100%; max-width: 560px; margin: 0 auto; position: relative; }
.stroop-word {
  font-family: "JetBrains Mono", monospace;
  font-weight: 700;
  font-size: clamp(2.8rem, 12vw, 5rem);
  letter-spacing: 0.04em;
  line-height: 1;
  user-select: none;
  min-height: 1.1em;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.08s ease;
}
.stroop-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 5.4rem;
  border-radius: 16px;
  background: var(--bg-alt);
  border: 2px solid var(--sub-alt);
  transition: border-color 0.12s ease, background 0.12s ease;
}
.stroop-stage.stroop-right { border-color: var(--go); }
.stroop-stage.stroop-wrong { border-color: var(--error); }
.stroop-pads { display: flex; flex-wrap: wrap; gap: 0.6rem; justify-content: center; width: 100%; }
.stroop-pad {
  border: 2px solid transparent;
  border-radius: 10px;
  padding: 0.7rem 0.4rem;
  flex: 1 1 90px;
  min-width: 84px;
  font-family: "JetBrains Mono", monospace;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: #fff;
  cursor: pointer;
  transition: filter 0.12s ease, transform 0.08s ease, opacity 0.12s ease;
}
.stroop-pad:hover:not(:disabled) { filter: brightness(1.12); }
.stroop-pad:active:not(:disabled) { transform: translateY(1px); }
.stroop-pad:disabled { cursor: default; opacity: 0.55; }
.stroop-hint { font-family: "JetBrains Mono", monospace; color: var(--sub); font-size: 0.85rem; text-align: center; }
`);

NERDBOX.register({
  id: "stroop",
  name: "Stroop Test",
  tagline: "name the ink color, ignore the word",
  category: "attention",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-3.5 4-6 7-6 10a6 6 0 0 0 12 0c0-3-2.5-6-6-10z"/><path d="M8.5 14a3.5 3.5 0 0 0 3.5 3.5"/></svg>',
  mount: function (root, ctx) {
    var rand = ctx.util.rand, shuffle = ctx.util.shuffle, el = ctx.util.el;

    // The 5 fixed game colors. id = identity, label = displayed word, hex = ink.
    var COLORS = [
      { id: "red",    label: "RED",    hex: "#e64b4b" },
      { id: "green",  label: "GREEN",  hex: "#4caf72" },
      { id: "blue",   label: "BLUE",   hex: "#4f8df0" },
      { id: "yellow", label: "YELLOW", hex: "#e2b714" },
      { id: "purple", label: "PURPLE", hex: "#b072e0" }
    ];
    function byId(id) {
      for (var i = 0; i < COLORS.length; i++) if (COLORS[i].id === id) return COLORS[i];
      return COLORS[0];
    }

    var ROUND_MS = 60000;
    var roundTimer = null;   // 1s countdown ticker
    var flashTimer = null;   // brief green/red flash reset
    var endAt = 0;
    var score = 0;
    var running = false;
    var inkId = null;        // <-- the correct answer is the INK color id

    // --- layout ---
    var wrap = el("div", "stroop-wrap");
    var status = el("div", "g-status");
    var stage = el("div", "stroop-stage");
    var word = el("div", "stroop-word");
    stage.appendChild(word);
    var pads = el("div", "stroop-pads");
    var hint = el("div", "stroop-hint", "click the button matching the INK color — not the word");
    var overlay = el("div", "g-overlay");

    wrap.appendChild(status);
    wrap.appendChild(stage);
    wrap.appendChild(pads);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    // --- answer buttons: each pad maps to ONE ink color id ---
    var padEls = {};
    COLORS.forEach(function (c) {
      var b = el("button", "stroop-pad", c.label);
      b.style.background = c.hex;
      // luminance pick for legible label text
      b.style.color = (c.id === "yellow") ? "#222" : "#fff";
      b.dataset.id = c.id;
      b.addEventListener("click", function () { answer(c.id); });
      padEls[c.id] = b;
      pads.appendChild(b);
    });

    function setPadsEnabled(on) {
      COLORS.forEach(function (c) { padEls[c.id].disabled = !on; });
    }

    function renderStatus() {
      var left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      status.innerHTML =
        '<span class="gl-score">score ' + score + '</span>' +
        '<span>' + left + 's</span>';
    }

    function nextTrial() {
      // word: any of the five
      var w = COLORS[rand(COLORS.length)];
      // ink: usually DIFFERENT from the word (~80% mismatch)
      var ink;
      if (rand(5) === 0) {
        ink = w; // occasional congruent trial
      } else {
        var others = COLORS.filter(function (c) { return c.id !== w.id; });
        ink = others[rand(others.length)];
      }
      inkId = ink.id; // correct answer = INK color
      word.textContent = w.label;
      word.style.color = ink.hex;
    }

    function flash(cls) {
      stage.classList.remove("stroop-right", "stroop-wrong");
      // force reflow so re-adding the same class re-triggers the transition
      void stage.offsetWidth;
      stage.classList.add(cls);
      clearTimeout(flashTimer);
      flashTimer = setTimeout(function () {
        stage.classList.remove("stroop-right", "stroop-wrong");
      }, 160);
    }

    function answer(pickedId) {
      if (!running) return;
      if (pickedId === inkId) {          // compare against INK, never the word
        score++;
        ctx.submitScore(score);
        flash("stroop-right");
      } else {
        flash("stroop-wrong");
      }
      renderStatus();
      nextTrial();
    }

    function tick() {
      if (Date.now() >= endAt) { finish(); return; }
      renderStatus();
    }

    function start() {
      overlay.classList.remove("show");
      score = 0;
      running = true;
      endAt = Date.now() + ROUND_MS;
      setPadsEnabled(true);
      nextTrial();
      renderStatus();
      clearInterval(roundTimer);
      roundTimer = setInterval(tick, 250);
    }

    function finish() {
      running = false;
      clearInterval(roundTimer);
      roundTimer = null;
      clearTimeout(flashTimer);
      stage.classList.remove("stroop-right", "stroop-wrong");
      setPadsEnabled(false);
      var best = ctx.submitScore(score);
      status.innerHTML = '<span class="gl-score">score ' + score + '</span><span>0s</span>';
      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + score + '</div>' +
          '<div class="g-sub">' + (best ? "new best! · " : "") + 'correct in 60s</div>' +
          '<button class="g-btn">play again</button>' +
        '</div>'
      );
    }

    function showOverlay(html) {
      overlay.innerHTML = html;
      overlay.querySelector("button").addEventListener("click", start);
      overlay.classList.add("show");
    }

    // initial idle state
    word.textContent = "Stroop";
    word.style.color = "var(--text)";
    setPadsEnabled(false);
    status.innerHTML = '<span class="gl-score">score 0</span><span>60s</span>';
    showOverlay('<button class="g-btn">start</button>');

    // teardown — clears the round timer (and the flash timer for good measure)
    return function () {
      clearInterval(roundTimer);
      clearTimeout(flashTimer);
      roundTimer = null;
      flashTimer = null;
      running = false;
    };
  }
});
