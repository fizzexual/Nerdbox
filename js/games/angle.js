/* Angle Eye — visual angle estimation.
   A ray is drawn from a center point at a random angle. Convention (stated on
   screen): the half-circle 0–180°, where 0° points RIGHT, 90° points STRAIGHT
   UP, and 180° points LEFT — measured counter-clockwise from the positive
   x-axis. Because every angle lives in [0,180], the error is just the plain
   absolute difference |guess − true| with NO wrap-around to worry about.
   Type your estimate and submit (Enter or button). Within tolerance (starts
   ±8°, tightens 1° per round, floor ±4°) -> streak++, submitScore, new angle;
   otherwise game over: reveal the true angle + your guess, best, play again.
   scoreMode "max" = longest streak. One injectStyle + one register. */
NERDBOX.injectStyle("angle", `
  .angle-wrap { position: relative; width: 100%; max-width: 520px; margin: 0 auto;
    display: flex; flex-direction: column; align-items: center; gap: 1.1rem; }
  .angle-stage { position: relative; width: 100%; max-width: 440px; aspect-ratio: 2 / 1;
    background: var(--bg-alt); border-radius: 16px; overflow: hidden;
    box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--sub-alt) 40%, transparent); }
  .angle-stage svg { display: block; width: 100%; height: 100%; }
  .angle-ref { stroke: var(--sub-alt); stroke-width: 2; opacity: 0.55; stroke-dasharray: 5 6; }
  .angle-arc { stroke: var(--sub); stroke-width: 2; fill: none; opacity: 0.6; }
  .angle-ray { stroke: var(--accent); stroke-width: 4; stroke-linecap: round; }
  .angle-hub { fill: var(--accent); }
  .angle-tick { fill: var(--sub); font-family: "JetBrains Mono", monospace; font-size: 11px; }
  .angle-conv { font-family: "JetBrains Mono", monospace; font-size: 0.74rem; color: var(--sub);
    text-align: center; line-height: 1.5; }
  .angle-conv b { color: var(--accent); font-weight: 500; }
  .angle-pad { display: flex; align-items: center; justify-content: center; gap: 0.6rem; }
  .angle-input { width: 7rem; background: var(--bg-alt); color: var(--text);
    border: 1px solid var(--sub-alt); border-radius: 10px; padding: 0.55rem 0.4rem;
    font-family: "JetBrains Mono", monospace; font-size: 1.7rem; text-align: center;
    letter-spacing: 1px; -moz-appearance: textfield; }
  .angle-input::-webkit-outer-spin-button,
  .angle-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .angle-input:focus { outline: none; border-color: var(--accent); }
  .angle-unit { font-family: "JetBrains Mono", monospace; font-size: 1.4rem; color: var(--sub); }
  .angle-pad.locked .angle-input { pointer-events: none; opacity: 0.6; }
  .angle-msg { color: var(--go); }
  .angle-msg.miss { color: var(--error); }
  .angle-tol { color: var(--sub); }
  .angle-result-line { color: var(--sub); font-size: 0.95rem; }
  .angle-result-line b { color: var(--text); font-family: "JetBrains Mono", monospace; }
`);

