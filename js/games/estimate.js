/* Estimate — numerosity. A cluster of N dots flashes for ~600ms, then vanishes.
   Guess how many you saw. Within 15% (tolerance = max(1, round(N*0.15))) and the
   streak grows and the next cluster gets bigger; miss and it's game over.
   scoreMode "max" = longest streak. Self-contained: one injectStyle + one register. */
NERDBOX.injectStyle("estimate", `
.estimate-wrap { position: relative; width: 100%; max-width: 560px; margin: 0 auto; }
.estimate-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 2;
  background: var(--bg-alt);
  border-radius: 16px;
  overflow: hidden;
}
.estimate-dot {
  position: absolute;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 45%, transparent);
  transform: translate(-50%, -50%);
  animation: estimate-pop 0.12s ease both;
}
@keyframes estimate-pop { from { transform: translate(-50%, -50%) scale(0.4); } to { transform: translate(-50%, -50%) scale(1); } }
.estimate-stage .estimate-hint {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--sub); font-family: "JetBrains Mono", monospace; font-size: 1rem;
  pointer-events: none; text-align: center; padding: 0 1rem;
}
.estimate-pad { display: flex; align-items: center; justify-content: center; gap: 0.6rem; margin-top: 1.2rem; min-height: 3rem; }
.estimate-step {
  width: 3rem; height: 3rem; border: none; border-radius: 10px;
  background: var(--bg-alt); color: var(--text);
  font-family: "JetBrains Mono", monospace; font-size: 1.5rem; line-height: 1;
  transition: filter 0.12s, transform 0.08s, background 0.12s;
}
.estimate-step:hover:not(:disabled) { background: var(--sub-alt); }
.estimate-step:active:not(:disabled) { transform: translateY(1px); }
.estimate-input {
  width: 7rem; background: var(--bg-alt); color: var(--text);
  border: 1px solid var(--sub-alt); border-radius: 10px;
  padding: 0.6rem 0.4rem; font-family: "JetBrains Mono", monospace;
  font-size: 1.8rem; text-align: center; letter-spacing: 2px;
  -moz-appearance: textfield;
}
.estimate-input::-webkit-outer-spin-button,
.estimate-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.estimate-input:focus { outline: none; border-color: var(--accent); }
.estimate-pad:disabled, .estimate-pad.locked { opacity: 0.55; }
.estimate-pad.locked .estimate-step, .estimate-pad.locked .estimate-input { pointer-events: none; }
.estimate-submit { margin-top: 1rem; }
.estimate-msg { color: var(--go); }
.estimate-msg.miss { color: var(--error); }
.estimate-result-line { color: var(--sub); font-size: 0.95rem; }
.estimate-result-line b { color: var(--text); font-family: "JetBrains Mono", monospace; }
`);

