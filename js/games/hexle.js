/* Hexle — a random color is the target; guess its R,G,B by feel.
   Each channel tells you ▲ higher / ▼ lower / ✓ within ±8. Solve to keep a streak going.
   8 guesses per round; run out and the hex is revealed. */
NERDBOX.injectStyle("hexle", `
  .hexle-wrap { position: relative; width: 100%; max-width: 640px; display: flex; flex-direction: column; align-items: center; gap: 1.1rem; }
  .hexle-swatches { display: flex; gap: 1rem; width: 100%; justify-content: center; }
  .hexle-sw { flex: 1; max-width: 240px; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
  .hexle-chip { width: 100%; height: 120px; border-radius: 16px; border: 1px solid var(--sub-alt); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 6%, transparent); }
  .hexle-chip.hexle-mystery { display: flex; align-items: center; justify-content: center; background:
      repeating-linear-gradient(45deg, var(--bg-alt) 0 12px, var(--sub-alt) 12px 24px); }
  .hexle-q { font-family: "JetBrains Mono", monospace; font-size: 2.4rem; font-weight: 700; color: var(--text); }
  .hexle-label { font-family: "JetBrains Mono", monospace; font-size: 0.78rem; color: var(--sub); text-transform: uppercase; letter-spacing: 2px; }
  .hexle-hex { font-family: "JetBrains Mono", monospace; font-size: 0.95rem; color: var(--text); min-height: 1.2em; }
  .hexle-inputs { display: flex; gap: 0.7rem; align-items: flex-end; flex-wrap: wrap; justify-content: center; }
  .hexle-field { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; }
  .hexle-field > span { font-family: "JetBrains Mono", monospace; font-size: 0.8rem; color: var(--sub); }
  .hexle-field input {
    width: 84px; background: var(--bg-alt); color: var(--text);
    border: 1px solid var(--sub-alt); border-radius: 10px; padding: 0.55rem 0.4rem;
    font-family: "JetBrains Mono", monospace; font-size: 1.4rem; text-align: center;
  }
  .hexle-field input:focus { outline: none; border-color: var(--accent); }
  .hexle-field input::-webkit-outer-spin-button,
  .hexle-field input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .hexle-field input[type=number] { -moz-appearance: textfield; }
  .hexle-r > span { color: var(--error); }
  .hexle-g > span { color: var(--go); }
  .hexle-b > span { color: var(--accent); }
  .hexle-log { width: 100%; display: flex; flex-direction: column; gap: 0.4rem; max-height: 220px; overflow-y: auto; }
  .hexle-row {
    display: flex; align-items: center; gap: 0.7rem; background: var(--bg-alt);
    border: 1px solid color-mix(in srgb, var(--text) 5%, transparent); border-radius: 10px; padding: 0.45rem 0.7rem;
    font-family: "JetBrains Mono", monospace; font-size: 0.9rem; color: var(--text);
  }
  .hexle-row-chip { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--sub-alt); flex: none; }
  .hexle-row-hints { display: flex; gap: 0.8rem; }
  .hexle-row-hints b { font-weight: 500; }
  .hexle-up { color: var(--error); }
  .hexle-down { color: var(--accent); }
  .hexle-ok { color: var(--go); }
  .hexle-row-close { margin-left: auto; color: var(--sub); }
  .hexle-row-close b { color: var(--text); font-weight: 500; }
  .hexle-empty { font-family: "JetBrains Mono", monospace; color: var(--sub); font-size: 0.85rem; text-align: center; padding: 0.4rem; }
  .hexle-feed { font-family: "JetBrains Mono", monospace; font-size: 0.9rem; min-height: 1.2em; color: var(--sub); }
  .hexle-feed.hexle-nice { color: var(--go); }
`);

