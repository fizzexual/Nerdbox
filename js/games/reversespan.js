/* Reverse Span (hard memory) — digit span, but BACKWARDS.
   A number with N digits flashes big for ~(700 + N*250) ms behind a draining
   countdown bar, then hides. You must type the number REVERSED and submit
   (Enter or button). Correct (input === number reversed) -> score N, then N++
   (one digit longer) for the next round. Wrong -> game over: it reveals the
   number and its reversal. Best = the most digits you ever cleared (max).
   Start N=2 (reversing a single digit would be trivial). Self-contained:
   exactly one injectStyle + one register; the show/flash timers are cleared
   in teardown so nothing fires after unmount. */
NERDBOX.injectStyle("reversespan", `
  .reversespan-wrap {
    position: relative; width: 100%; max-width: 560px;
    display: flex; flex-direction: column; align-items: center; gap: 1.4rem;
  }
  .reversespan-bar {
    width: 100%; height: 6px; border-radius: 99px; overflow: hidden;
    background: var(--sub-alt); opacity: 0; transition: opacity 0.18s;
  }
  .reversespan-bar.reversespan-on { opacity: 1; }
  .reversespan-bar > i {
    display: block; height: 100%; width: 100%;
    background: var(--accent); transform-origin: left center;
  }
  .reversespan-card {
    width: 100%; min-height: 168px; background: var(--bg-alt);
    border: 1px solid color-mix(in srgb, var(--text) 6%, transparent);
    border-radius: 18px; padding: 2rem 1.6rem;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 1.4rem; transition: border-color 0.12s, box-shadow 0.12s;
  }
  .reversespan-card.reversespan-good {
    border-color: var(--go);
    box-shadow: 0 0 0 1px var(--go), 0 0 24px -8px var(--go);
  }
  .reversespan-card.reversespan-bad {
    border-color: var(--error);
    box-shadow: 0 0 0 1px var(--error), 0 0 24px -8px var(--error);
  }
  .reversespan-num {
    font-family: "JetBrains Mono", monospace; font-weight: 700;
    font-size: clamp(2.6rem, 12vw, 4.4rem); line-height: 1;
    letter-spacing: 0.14em; color: var(--text); text-align: center;
    user-select: none; word-break: break-all;
  }
  .reversespan-num.reversespan-dim { color: var(--sub-alt); letter-spacing: 0.5em; }
  .reversespan-form { display: flex; gap: 0.7rem; align-items: stretch; width: 100%; max-width: 340px; }
  .reversespan-input {
    flex: 1 1 auto; width: 100%; background: var(--bg); color: var(--text);
    border: 1px solid var(--sub-alt); border-radius: 12px;
    padding: 0.65rem 0.8rem; text-align: center;
    font-family: "JetBrains Mono", monospace; font-size: 1.7rem; font-weight: 500;
    letter-spacing: 0.12em; transition: border-color 0.12s;
  }
  .reversespan-input::placeholder { color: var(--sub); opacity: 0.55; }
  .reversespan-input:focus { outline: none; border-color: var(--accent); }
  .reversespan-input:disabled { opacity: 0.5; }
  .reversespan-input::-webkit-outer-spin-button,
  .reversespan-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .reversespan-input[type=number] { -moz-appearance: textfield; }
  .reversespan-go { padding: 0.65rem 1.3rem; font-size: 1.05rem; }
  .reversespan-hint {
    font-family: "JetBrains Mono", monospace; font-size: 0.9rem;
    color: var(--sub); min-height: 1.2em; text-align: center;
  }
  .reversespan-hint.reversespan-was { color: var(--error); }
  .reversespan-hint.reversespan-win { color: var(--go); }
  .reversespan-hint b { color: var(--accent); font-weight: 500; }
`);