NERDBOX.register({
  id: "estimate",
  name: "Estimate",
  tagline: "how many dots did you just see?",
  category: "perception",
  scoreMode: "max",
  formatScore: function (v) { return v + " streak"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="7" r="1.6"/><circle cx="13" cy="5.5" r="1.6"/><circle cx="18.5" cy="9" r="1.6"/><circle cx="8" cy="13" r="1.6"/><circle cx="15.5" cy="15" r="1.6"/><circle cx="6.5" cy="18.5" r="1.6"/><circle cx="12" cy="20" r="1.6"/></svg>',
  mount: function (root, ctx) {
    var FLASH_MS = 600;     // dots are visible for ~600ms, then hidden
    var BASE = 8;           // dots in the first round
    var CAP = 80;           // never flash more than this many

    var streak = 0;         // current run length (max -> best)
    var count = 0;          // N dots flashed this round
    var phase = "idle";     // idle | flash | input | between | over
    var timers = [];        // EVERY timer id — cleared on teardown

    // ---- timer helpers: track every id so teardown can clear them all ----
    function after(ms, fn) {
      var id = setTimeout(function () {
        var k = timers.indexOf(id);
        if (k >= 0) timers.splice(k, 1);
        fn();
      }, ms);
      timers.push(id);
      return id;
    }
    function clearTimers() {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers = [];
    }

    function dotsFor(s) { return Math.min(BASE + s * 3, CAP); }
    function tolFor(n) { return Math.max(1, Math.round(n * 0.15)); }

    // ---- DOM ----
    var status = ctx.util.el("div", "g-status");
    var wrap = ctx.util.el("div", "estimate-wrap");
    var stage = ctx.util.el("div", "estimate-stage");
    var hint = ctx.util.el("div", "estimate-hint");
    var overlay = ctx.util.el("div", "g-overlay");

    var pad = ctx.util.el("div", "estimate-pad");
    var minus = ctx.util.el("button", "estimate-step", "&minus;");
    var input = ctx.util.el("input", "estimate-input");
    input.type = "number"; input.min = "0"; input.step = "1";
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("aria-label", "your estimate");
    var plus = ctx.util.el("button", "estimate-step", "+");
    pad.appendChild(minus); pad.appendChild(input); pad.appendChild(plus);

    var submit = ctx.util.el("button", "g-btn estimate-submit", "submit");

    stage.appendChild(hint);
    wrap.appendChild(stage);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);
    root.appendChild(pad);
    root.appendChild(submit);

    function setStatus(msg, miss) {
      var s = '<span>streak&nbsp;<b style="color:var(--text);font-weight:500">' + streak + "</b></span>";
      if (msg) s += '<span class="estimate-msg' + (miss ? " miss" : "") + '">' + msg + "</span>";
      else if (phase === "input") s += "<span>how many dots?</span>";
      status.innerHTML = s;
    }

    function lockInput(lock) {
      pad.classList.toggle("locked", lock);
      minus.disabled = lock; plus.disabled = lock; input.disabled = lock;
      submit.disabled = lock;
    }

    function getGuess() {
      var v = parseInt(input.value, 10);
      return isFinite(v) ? v : 0;
    }
    function setGuess(v) {
      if (v < 0) v = 0;
      input.value = String(v);
    }

    // ---- flash N dots, then hide them after ~600ms ----
    function flashDots(n) {
      // place dots at random, non-overlapping-ish positions (percentage coords)
      var pts = [];
      var minD = Math.max(5, 26 - n * 0.22);   // min spacing shrinks as it gets crowded
      for (var i = 0; i < n; i++) {
        var x = 0, y = 0, ok = false;
        for (var a = 0; a < 24; a++) {
          x = 7 + Math.random() * 86;          // keep dots off the very edges
          y = 9 + Math.random() * 82;
          ok = true;
          for (var j = 0; j < pts.length; j++) {
            var dx = pts[j][0] - x, dy = pts[j][1] - y;
            if (dx * dx + dy * dy < minD * minD) { ok = false; break; }
          }
          if (ok) break;
        }
        pts.push([x, y]);
      }
      var dotPx = Math.max(8, Math.round(18 - n * 0.12));
      for (var k = 0; k < pts.length; k++) {
        var d = ctx.util.el("div", "estimate-dot");
        d.style.left = pts[k][0] + "%";
        d.style.top = pts[k][1] + "%";
        d.style.width = dotPx + "px";
        d.style.height = dotPx + "px";
        stage.appendChild(d);
      }
    }

    function clearStage() {
      stage.innerHTML = "";
      stage.appendChild(hint);
    }

    // ---- a round: flash -> hide -> accept input ----
    function startRound() {
      phase = "flash";
      count = dotsFor(streak);
      hint.textContent = "";
      clearStage();
      lockInput(true);
      setStatus("watch…");
      flashDots(count);

      after(FLASH_MS, function () {
        // dots vanish; only now can the player type
        clearStage();
        hint.textContent = "how many?";
        phase = "input";
        lockInput(false);
        setGuess("");
        setStatus();
        input.focus();
      });
    }

    function onSubmit() {
      if (phase !== "input") return;
      var guess = getGuess();
      var tol = tolFor(count);
      phase = "between";
      lockInput(true);

      if (Math.abs(guess - count) <= tol) {
        streak++;
        ctx.submitScore(streak);          // max -> longest streak
        hint.textContent = "✓";
        setStatus("nice! it was " + count);
        after(900, function () { startRound(); });
      } else {
        gameOver(guess);
      }
    }

    function gameOver(guess) {
      phase = "over";
      lockInput(true);
      hint.textContent = "";
      setStatus("missed — it was " + count, true);
      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-big">' + streak + "</div>" +
          '<div class="g-sub">best streak</div>' +
          '<div class="estimate-result-line">it was <b>' + count + "</b> (you guessed <b>" + guess + "</b>)</div>" +
          '<button class="g-btn">play again</button>' +
        "</div>";
      overlay.querySelector("button").addEventListener("click", startGame);
      overlay.classList.add("show");
    }

    function startGame() {
      clearTimers();
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      streak = 0;
      startRound();
    }

    function showStart() {
      phase = "idle";
      lockInput(true);
      clearStage();
      hint.textContent = "a cluster of dots will flash — guess how many";
      setStatus();
      overlay.innerHTML = '<button class="g-btn">start</button>';
      overlay.querySelector("button").addEventListener("click", startGame);
      overlay.classList.add("show");
    }

    // ---- wiring ----
    minus.addEventListener("click", function () { if (phase === "input") setGuess(getGuess() - 1); });
    plus.addEventListener("click", function () { if (phase === "input") setGuess(getGuess() + 1); });
    submit.addEventListener("click", onSubmit);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); onSubmit(); }
    });

    showStart();

    return function () { clearTimers(); };
  }
});
