/* Math Sprint — mental arithmetic against the clock.
   One problem at a time for 60 seconds. Type the answer, press Enter (or
   hit submit). Right = +1 and the next problem; wrong = move on, no point.
   Mixes 2-digit addition, positive subtraction, single-digit multiplication,
   and division that always comes out whole (a*b shown, asked ÷ b). */
NERDBOX.injectStyle("mathsprint", `
  .mathsprint-wrap {
    position: relative; width: 100%; max-width: 560px;
    display: flex; flex-direction: column; align-items: center; gap: 1.4rem;
  }
  .mathsprint-bar {
    width: 100%; height: 6px; border-radius: 99px; overflow: hidden;
    background: var(--sub-alt);
  }
  .mathsprint-bar > i {
    display: block; height: 100%; width: 100%;
    background: var(--accent); transform-origin: left center;
    transition: transform 1s linear, background 0.3s;
  }
  .mathsprint-bar.mathsprint-low > i { background: var(--error); }
  .mathsprint-card {
    width: 100%; background: var(--bg-alt);
    border: 1px solid color-mix(in srgb, var(--text) 6%, transparent);
    border-radius: 18px; padding: 2.4rem 1.6rem;
    display: flex; flex-direction: column; align-items: center; gap: 1.5rem;
    transition: border-color 0.12s, box-shadow 0.12s;
  }
  .mathsprint-card.mathsprint-good {
    border-color: var(--go);
    box-shadow: 0 0 0 1px var(--go), 0 0 24px -8px var(--go);
  }
  .mathsprint-card.mathsprint-bad {
    border-color: var(--error);
    box-shadow: 0 0 0 1px var(--error), 0 0 24px -8px var(--error);
  }
  .mathsprint-q {
    font-family: "JetBrains Mono", monospace; font-weight: 700;
    font-size: clamp(2.4rem, 9vw, 3.6rem); line-height: 1; color: var(--text);
    letter-spacing: 1px; text-align: center; user-select: none;
  }
  .mathsprint-form { display: flex; gap: 0.7rem; align-items: stretch; }
  .mathsprint-input {
    width: 180px; background: var(--bg); color: var(--text);
    border: 1px solid var(--sub-alt); border-radius: 12px;
    padding: 0.6rem 0.7rem; text-align: center;
    font-family: "JetBrains Mono", monospace; font-size: 1.8rem; font-weight: 500;
    transition: border-color 0.12s;
  }
  .mathsprint-input::placeholder { color: var(--sub); opacity: 0.6; }
  .mathsprint-input:focus { outline: none; border-color: var(--accent); }
  .mathsprint-input::-webkit-outer-spin-button,
  .mathsprint-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .mathsprint-input[type=number] { -moz-appearance: textfield; }
  .mathsprint-go { padding: 0.6rem 1.3rem; font-size: 1.05rem; }
  .mathsprint-hint {
    font-family: "JetBrains Mono", monospace; font-size: 0.9rem;
    color: var(--sub); min-height: 1.2em; text-align: center;
  }
  .mathsprint-hint.mathsprint-was {
    color: var(--error);
  }
`);

