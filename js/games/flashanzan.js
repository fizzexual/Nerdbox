/* Flash Anzan — soroban-style flash mental arithmetic.
   A sequence of numbers flashes one at a time in the center; sum them in your
   head, then type the total. Correct → level up and a faster, longer round.
   One wrong answer ends the run. Difficulty (count / digits / speed) ramps by
   level and gets genuinely brutal. */
NERDBOX.injectStyle("flashanzan", `
  .fan-wrap {
    position: relative; width: 100%; max-width: 560px;
    display: flex; flex-direction: column; align-items: center; gap: 1.4rem;
  }
  .fan-stage {
    width: 100%; min-height: 220px; background: var(--bg-alt);
    border: 1px solid color-mix(in srgb, var(--text) 6%, transparent);
    border-radius: 18px; padding: 2rem 1.4rem;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 1.3rem; text-align: center;
  }
  .fan-flash {
    font-family: "JetBrains Mono", monospace; font-weight: 700;
    font-size: clamp(3rem, 16vw, 6rem); line-height: 1; color: var(--text);
    letter-spacing: 2px; user-select: none; min-height: 1em;
  }
  .fan-flash.fan-blank { color: transparent; }
  .fan-ready {
    font-family: "JetBrains Mono", monospace; font-size: 1.2rem;
    color: var(--sub); letter-spacing: 1px;
  }
  .fan-ready b { color: var(--accent); font-size: 2.4rem; }
  .fan-form { display: flex; gap: 0.7rem; align-items: stretch; }
  .fan-input {
    width: 200px; background: var(--bg); color: var(--text);
    border: 1px solid var(--sub-alt); border-radius: 12px;
    padding: 0.6rem 0.7rem; text-align: center;
    font-family: "JetBrains Mono", monospace; font-size: 1.9rem; font-weight: 500;
    transition: border-color 0.12s;
  }
  .fan-input::placeholder { color: var(--sub); opacity: 0.6; }
  .fan-input:focus { outline: none; border-color: var(--accent); }
  .fan-tag {
    font-family: "JetBrains Mono", monospace; font-size: 0.95rem;
    color: var(--sub); min-height: 1.2em;
  }
  .fan-tag.fan-good { color: var(--accent); }
  .fan-tag.fan-bad { color: var(--error); }
`);

