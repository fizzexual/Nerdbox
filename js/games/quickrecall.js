/* Flash Recall (fast working memory) — a digit-span test, but FAST.
   A string of digits flashes BIG for a short window (~400 + length*120 ms),
   then hides; you type it back into the input and submit (Enter or button).
   Correct (input === the flashed number, exact) -> length++, submitScore(length),
   next round (one digit longer). Wrong -> game over: reveal the number,
   best = the most digits you ever cleared (max), "play again".
   Start length 3. The input auto-focuses. Self-contained: exactly one
   injectStyle + one register; the flash/hide + flash-feedback timers are all
   cleared in teardown so nothing fires after unmount. */
NERDBOX.injectStyle("quickrecall", `
  .quickrecall-wrap {
    position: relative; width: 100%; max-width: 560px;
    display: flex; flex-direction: column; align-items: center; gap: 1.4rem;
  }
  .quickrecall-card {
    width: 100%; min-height: 172px; background: var(--bg-alt);
    border: 1px solid color-mix(in srgb, var(--text) 6%, transparent);
    border-radius: 18px; padding: 2rem 1.6rem;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 1.4rem; transition: border-color 0.12s, box-shadow 0.12s;
  }
  .quickrecall-card.quickrecall-good {
    border-color: var(--go);
    box-shadow: 0 0 0 1px var(--go), 0 0 24px -8px var(--go);
  }
  .quickrecall-card.quickrecall-bad {
    border-color: var(--error);
    box-shadow: 0 0 0 1px var(--error), 0 0 24px -8px var(--error);
  }
  .quickrecall-num {
    font-family: "JetBrains Mono", monospace; font-weight: 700;
    font-size: clamp(2.6rem, 12vw, 4.6rem); line-height: 1;
    letter-spacing: 0.16em; color: var(--text); text-align: center;
    user-select: none; word-break: break-all; min-height: 1.1em;
  }
  .quickrecall-num.quickrecall-flash { color: var(--accent); }
  .quickrecall-num.quickrecall-dim { color: var(--sub-alt); letter-spacing: 0.5em; }
  .quickrecall-form { display: flex; gap: 0.7rem; align-items: stretch; width: 100%; max-width: 340px; }
  .quickrecall-input {
    flex: 1 1 auto; width: 100%; background: var(--bg); color: var(--text);
    border: 1px solid var(--sub-alt); border-radius: 12px;
    padding: 0.65rem 0.8rem; text-align: center;
    font-family: "JetBrains Mono", monospace; font-size: 1.7rem; font-weight: 500;
    letter-spacing: 0.16em; transition: border-color 0.12s;
  }
  .quickrecall-input::placeholder { color: var(--sub); opacity: 0.55; letter-spacing: 0.06em; }
  .quickrecall-input:focus { outline: none; border-color: var(--accent); }
  .quickrecall-input:disabled { opacity: 0.5; }
  .quickrecall-input::-webkit-outer-spin-button,
  .quickrecall-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .quickrecall-input[type=number] { -moz-appearance: textfield; }
  .quickrecall-go { padding: 0.65rem 1.3rem; font-size: 1.05rem; }
  .quickrecall-hint {
    font-family: "JetBrains Mono", monospace; font-size: 0.9rem;
    color: var(--sub); min-height: 1.2em; text-align: center;
  }
  .quickrecall-hint.quickrecall-was { color: var(--error); }
  .quickrecall-hint.quickrecall-win { color: var(--go); }
  .quickrecall-hint b { color: var(--accent); font-weight: 500; }
`);