NERDBOX.register({
  id: "angle",
  name: "Angle Eye",
  tagline: "estimate the angle in degrees",
  category: "perception",
  scoreMode: "max",
  formatScore: function (v) { return v + " streak"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19h18"/><path d="M3 19 19 7"/><path d="M11 19a8 8 0 0 0-2.1-5.4"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;

    // --- geometry of the SVG stage (viewBox units) ---
    var VW = 440, VH = 220;          // viewBox width / height
    var CX = VW / 2, CY = VH - 28;   // center / origin near the bottom edge
    var R = 150;                     // ray length
    var TOL_START = 8, TOL_FLOOR = 4;

    var streak = 0;
    var trueAngle = 0;               // current target, degrees in [0,180]
    var phase = "idle";              // idle | input | between | over
    var timers = [];

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

    // tolerance shrinks 1° per round, never below the floor
    function tolFor(s) { return Math.max(TOL_FLOOR, TOL_START - s); }

    // endpoint of a ray at `deg` (math convention: CCW from +x axis).
    // SVG y grows downward, so we SUBTRACT the sine to point upward.
    function endpoint(deg, len) {
      var rad = deg * Math.PI / 180;
      return { x: CX + len * Math.cos(rad), y: CY - len * Math.sin(rad) };
    }

    // --- DOM ---
    var status = el("div", "g-status");
    var wrap = el("div", "angle-wrap");
    var stage = el("div", "angle-stage");
    var conv = el("div", "angle-conv",
      'estimate the <b>orange</b> ray &middot; <b>0&deg;</b> points right, ' +
      '<b>90&deg;</b> straight up, <b>180&deg;</b> left' +
      '<br>(measured counter-clockwise, range 0&ndash;180)');

    var pad = el("div", "angle-pad");
    var input = el("input", "angle-input");
    input.type = "number"; input.min = "0"; input.max = "180"; input.step = "1";
    input.setAttribute("inputmode", "numeric");
    input.setAttribute("aria-label", "your angle estimate in degrees");
    var unit = el("span", "angle-unit", "&deg;");
    pad.appendChild(input);
    pad.appendChild(unit);

    var submit = el("button", "g-btn angle-submit", "submit");
    var overlay = el("div", "g-overlay");

    wrap.appendChild(stage);
    wrap.appendChild(conv);
    wrap.appendChild(pad);
    wrap.appendChild(submit);
    wrap.appendChild(overlay);

    root.appendChild(status);
    root.appendChild(wrap);

    function setStatus(msg, miss) {
      var s = '<span>streak&nbsp;<b style="color:var(--text);font-weight:500">' + streak + "</b></span>";
      if (msg) {
        s += '<span class="angle-msg' + (miss ? " miss" : "") + '">' + msg + "</span>";
      } else if (phase === "input") {
        s += '<span class="angle-tol">within &plusmn;' + tolFor(streak) + "&deg;</span>";
      }
      status.innerHTML = s;
    }

    // draw the reference line, a faint guide arc, axis ticks, and (optionally)
    // the ray. If `guideDeg` is given, a second dimmed ray shows the guess.
    function draw(showRay, guideDeg) {
      var p = endpoint(trueAngle, R);
      var svg = '<svg viewBox="0 0 ' + VW + ' ' + VH + '" xmlns="http://www.w3.org/2000/svg">';
      // horizontal reference line across the full base (the 0°–180° axis)
      svg += '<line class="angle-ref" x1="' + (CX - R) + '" y1="' + CY +
             '" x2="' + (CX + R) + '" y2="' + CY + '"/>';
      // faint quarter/guide arc so the half-circle is legible
      var aL = endpoint(180, 30), aR = endpoint(0, 30), aT = endpoint(90, 30);
      svg += '<path class="angle-arc" d="M ' + aR.x.toFixed(1) + ' ' + aR.y.toFixed(1) +
             ' A 30 30 0 0 0 ' + aL.x.toFixed(1) + ' ' + aL.y.toFixed(1) + '"/>';
      // little axis labels at 0 / 90 / 180
      svg += '<text class="angle-tick" x="' + (CX + R + 4) + '" y="' + (CY + 4) +
             '" text-anchor="start">0</text>';
      svg += '<text class="angle-tick" x="' + (CX - R - 4) + '" y="' + (CY + 4) +
             '" text-anchor="end">180</text>';
      svg += '<text class="angle-tick" x="' + CX + '" y="' + (CY - R - 6) +
             '" text-anchor="middle">90</text>';
      if (typeof guideDeg === "number") {
        var g = endpoint(guideDeg, R);
        svg += '<line class="angle-ray" style="stroke:var(--sub);opacity:0.7;stroke-dasharray:6 5" x1="' +
               CX + '" y1="' + CY + '" x2="' + g.x.toFixed(1) + '" y2="' + g.y.toFixed(1) + '"/>';
      }
      if (showRay) {
        svg += '<line class="angle-ray" x1="' + CX + '" y1="' + CY +
               '" x2="' + p.x.toFixed(1) + '" y2="' + p.y.toFixed(1) + '"/>';
      }
      svg += '<circle class="angle-hub" cx="' + CX + '" cy="' + CY + '" r="5"/>';
      svg += "</svg>";
      stage.innerHTML = svg;
    }

    function lockInput(lock) {
      pad.classList.toggle("locked", lock);
      input.disabled = lock;
      submit.disabled = lock;
    }

    function getGuess() {
      var v = parseFloat(input.value);
      return isFinite(v) ? v : null;
    }

    function newAngle() {
      // pick an angle in [4,176] so it's never flat against the axis / ambiguous
      trueAngle = 4 + ctx.util.rand(173);   // rand(173) -> 0..172  => 4..176
    }

    function startRound() {
      phase = "input";
      newAngle();
      draw(true);
      lockInput(false);
      input.value = "";
      setStatus();
      input.focus();
    }

    function onSubmit() {
      if (phase !== "input") return;
      var guess = getGuess();
      if (guess === null) { input.focus(); return; }      // require a number
      // clamp into the stated range so out-of-range typing is handled cleanly
      if (guess < 0) guess = 0;
      if (guess > 180) guess = 180;

      // no wrap-around: both values are in [0,180], so plain |difference|
      var err = Math.abs(guess - trueAngle);
      var tol = tolFor(streak);

      phase = "between";
      lockInput(true);

      if (err <= tol) {
        streak++;
        ctx.submitScore(streak);            // max -> longest streak
        setStatus("nice! it was " + Math.round(trueAngle) + "° (off " + err.toFixed(0) + "°)");
        after(850, function () { startRound(); });
      } else {
        gameOver(guess, err);
      }
    }

    function gameOver(guess, err) {
      phase = "over";
      lockInput(true);
      draw(true, guess);                    // reveal true ray + dimmed guess ray
      setStatus("missed — off by " + err.toFixed(0) + "°", true);
      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-big">' + streak + "</div>" +
          '<div class="g-sub">best streak</div>' +
          '<div class="angle-result-line">it was <b>' + Math.round(trueAngle) +
            "°</b> · you guessed <b>" + Math.round(guess) + "°</b></div>" +
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
      newAngle();
      draw(true);                           // show a sample ray behind the overlay
      setStatus();
      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-sub">estimate the angle of the ray · ±8° to start, tightening each round</div>' +
          '<button class="g-btn">start</button>' +
        "</div>";
      overlay.querySelector("button").addEventListener("click", startGame);
      overlay.classList.add("show");
    }

    submit.addEventListener("click", onSubmit);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); onSubmit(); }
    });

    showStart();

    return function teardown() { clearTimers(); };
  }
});