NERDBOX.register({
  id: "flashanzan",
  name: "Flash Anzan",
  tagline: "sum the numbers that flash by",
  category: "reasoning",
  difficulty: "extreme",
  scoreMode: "max",
  formatScore: function (v) { return "lvl " + v; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
  mount: function (root, ctx) {
    var rand = ctx.util.rand, el = ctx.util.el;

    var level = 1;          // current level (also the score)
    var sum = 0;            // running answer for the current round
    var timers = [];        // every setTimeout handle we create
    var flashT = null;      // the single active chained-flash handle
    var phase = "idle";     // idle | ready | flashing | input | over

    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    function clearAll() {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers = [];
      flashT = null;
    }

    // ----- level → round parameters -----
    function paramsFor(lv) {
      var count = 3 + Math.floor(lv / 2);
      if (count > 12) count = 12;
      var min, max;
      if (lv < 3) { min = 1; max = 9; }
      else if (lv < 6) { min = 10; max = 99; }
      else { min = 100; max = 999; }
      var flashMs = 700 - lv * 45;
      if (flashMs < 220) flashMs = 220;
      return { count: count, min: min, max: max, flashMs: flashMs };
    }

    // ----- DOM -----
    var status = el("div", "g-status", "");
    var wrap = el("div", "fan-wrap");
    var stage = el("div", "fan-stage");
    var flash = el("div", "fan-flash", "&nbsp;");

    var form = document.createElement("form");
    form.className = "fan-form";
    form.style.display = "none";
    var input = document.createElement("input");
    input.type = "text";
    input.className = "fan-input";
    input.inputMode = "numeric";
    input.setAttribute("autocomplete", "off");
    input.placeholder = "sum?";
    var goBtn = el("button", "g-btn", "submit");
    goBtn.type = "submit";
    form.appendChild(input);
    form.appendChild(goBtn);

    var tag = el("div", "fan-tag", "");

    stage.appendChild(flash);
    stage.appendChild(form);
    stage.appendChild(tag);
    wrap.appendChild(stage);

    var overlay = el("div", "g-overlay");
    wrap.appendChild(overlay);

    root.appendChild(status);
    root.appendChild(wrap);

    // ----- helpers -----
    function setStatus() {
      status.innerHTML = '<span class="gl-score">level ' + level + '</span>';
    }
    function showFlash(txt, blank) {
      flash.textContent = txt;
      if (blank) flash.classList.add("fan-blank");
      else flash.classList.remove("fan-blank");
    }
    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", function () { overlay.classList.remove("show"); onPlay(); });
      overlay.classList.add("show");
    }

    // ----- round lifecycle -----
    function startRound() {
      phase = "ready";
      setStatus();
      form.style.display = "none";
      tag.className = "fan-tag";
      tag.textContent = "";
      input.value = "";
      stage.innerHTML = "";
      var ready = el("div", "fan-ready", "get ready");
      stage.appendChild(ready);
      // countdown 3 · 2 · 1, then flash the sequence
      var steps = [3, 2, 1];
      function step(i) {
        if (i >= steps.length) { runFlashes(); return; }
        ready.innerHTML = "get ready&hellip; <b>" + steps[i] + "</b>";
        flashT = later(function () { step(i + 1); }, 650);
      }
      step(0);
    }

    function runFlashes() {
      var p = paramsFor(level);
      var nums = [];
      sum = 0;
      for (var i = 0; i < p.count; i++) {
        var n = p.min + rand(p.max - p.min + 1);
        nums.push(n);
        sum += n;
      }
      // rebuild stage with the flash element
      stage.innerHTML = "";
      flash = el("div", "fan-flash", "&nbsp;");
      stage.appendChild(flash);
      phase = "flashing";

      var GAP = 120;
      // chained setTimeouts: show number, blank, show next … track flashT each hop
      function showAt(i) {
        if (i >= nums.length) { flashT = later(askInput, GAP); return; }
        showFlash(String(nums[i]), false);
        flashT = later(function () {
          showFlash("", true);                 // brief blank between numbers
          flashT = later(function () { showAt(i + 1); }, GAP);
        }, p.flashMs);
      }
      showAt(0);
    }

    function askInput() {
      phase = "input";
      stage.innerHTML = "";
      var prompt = el("div", "fan-ready", "= ?");
      stage.appendChild(prompt);
      stage.appendChild(form);
      stage.appendChild(tag);
      form.style.display = "flex";
      input.value = "";
      input.focus();
    }

    function submit() {
      if (phase !== "input") return;
      var raw = input.value.replace(/[^0-9]/g, "");
      if (raw === "") { input.focus(); return; }
      var val = parseInt(raw, 10);
      if (isNaN(val)) { input.value = ""; input.focus(); return; }

      if (val === sum) {
        phase = "ready";
        form.style.display = "none";
        level++;
        setStatus();
        tag.className = "fan-tag fan-good";
        tag.textContent = "✓ correct — level " + level;
        flashT = later(startRound, 850);
      } else {
        gameOver(val);
      }
    }

    function gameOver(guess) {
      phase = "over";
      clearAll();
      form.style.display = "none";
      input.blur();
      var reached = level;            // the level reached this run
      var best = ctx.submitScore(reached);
      showOverlay(
        '<div class="g-result">' +
        '<div class="g-big">lvl ' + reached + '</div>' +
        '<div class="g-sub">' + (best ? "new best! · " : "") +
        'sum was ' + sum + ', you said ' + guess + '</div>' +
        '<button class="g-btn">play again</button>' +
        '</div>',
        function () { level = 1; startRound(); }
      );
    }

    // ----- input handling -----
    function onSubmit(e) { e.preventDefault(); submit(); }
    function onInput() {
      var cleaned = input.value.replace(/[^0-9]/g, "");
      if (cleaned !== input.value) input.value = cleaned; // digits only
    }
    form.addEventListener("submit", onSubmit);
    input.addEventListener("input", onInput);

    // ----- initial screen -----
    setStatus();
    showFlash("?", false);
    showOverlay(
      '<div class="g-result">' +
      '<div class="g-sub">numbers will flash — add them up</div>' +
      '<button class="g-btn">start</button>' +
      '</div>',
      function () { level = 1; startRound(); }
    );

    // teardown: cancel every pending timer (incl. the active chained flash) and
    // drop the form/input listeners so nothing fires after unmount.
    return function () {
      phase = "over";
      clearAll();
      form.removeEventListener("submit", onSubmit);
      input.removeEventListener("input", onInput);
    };
  }
});