NERDBOX.register({
  id: "hexle",
  name: "Hexle",
  tagline: "guess the hex, get warmer",
  category: "puzzle",
  scoreMode: "max",
  formatScore: function (v) { return v + " solved"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 11l-8 8-5 1 1-5 8-8z"/><path d="M16 8l3 3"/><circle cx="6" cy="6" r="2.5"/></svg>',
  mount: function (root, ctx) {
    var rand = ctx.util.rand, el = ctx.util.el;
    var MAX_GUESSES = 8, TOL = 8;
    var streak = 0, target = null, guessesLeft = 0, roundOver = true;

    var status = el("div", "g-status", "");
    var wrap = el("div", "hexle-wrap");

    var swatches = el("div", "hexle-swatches");
    var targetSw = el("div", "hexle-sw");
    var targetChip = el("div", "hexle-chip hexle-mystery", '<span class="hexle-q">?</span>');
    targetSw.appendChild(el("div", "hexle-label", "target"));
    targetSw.appendChild(targetChip);
    targetSw.appendChild(el("div", "hexle-hex", "")); // revealed only on game over
    var targetHex = targetSw.lastChild;

    var guessSw = el("div", "hexle-sw");
    var guessChip = el("div", "hexle-chip");
    guessChip.style.background = "var(--bg-alt)";
    guessSw.appendChild(el("div", "hexle-label", "your guess"));
    guessSw.appendChild(guessChip);
    var guessHex = el("div", "hexle-hex", "—");
    guessSw.appendChild(guessHex);
    swatches.appendChild(targetSw); swatches.appendChild(guessSw);

    var inputs = el("div", "hexle-inputs");
    var fields = {};
    ["r", "g", "b"].forEach(function (ch) {
      var f = el("div", "hexle-field hexle-" + ch);
      f.appendChild(el("span", null, ch.toUpperCase()));
      var inp = document.createElement("input");
      inp.type = "number"; inp.min = "0"; inp.max = "255"; inp.placeholder = "0";
      inp.inputMode = "numeric";
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
      f.appendChild(inp);
      fields[ch] = inp;
      inputs.appendChild(f);
    });
    var goBtn = el("button", "g-btn", "guess");
    goBtn.style.padding = "0.55rem 1.4rem";
    goBtn.addEventListener("click", submit);
    var goField = el("div", "hexle-field");
    goField.appendChild(el("span", null, " "));
    goField.appendChild(goBtn);
    inputs.appendChild(goField);

    var feed = el("div", "hexle-feed", "");
    var log = el("div", "hexle-log");

    wrap.appendChild(swatches);
    wrap.appendChild(inputs);
    wrap.appendChild(feed);
    wrap.appendChild(log);

    var overlay = el("div", "g-overlay");
    wrap.appendChild(overlay);

    root.appendChild(status);
    root.appendChild(wrap);

    function clamp(n) { return Math.max(0, Math.min(255, n)); }
    function hex2(n) { var s = n.toString(16); return s.length < 2 ? "0" + s : s; }
    function toHex(c) { return "#" + hex2(c[0]) + hex2(c[1]) + hex2(c[2]); }
    function css(c) { return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")"; }
    function randColor() { return [rand(256), rand(256), rand(256)]; }

    function setStatus() {
      var used = MAX_GUESSES - guessesLeft;
      var n = Math.min(used + (roundOver ? 0 : 1), MAX_GUESSES);
      status.innerHTML =
        '<span class="gl-score">streak ' + streak + '</span>' +
        '<span class="gl-time">guess ' + n + ' / ' + MAX_GUESSES + '</span>';
    }

    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", function () { overlay.classList.remove("show"); onPlay(); });
      overlay.classList.add("show");
    }

    function clearInputs() {
      fields.r.value = ""; fields.g.value = ""; fields.b.value = "";
      guessChip.style.background = "var(--bg-alt)";
      guessHex.textContent = "—";
    }

    function start() {
      streak = 0;
      newRound();
    }

    function newRound() {
      overlay.classList.remove("show");
      target = randColor();
      guessesLeft = MAX_GUESSES;
      roundOver = false;
      targetHex.textContent = "";
      log.innerHTML = '<div class="hexle-empty">your guesses show up here</div>';
      feed.className = "hexle-feed";
      feed.textContent = "match the swatch — each channel is 0–255";
      clearInputs();
      setStatus();
      fields.r.focus();
    }

    function readChannel(inp) {
      var v = parseInt(inp.value, 10);
      if (isNaN(v)) v = 0;
      v = clamp(v);
      inp.value = String(v);
      return v;
    }

    function hintFor(diff) {
      if (Math.abs(diff) <= TOL) return { cls: "hexle-ok", sym: "✓" };   // ✓
      if (diff > 0) return { cls: "hexle-up", sym: "▲" };                 // ▲ target higher
      return { cls: "hexle-down", sym: "▼" };                            // ▼ target lower
    }

    function logGuess(guess, diffs, closeness, solved) {
      var empty = log.querySelector(".hexle-empty");
      if (empty) log.innerHTML = "";
      var row = el("div", "hexle-row");
      var chip = el("div", "hexle-row-chip");
      chip.style.background = css(guess);
      row.appendChild(chip);
      var hints = el("div", "hexle-row-hints");
      ["R", "G", "B"].forEach(function (lbl, i) {
        var h = hintFor(diffs[i]);
        hints.appendChild(el("span", h.cls, lbl + " <b>" + (solved ? "✓" : h.sym) + "</b>"));
      });
      row.appendChild(hints);
      row.appendChild(el("div", "hexle-row-close", "<b>" + closeness + "%</b> close"));
      log.insertBefore(row, log.firstChild);
    }

    function submit() {
      if (roundOver) return;
      var guess = [readChannel(fields.r), readChannel(fields.g), readChannel(fields.b)];
      guessChip.style.background = css(guess);
      guessHex.textContent = toHex(guess);

      var diffs = [target[0] - guess[0], target[1] - guess[1], target[2] - guess[2]];
      var dist = Math.abs(diffs[0]) + Math.abs(diffs[1]) + Math.abs(diffs[2]);
      var closeness = Math.round(100 * (1 - dist / 765));
      var solved = Math.abs(diffs[0]) <= TOL && Math.abs(diffs[1]) <= TOL && Math.abs(diffs[2]) <= TOL;

      guessesLeft--;
      logGuess(guess, diffs, closeness, solved);

      if (solved) {
        roundOver = true;
        streak++;
        ctx.submitScore(streak);
        setStatus();
        feed.className = "hexle-feed hexle-nice";
        feed.textContent = "nice! " + toHex(target) + " — next color…";
        setTimeout(function () { if (roundOver && overlay.className.indexOf("show") === -1) newRound(); }, 1100);
        return;
      }

      setStatus();

      if (guessesLeft <= 0) {
        roundOver = true;
        targetHex.textContent = toHex(target);
        feed.className = "hexle-feed";
        feed.textContent = "out of guesses — it was " + toHex(target);
        showOverlay(
          '<div class="g-result">' +
          '<div class="g-big">' + streak + '</div>' +
          '<div class="g-sub">best streak this run · target was ' + toHex(target) + '</div>' +
          '<button class="g-btn">play again</button>' +
          '</div>',
          start
        );
        return;
      }

      feed.className = "hexle-feed";
      feed.textContent = closeness + "% close · " + guessesLeft + " guess" + (guessesLeft === 1 ? "" : "es") + " left";
    }

    status.textContent = "guess the hidden color, one channel at a time";
    log.innerHTML = '<div class="hexle-empty">your guesses show up here</div>';
    showOverlay('<button class="g-btn">start</button>', start);

    return function () {};
  }
});