NERDBOX.register({
  id: "mathsprint",
  name: "Math Sprint",
  tagline: "solve as many as you can in 60s",
  category: "reasoning",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8" y2="11"/><line x1="12" y1="11" x2="12" y2="11"/><line x1="16" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="8" y2="15"/><line x1="12" y1="15" x2="12" y2="15"/><line x1="16" y1="15" x2="16" y2="18"/></svg>',
  mount: function (root, ctx) {
    var rand = ctx.util.rand, el = ctx.util.el;
    var ROUND = 60;

    var running = false, timer = null, timeLeft = ROUND, score = 0, answer = 0, flashT = null;

    // ----- problem generators (each returns { text, answer }) -----
    function r(min, max) { return min + rand(max - min + 1); } // inclusive both ends

    function genAdd() {
      var a = r(10, 99), b = r(10, 99);
      return { text: a + " + " + b, answer: a + b };
    }
    function genSub() {
      // positive result guaranteed: a >= b
      var a = r(10, 99), b = r(10, a);
      return { text: a + " − " + b, answer: a - b };
    }
    function genMul() {
      // single-digit × single-or-two-digit
      var a = r(2, 9);
      var b = r(2, 19);
      return { text: a + " × " + b, answer: a * b };
    }
    function genDiv() {
      // build a*b, then ask (a*b) ÷ b  → always a whole number (= a)
      var quotient = r(2, 12);   // the answer
      var b = r(2, 12);          // divisor
      var dividend = quotient * b;
      return { text: dividend + " ÷ " + b, answer: quotient };
    }

    var generators = [genAdd, genSub, genMul, genDiv];

    function nextProblem() {
      var p = generators[rand(generators.length)]();
      answer = p.answer;
      qEl.textContent = p.text + " =";
      input.value = "";
      input.focus();
    }

    // ----- DOM -----
    var status = el("div", "g-status", "");
    var wrap = el("div", "mathsprint-wrap");

    var bar = el("div", "mathsprint-bar", "<i></i>");
    var barFill = bar.firstChild;

    var card = el("div", "mathsprint-card");
    var qEl = el("div", "mathsprint-q", "00 + 00 =");
    var form = document.createElement("form");
    form.className = "mathsprint-form";
    var input = document.createElement("input");
    input.type = "number";
    input.className = "mathsprint-input";
    input.inputMode = "numeric";
    input.setAttribute("step", "1");
    input.setAttribute("autocomplete", "off");
    input.placeholder = "?";
    var goBtn = el("button", "g-btn mathsprint-go", "submit");
    goBtn.type = "submit";
    form.appendChild(input);
    form.appendChild(goBtn);
    var hint = el("div", "mathsprint-hint", "type your answer, press Enter");

    card.appendChild(qEl);
    card.appendChild(form);
    card.appendChild(hint);

    wrap.appendChild(bar);
    wrap.appendChild(card);

    var overlay = el("div", "g-overlay");
    wrap.appendChild(overlay);

    root.appendChild(status);
    root.appendChild(wrap);

    // ----- helpers -----
    function setStatus() {
      status.innerHTML =
        '<span class="gl-score">score ' + score + '</span>' +
        '<span class="gl-time">' + timeLeft + 's</span>';
    }

    function setBar() {
      var frac = Math.max(0, timeLeft / ROUND);
      barFill.style.transform = "scaleX(" + frac + ")";
      if (timeLeft <= 10) bar.classList.add("mathsprint-low");
      else bar.classList.remove("mathsprint-low");
    }

    function flash(cls, msg, wasWrong) {
      if (flashT) { clearTimeout(flashT); flashT = null; }
      card.classList.remove("mathsprint-good", "mathsprint-bad");
      void card.offsetWidth; // restart transition
      card.classList.add(cls);
      hint.className = "mathsprint-hint" + (wasWrong ? " mathsprint-was" : "");
      hint.textContent = msg;
      flashT = setTimeout(function () {
        card.classList.remove("mathsprint-good", "mathsprint-bad");
      }, 260);
    }

    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", function () { overlay.classList.remove("show"); onPlay(); });
      overlay.classList.add("show");
    }

    // ----- input handling -----
    function submit() {
      if (!running) return;
      var raw = input.value.trim();
      if (raw === "") { input.focus(); return; } // ignore empty submits
      var val = parseInt(raw, 10);
      // only treat as an attempt if it's a complete, valid integer
      if (isNaN(val) || !/^[+-]?\d+$/.test(raw)) { input.value = ""; input.focus(); return; }

      if (val === answer) {
        score++;
        setStatus();
        flash("mathsprint-good", "correct! +1", false);
        nextProblem();
      } else {
        flash("mathsprint-bad", "nope — it was " + answer, true);
        nextProblem();
      }
    }

    form.addEventListener("submit", function (e) { e.preventDefault(); submit(); });

    // ----- round lifecycle -----
    function tick() {
      timeLeft--;
      if (timeLeft <= 0) {
        timeLeft = 0;
        setStatus();
        setBar();
        end();
        return;
      }
      setStatus();
      setBar();
    }

    function start() {
      if (timer) { clearInterval(timer); timer = null; }
      running = true;
      score = 0;
      timeLeft = ROUND;
      overlay.classList.remove("show");
      card.classList.remove("mathsprint-good", "mathsprint-bad");
      hint.className = "mathsprint-hint";
      hint.textContent = "go!";
      setStatus();
      // paint the full bar instantly (no animated drain on reset), then let ticks ease it down
      barFill.style.transition = "none";
      setBar();
      void barFill.offsetWidth;
      barFill.style.transition = "";
      nextProblem();
      timer = setInterval(tick, 1000);
    }

    function end() {
      running = false;
      if (timer) { clearInterval(timer); timer = null; }
      if (flashT) { clearTimeout(flashT); flashT = null; }
      card.classList.remove("mathsprint-good", "mathsprint-bad");
      input.blur();
      var best = ctx.submitScore(score);
      showOverlay(
        '<div class="g-result">' +
        '<div class="g-big">' + score + '</div>' +
        '<div class="g-sub">' + (best ? "new best! · " : "") + 'solved in 60s</div>' +
        '<button class="g-btn">play again</button>' +
        '</div>',
        start
      );
    }

    // ----- initial screen -----
    status.textContent = "60 seconds · how many can you solve?";
    qEl.textContent = "? + ? =";
    showOverlay('<button class="g-btn">start</button>', start);

    // teardown: clear the round timer (and any pending flash) so nothing fires after unmount
    return function () {
      if (timer) { clearInterval(timer); timer = null; }
      if (flashT) { clearTimeout(flashT); flashT = null; }
      running = false;
    };
  }
});