NERDBOX.register({
  id: "reversespan",
  name: "Reverse Span",
  tagline: "type the number — backwards",
  category: "memory",
  difficulty: "hard",
  scoreMode: "max",
  formatScore: function (v) { return v + " digits"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;
    var START = 2;             // reversing a single digit is trivial, so begin at 2

    var n = START;             // current target digit-count
    var current = "";          // the shown number, as a string of exactly n digits
    var target = "";           // current reversed -> what the player must type
    var phase = "idle";        // "show" | "input" | "over" | "idle"

    // ---- timers (cleared in teardown so nothing fires after unmount) ----
    var showT = null;          // hides the number after the flash window
    var rafId = null;          // drives the countdown bar
    var flashT = null;         // clears the good/bad card flash

    function clearShow() {
      if (showT) { clearTimeout(showT); showT = null; }
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }
    function clearFlash() { if (flashT) { clearTimeout(flashT); flashT = null; } }
    function clearAll() { clearShow(); clearFlash(); }

    function escapeHtml(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    // Build a number with exactly `len` digits: first digit 1-9 (no leading zero,
    // so it always has `len` digits), the rest 0-9. Returned as a string because
    // its reversal can legitimately contain leading zeros the player must type.
    function makeNumber(len) {
      var s = String(1 + rand(9));            // 1..9
      for (var i = 1; i < len; i++) s += String(rand(10)); // 0..9
      return s;
    }
    function reverseStr(s) { return s.split("").reverse().join(""); }

    // ---- DOM ----
    var status = el("div", "g-status", "");
    var wrap = el("div", "reversespan-wrap");

    var bar = el("div", "reversespan-bar", "<i></i>");
    var barFill = bar.firstChild;

    var card = el("div", "reversespan-card");
    var numEl = el("div", "reversespan-num", "");

    var form = document.createElement("form");
    form.className = "reversespan-form";
    var input = document.createElement("input");
    input.type = "text";                 // text (not number): preserve leading zeros, full control
    input.className = "reversespan-input";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "off");
    input.spellcheck = false;
    input.placeholder = "reversed";
    input.disabled = true;
    var goBtn = el("button", "g-btn reversespan-go", "submit");
    goBtn.type = "submit";
    form.appendChild(input);
    form.appendChild(goBtn);

    var hint = el("div", "reversespan-hint", "memorize it, then type it backwards");

    card.appendChild(numEl);
    card.appendChild(form);
    card.appendChild(hint);

    wrap.appendChild(bar);
    wrap.appendChild(card);

    var overlay = el("div", "g-overlay");
    wrap.appendChild(overlay);

    root.appendChild(status);
    root.appendChild(wrap);

    // ---- helpers ----
    function setStatus() {
      var best = NERDBOX.getBest("reversespan");
      status.innerHTML =
        '<span class="gl-score">round ' + n + '</span>' +
        '<span class="gl-time">' + n + ' digit' + (n === 1 ? "" : "s") + '</span>' +
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
      clearFlash();
      card.classList.remove("reversespan-good", "reversespan-bad");
      void card.offsetWidth; // restart transition
      card.classList.add(cls);
      flashT = setTimeout(function () {
        card.classList.remove("reversespan-good", "reversespan-bad");
        flashT = null;
      }, 280);
    }

    // ---- a round: flash the number, drain the bar, then hide & take input ----
    function flashNumber() {
      phase = "show";
      current = makeNumber(n);
      target = reverseStr(current);

      setForm(false);
      input.value = "";
      numEl.className = "reversespan-num";
      numEl.textContent = current;        // textContent is safe (no escape needed)
      hint.className = "reversespan-hint";
      hint.textContent = "memorize — " + n + " digits";

      var dur = 700 + n * 250;            // longer numbers linger longer

      // countdown bar: full -> empty over `dur`, no CSS transition (we drive it by rAF)
      bar.classList.add("reversespan-on");
      barFill.style.transition = "none";
      barFill.style.transform = "scaleX(1)";

      var start = (typeof performance !== "undefined" && performance.now)
        ? performance.now() : Date.now();
      function step(now) {
        var t = ((typeof performance !== "undefined" && performance.now) ? now : Date.now());
        var frac = 1 - (t - start) / dur;
        if (frac < 0) frac = 0;
        barFill.style.transform = "scaleX(" + frac + ")";
        if (frac > 0 && phase === "show") {
          rafId = requestAnimationFrame(step);
        } else {
          rafId = null;
        }
      }
      rafId = requestAnimationFrame(step);

      // hide the number when the window elapses, then ask for the reversal
      showT = setTimeout(function () {
        showT = null;
        if (phase !== "show") return;     // guard against late fire
        hideAndAsk();
      }, dur);
    }

    function hideAndAsk() {
      clearShow();
      phase = "input";
      bar.classList.remove("reversespan-on");
      barFill.style.transform = "scaleX(0)";
      numEl.className = "reversespan-num reversespan-dim";
      numEl.textContent = "?".repeat(n);  // a row of ? — same length as the number
      hint.className = "reversespan-hint";
      hint.innerHTML = "type the " + n + " digits <b>backwards</b>";
      setForm(true);
      input.value = "";
      input.focus();                      // auto-focus the input when it appears
    }

    function submit() {
      if (phase !== "input") return;
      var raw = input.value.trim();
      if (raw === "") { input.focus(); return; }     // ignore empty submit
      if (!/^[0-9]+$/.test(raw)) {                    // digits only; nudge, no penalty
        hint.className = "reversespan-hint reversespan-was";
        hint.textContent = "digits only";
        input.value = "";
        input.focus();
        return;
      }

      if (raw === target) {
        // correct: the most digits cleared so far is the score (max)
        var best = ctx.submitScore(n);
        flashCard("reversespan-good");
        hint.className = "reversespan-hint reversespan-win";
        hint.textContent = best ? ("correct! new best — " + n) : ("correct! — " + n);
        setForm(false);
        phase = "idle";
        n++;                              // next round is one digit longer
        setStatus();
        clearShow();
        showT = setTimeout(function () { showT = null; flashNumber(); }, 760);
      } else {
        gameOver();
      }
    }

    form.addEventListener("submit", function (e) { e.preventDefault(); submit(); });

    function gameOver() {
      clearAll();
      phase = "over";
      setForm(false);
      flashCard("reversespan-bad");
      // best is recorded only on cleared rounds (above); show the answer here.
      var safeNum = escapeHtml(current);
      var safeRev = escapeHtml(target);
      numEl.className = "reversespan-num";
      numEl.textContent = current;        // reveal the number that beat you
      hint.className = "reversespan-hint reversespan-was";
      hint.innerHTML = "it was <b>" + safeNum + "</b>, reversed: <b>" + safeRev + "</b>";

      var reached = n - 1;                // highest digit-count successfully cleared
      var best = NERDBOX.getBest("reversespan");
      var isBest = best !== null && best === reached && reached > 0;
      showOverlay(
        '<div class="g-result">' +
        '<div class="g-big">' + reached + '</div>' +
        '<div class="g-sub">' + (isBest ? "new best! · " : "") + 'digits reversed</div>' +
        '<div class="g-sub">it was ' + safeNum + ' &middot; reversed ' + safeRev + '</div>' +
        '<button class="g-btn">play again</button>' +
        '</div>',
        start
      );
    }

    function start() {
      clearAll();
      overlay.classList.remove("show");
      card.classList.remove("reversespan-good", "reversespan-bad");
      bar.classList.remove("reversespan-on");
      barFill.style.transform = "scaleX(1)";
      n = START;                          // reset to N=2
      setForm(false);
      setStatus();
      flashNumber();
    }

    // ---- initial screen ----
    numEl.textContent = "42";
    status.textContent = "watch a number, then type it backwards";
    showOverlay(
      '<div class="g-result">' +
      '<div class="g-sub">a number flashes, then hides — type it <b>reversed</b></div>' +
      '<div class="g-sub">each round adds a digit. starts at 2.</div>' +
      '<button class="g-btn">start</button>' +
      '</div>',
      start
    );

    // teardown: clear the show timer (+ bar rAF + flash) so nothing fires after unmount
    return function teardown() {
      phase = "over";
      clearAll();
    };
  }
});