NERDBOX.register({
  id: "quickrecall",
  name: "Flash Recall",
  tagline: "memorize in a blink, type it back",
  category: "memory",
  scoreMode: "max",
  formatScore: function (v) { return v + " digits"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;
    var START = 3;             // start length (3 digits)

    var len = START;           // current target digit-count
    var target = "";           // the flashed number, as a string of exactly `len` digits
    var phase = "idle";        // "show" | "input" | "over" | "idle"

    // ---- timers (all cleared in teardown so nothing fires after unmount) ----
    var flashT = null;         // hides the number after the flash window
    var fxT = null;            // clears the good/bad card flash highlight

    function clearFlash() { if (flashT) { clearTimeout(flashT); flashT = null; } }
    function clearFx() { if (fxT) { clearTimeout(fxT); fxT = null; } }
    function clearAll() { clearFlash(); clearFx(); }

    function escapeHtml(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    // Build a number with exactly `n` digits: first digit 1-9 (no leading zero,
    // so it always has `n` digits), the rest 0-9. Kept as a string so the exact
    // compare is purely textual and never loses a leading-position digit.
    function makeNumber(n) {
      var s = String(1 + rand(9));            // 1..9
      for (var i = 1; i < n; i++) s += String(rand(10)); // 0..9
      return s;
    }

    // ---- DOM ----
    var status = el("div", "g-status", "");
    var wrap = el("div", "quickrecall-wrap");

    var card = el("div", "quickrecall-card");
    var numEl = el("div", "quickrecall-num", "");

    var form = document.createElement("form");
    form.className = "quickrecall-form";
    var input = document.createElement("input");
    input.type = "text";                 // text (not number): full control, exact textual compare
    input.className = "quickrecall-input";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "off");
    input.spellcheck = false;
    input.placeholder = "type it back";
    input.disabled = true;
    var goBtn = el("button", "g-btn quickrecall-go", "submit");
    goBtn.type = "submit";
    form.appendChild(input);
    form.appendChild(goBtn);

    var hint = el("div", "quickrecall-hint", "watch the number, then type it back");

    card.appendChild(numEl);
    card.appendChild(form);
    card.appendChild(hint);
    wrap.appendChild(card);

    var overlay = el("div", "g-overlay");
    wrap.appendChild(overlay);

    root.appendChild(status);
    root.appendChild(wrap);

    // ---- helpers ----
    function setStatus() {
      var best = NERDBOX.getBest("quickrecall");
      status.innerHTML =
        '<span class="gl-score">round ' + (len - START + 1) + '</span>' +
        '<span class="gl-time">' + len + ' digit' + (len === 1 ? "" : "s") + '</span>' +
        (best === null ? "" : '<span class="gl-time">best ' + best + '</span>');
    }

    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      var b = overlay.querySelector("button");
      if (b) b.addEventListener("click", function () { overlay.classList.remove("show"); onPlay(); });
      overlay.classList.add("show");
    }

    function setForm(on) {
      input.disabled = !on;
      goBtn.disabled = !on;
    }

    function flashCard(cls) {
      clearFx();
      card.classList.remove("quickrecall-good", "quickrecall-bad");
      void card.offsetWidth; // restart transition
      card.classList.add(cls);
      fxT = setTimeout(function () {
        card.classList.remove("quickrecall-good", "quickrecall-bad");
        fxT = null;
      }, 280);
    }

    // ---- a round: flash the number BIG for a short window, then hide & take input ----
    function flashNumber() {
      phase = "show";
      target = makeNumber(len);

      setForm(false);
      input.value = "";
      numEl.className = "quickrecall-num quickrecall-flash";
      numEl.textContent = target;          // textContent is safe (no escape needed)
      hint.className = "quickrecall-hint";
      hint.textContent = "memorize — " + len + " digits";

      var dur = 400 + len * 120;           // short flash; grows a little with length

      clearFlash();
      flashT = setTimeout(function () {
        flashT = null;
        if (phase !== "show") return;      // guard against a late fire
        hideAndAsk();
      }, dur);
    }

    function hideAndAsk() {
      clearFlash();
      phase = "input";
      numEl.className = "quickrecall-num quickrecall-dim";
      numEl.textContent = "?".repeat(len); // a row of ? — same length as the number
      hint.className = "quickrecall-hint";
      hint.innerHTML = "type the <b>" + len + "</b> digits";
      setForm(true);
      input.value = "";
      input.focus();                       // auto-focus the input when it appears
    }

    function submit() {
      if (phase !== "input") return;
      var raw = input.value.trim();
      if (raw === "") { input.focus(); return; }      // ignore empty submit
      if (!/^[0-9]+$/.test(raw)) {                    // digits only; nudge, no penalty
        hint.className = "quickrecall-hint quickrecall-was";
        hint.textContent = "digits only";
        input.value = "";
        input.focus();
        return;
      }

      if (raw === target) {
        // correct: the most digits cleared so far is the score (max)
        var best = ctx.submitScore(len);
        flashCard("quickrecall-good");
        hint.className = "quickrecall-hint quickrecall-win";
        hint.textContent = best ? ("correct! new best — " + len) : ("correct! — " + len);
        setForm(false);
        phase = "idle";
        len++;                             // next round is one digit longer
        setStatus();
        clearFlash();
        flashT = setTimeout(function () { flashT = null; flashNumber(); }, 620);
      } else {
        gameOver();
      }
    }

    form.addEventListener("submit", function (e) { e.preventDefault(); submit(); });

    function gameOver() {
      clearAll();
      phase = "over";
      setForm(false);
      flashCard("quickrecall-bad");
      // best is recorded only on cleared rounds (above); reveal the answer here.
      var safeNum = escapeHtml(target);
      numEl.className = "quickrecall-num";
      numEl.textContent = target;          // reveal the number that beat you
      hint.className = "quickrecall-hint quickrecall-was";
      hint.innerHTML = "it was <b>" + safeNum + "</b>";

      var reached = len - 1;               // highest digit-count successfully cleared
      var best = NERDBOX.getBest("quickrecall");
      var isBest = best !== null && best === reached && reached > 0;
      showOverlay(
        '<div class="g-result">' +
        '<div class="g-big">' + reached + '</div>' +
        '<div class="g-sub">' + (isBest ? "new best! · " : "") + 'digits recalled</div>' +
        '<div class="g-sub">it was ' + safeNum + '</div>' +
        '<button class="g-btn">play again</button>' +
        '</div>',
        start
      );
    }

    function start() {
      clearAll();
      overlay.classList.remove("show");
      card.classList.remove("quickrecall-good", "quickrecall-bad");
      len = START;                         // reset to length 3
      setForm(false);
      setStatus();
      flashNumber();
    }

    // ---- initial screen ----
    numEl.textContent = "314";
    status.textContent = "a number flashes, then you type it back";
    showOverlay(
      '<div class="g-result">' +
      '<div class="g-sub">a number <b>flashes</b> for a blink, then hides — type it back</div>' +
      '<div class="g-sub">each round adds a digit. starts at 3.</div>' +
      '<button class="g-btn">start</button>' +
      '</div>',
      start
    );

    // teardown: clear the flash/hide timer + the flash-feedback timer so nothing
    // fires after unmount.
    return function teardown() {
      phase = "over";
      clearAll();
    };
  }
});
