/* Read the Room — social / emotion-perception drill. Each round a simple face is
   drawn with inline SVG whose eyebrows, eyes and mouth are PARAMETERIZED per
   emotion (happy / sad / angry / surprised / fearful / disgusted / neutral) so
   the expression is readable. Pick the matching word from 4 choices: correct →
   green flash, streak++, submit; wrong → game over, reveal the answer, best
   streak, play again. A little per-render jitter keeps faces from looking
   identical. Score = best streak. */
NERDBOX.injectStyle("reademotion", `
  .reademotion-wrap { position: relative; width: 100%; max-width: 520px; display: flex; flex-direction: column; align-items: center; gap: 1.3rem; }
  .reademotion-stage { width: 100%; min-height: 240px; border-radius: 18px; background: var(--bg-alt); border: 3px solid var(--bg-alt); display: flex; align-items: center; justify-content: center; padding: 1.2rem; transition: border-color 0.12s ease, background 0.12s ease; }
  .reademotion-stage.reademotion-good { border-color: var(--go); background: color-mix(in srgb, var(--go) 14%, var(--bg-alt)); }
  .reademotion-stage.reademotion-bad { border-color: var(--error); background: color-mix(in srgb, var(--error) 14%, var(--bg-alt)); }
  .reademotion-face { width: 210px; height: 210px; display: block; overflow: visible; }
  .reademotion-skin { fill: color-mix(in srgb, var(--accent) 16%, var(--bg)); stroke: color-mix(in srgb, var(--sub-alt) 55%, transparent); stroke-width: 2; }
  .reademotion-feature { fill: none; stroke: var(--text); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
  .reademotion-eyeball { fill: var(--text); stroke: none; }
  .reademotion-eyewhite { fill: color-mix(in srgb, var(--text) 12%, var(--bg)); stroke: var(--text); stroke-width: 3; }
  .reademotion-mouthfill { fill: color-mix(in srgb, var(--sub) 30%, var(--bg)); stroke: var(--text); stroke-width: 4; stroke-linejoin: round; }
  .reademotion-buttons { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem; width: 100%; max-width: 420px; }
  .reademotion-btn { width: 100%; text-transform: lowercase; letter-spacing: 0.02em; }
  .reademotion-btn:disabled { opacity: 0.5; cursor: default; }
  .reademotion-btn.reademotion-right { background: var(--go); color: var(--bg); }
  .reademotion-btn.reademotion-wrong { background: var(--error); color: var(--bg); }
  .reademotion-hint { font-family: "JetBrains Mono", monospace; font-size: 0.78rem; color: var(--sub); text-align: center; }
  .reademotion-hint b { color: var(--accent); font-weight: 500; }
  .reademotion-streak { color: var(--accent); }
`);

NERDBOX.register({
  id: "reademotion",
  name: "Read the Room",
  tagline: "name the emotion on the face",
  category: "perception",
  scoreMode: "max",
  formatScore: function (v) { return v + " streak"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand, shuffle = ctx.util.shuffle;

    var EMOTIONS = ["happy", "sad", "angry", "surprised", "fearful", "disgusted", "neutral"];

    var streak = 0;
    var best = 0;
    var current = null;     // current emotion key
    var locked = false;     // true between answer and next face
    var running = false;
    var timers = [];
    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    function clearTimers() { for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]); timers = []; }

    // small signed jitter in [-j, j]
    function jit(j) { return (Math.random() * 2 - 1) * j; }

    /* ---------------- face geometry ----------------
       viewBox 0..100. Head centred at (50,50) r 38.
       Eyes centred near y 44, x 35 / 65. Brows sit above each eye.
       Mouth centred near (50, 70).
       Each emotion returns a params object; render() turns params into SVG. */
    function paramsFor(e) {
      // shared eye centres
      var lx = 35, rx = 65, ey = 45;
      var p = {
        // brows: for each side a straight line from inner->outer point.
        // innerY/outerY are vertical offsets from a baseline (negative = higher).
        browBaseline: 30,
        browInnerDY: 0, browOuterDY: 0, browLen: 13, browGap: 4,
        // eyes
        eyeCx: [lx, rx], eyeCy: ey,
        eyeRx: 8, eyeRy: 8,        // lid opening (ellipse). ry small => squint
        pupilR: 3.2, eyeRound: false, // round wide white for surprise/fear
        // mouth: quadratic from (mx0,my) -> control (50, my+curve) -> (mx1,my)
        mouthY: 70, mouthW: 30, mouthCurve: 0, // curve<0 = smile(up), >0 = frown(down)
        mouthOpen: 0, mouthOpenW: 0, // open ellipse height/width (0 = closed)
        // disgust extras
        noseScrunch: false, asymBrow: 0
      };

      switch (e) {
        case "happy":
          // relaxed, slightly raised brows; normal eyes; big upturned smile.
          p.browInnerDY = -1; p.browOuterDY = -3; p.browLen = 12;
          p.eyeRy = 7;
          p.mouthCurve = -16; p.mouthW = 34; p.mouthY = 66;
          break;
        case "sad":
          // inner brows raised (oblique), droopy eyes, downturned mouth (frown).
          p.browInnerDY = -7; p.browOuterDY = 2; p.browLen = 12;
          p.eyeRy = 6.5; p.mouthCurve = 13; p.mouthW = 26; p.mouthY = 72;
          break;
        case "angry":
          // brows lowered + angled inward (\  /), narrowed eyes, tight flat mouth.
          p.browBaseline = 33;
          p.browInnerDY = 6; p.browOuterDY = -4; p.browLen = 14;
          p.eyeRy = 5; p.mouthCurve = 1; p.mouthW = 24; p.mouthY = 71;
          break;
        case "surprised":
          // brows raised high + arched, wide round eyes, open O mouth.
          p.browBaseline = 24;
          p.browInnerDY = -3; p.browOuterDY = -3; p.browLen = 13;
          p.eyeRound = true; p.eyeRx = 8; p.eyeRy = 9; p.pupilR = 3.6;
          p.mouthY = 71; p.mouthW = 0; p.mouthOpen = 16; p.mouthOpenW = 14;
          break;
        case "fearful":
          // brows raised AND drawn together, wide eyes, small tense open mouth.
          p.browBaseline = 25;
          p.browInnerDY = -2; p.browOuterDY = -1; p.browLen = 12; p.browGap = 2;
          p.eyeRound = true; p.eyeRx = 8; p.eyeRy = 9; p.pupilR = 3.4;
          p.mouthY = 71; p.mouthW = 22; p.mouthCurve = 3;
          p.mouthOpen = 8; p.mouthOpenW = 18; // wider-than-tall, grimace
          break;
        case "disgusted":
          // nose scrunch, raised (asymmetric) upper lip, one brow lowered, squint.
          p.browBaseline = 32;
          p.browInnerDY = 4; p.browOuterDY = -2; p.browLen = 13; p.asymBrow = 3;
          p.eyeRy = 5.5; p.noseScrunch = true;
          p.mouthCurve = -3; p.mouthW = 24; p.mouthY = 70; p.mouthOpen = 4; p.mouthOpenW = 16;
          break;
        case "neutral":
        default:
          // flat everything.
          p.browInnerDY = 0; p.browOuterDY = 0; p.browLen = 12;
          p.eyeRy = 7; p.mouthCurve = 0; p.mouthW = 26; p.mouthY = 70;
          break;
      }
      return p;
    }

    // build one eyebrow path (side: -1 left, +1 right). innerX is toward centre.
    function browPath(p, side) {
      var eyeCx = side < 0 ? p.eyeCx[0] : p.eyeCx[1];
      var base = p.browBaseline + (side < 0 ? jit(1.2) : jit(1.2));
      var innerDY = p.browInnerDY + (side > 0 ? p.asymBrow : 0); // disgust: raise/lower one side
      var outerDY = p.browOuterDY;
      var half = p.browLen / 2;
      var innerX = eyeCx + side * (p.browGap);          // inner end (toward nose)
      var outerX = eyeCx + side * (p.browGap + p.browLen);
      var innerY = base + innerDY + jit(0.8);
      var outerY = base + outerDY + jit(0.8);
      // gentle arch: control point sits a couple units ABOVE the line joining the
      // endpoints, so the brow bows upward slightly without overriding its tilt.
      var midX = (innerX + outerX) / 2;
      var archY = (innerY + outerY) / 2 - 2;
      return "M " + innerX.toFixed(1) + " " + innerY.toFixed(1) +
             " Q " + midX.toFixed(1) + " " + archY.toFixed(1) +
             " " + outerX.toFixed(1) + " " + outerY.toFixed(1);
      void half;
    }

    // mouth path (the lip line) as a quadratic; control point sets the curve.
    function mouthLine(p) {
      var y = p.mouthY + jit(1);
      var w = p.mouthW;
      if (w <= 0) return "";              // pure-open mouth (surprise) draws no line
      var x0 = 50 - w / 2, x1 = 50 + w / 2;
      var cy = y + p.mouthCurve + jit(1); // curve<0 lifts middle up (smile)
      return "M " + x0.toFixed(1) + " " + y.toFixed(1) +
             " Q 50 " + cy.toFixed(1) + " " + x1.toFixed(1) + " " + y.toFixed(1);
    }

    function svgFor(e) {
      var p = paramsFor(e);
      var parts = [];
      parts.push('<svg class="reademotion-face" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">');
      // head
      parts.push('<circle class="reademotion-skin" cx="50" cy="50" r="38" />');

      // eyebrows
      parts.push('<path class="reademotion-feature" d="' + browPath(p, -1) + '" />');
      parts.push('<path class="reademotion-feature" d="' + browPath(p, 1) + '" />');

      // eyes
      for (var i = 0; i < 2; i++) {
        var cx = p.eyeCx[i] + jit(0.6);
        var cy = p.eyeCy + jit(0.6);
        if (p.eyeRound) {
          // wide open round eye: white ellipse + small pupil (surprise / fear)
          parts.push('<ellipse class="reademotion-eyewhite" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) +
            '" rx="' + p.eyeRx.toFixed(1) + '" ry="' + p.eyeRy.toFixed(1) + '" />');
          parts.push('<circle class="reademotion-eyeball" cx="' + cx.toFixed(1) + '" cy="' + (cy + 0.5).toFixed(1) +
            '" r="' + p.pupilR.toFixed(1) + '" />');
        } else {
          // normal / squinted eye: filled lens whose ry encodes openness
          parts.push('<ellipse class="reademotion-eyeball" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) +
            '" rx="' + p.eyeRx.toFixed(1) + '" ry="' + p.eyeRy.toFixed(1) + '" />');
        }
      }

      // disgust: nose-scrunch lines between/under the eyes
      if (p.noseScrunch) {
        parts.push('<path class="reademotion-feature" stroke-width="3" d="M 46 56 Q 50 53 54 56" />');
        parts.push('<path class="reademotion-feature" stroke-width="3" d="M 47 60 Q 50 58 53 60" />');
      }

      // mouth: an open ellipse (if any) drawn first, then the lip line on top
      if (p.mouthOpen > 0) {
        var ow = (p.mouthOpenW || p.mouthOpen);
        parts.push('<ellipse class="reademotion-mouthfill" cx="50" cy="' + p.mouthY.toFixed(1) +
          '" rx="' + (ow / 2).toFixed(1) + '" ry="' + (p.mouthOpen / 2).toFixed(1) + '" />');
      }
      var ml = mouthLine(p);
      if (ml) parts.push('<path class="reademotion-feature" d="' + ml + '" />');

      parts.push('</svg>');
      return parts.join("");
    }

    // ---- DOM ----
    var status = el("div", "g-status", "");
    var stage = el("div", "reademotion-stage");
    var buttons = el("div", "reademotion-buttons");
    var btns = [];
    for (var b = 0; b < 4; b++) {
      var btn = el("button", "g-btn reademotion-btn", "");
      buttons.appendChild(btn);
      btns.push(btn);
    }
    var hint = el("div", "reademotion-hint",
      'read the face — tap the <b>emotion</b> it shows');
    var overlay = el("div", "g-overlay");

    var wrap = el("div", "reademotion-wrap");
    wrap.appendChild(stage);
    wrap.appendChild(buttons);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    btns.forEach(function (btn) {
      btn.addEventListener("click", function () { answer(btn); });
    });

    function setStatus() {
      status.innerHTML =
        '<span class="reademotion-streak">streak ' + streak + '</span>' +
        '<span>best ' + best + '</span>';
    }

    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      var pb = overlay.querySelector("button");
      if (pb) pb.addEventListener("click", function () { overlay.classList.remove("show"); onPlay(); });
      overlay.classList.add("show");
    }

    function setButtons(on) {
      for (var i = 0; i < btns.length; i++) btns[i].disabled = !on;
    }
    function clearBtnState() {
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.remove("reademotion-right", "reademotion-wrong");
      }
    }

    function nextFace() {
      locked = false;
      stage.className = "reademotion-stage";
      clearBtnState();

      current = EMOTIONS[rand(EMOTIONS.length)];
      stage.innerHTML = svgFor(current);

      // 3 distractors + correct, shuffled across the 4 buttons
      var pool = EMOTIONS.filter(function (x) { return x !== current; });
      pool = shuffle(pool).slice(0, 3);
      var choices = shuffle(pool.concat([current]));
      for (var i = 0; i < btns.length; i++) {
        btns[i].textContent = choices[i];
        btns[i].dataset.emotion = choices[i];
      }
      setButtons(true);
    }

    function answer(btn) {
      if (locked || !running) return;
      locked = true;
      setButtons(false);
      var pick = btn.dataset.emotion;

      if (pick === current) {
        btn.classList.add("reademotion-right");
        stage.classList.add("reademotion-good");
        streak++;
        if (streak > best) best = streak;
        ctx.submitScore(streak);
        setStatus();
        later(nextFace, 620);
      } else {
        btn.classList.add("reademotion-wrong");
        stage.classList.add("reademotion-bad");
        // reveal the correct choice
        for (var i = 0; i < btns.length; i++) {
          if (btns[i].dataset.emotion === current) btns[i].classList.add("reademotion-right");
        }
        later(gameOver, 80);
      }
    }

    function gameOver() {
      running = false;
      clearTimers();
      setButtons(false);
      var isBest = ctx.submitScore(streak);
      setStatus();
      showOverlay(
        '<div class="g-result"><div class="g-big">' + streak + '</div>' +
        '<div class="g-sub">' + (isBest && streak > 0 ? "new best! · " : "") +
        'it was <b style="color:var(--text)">' + current + '</b> · best streak</div>' +
        '<button class="g-btn">play again</button></div>',
        start
      );
    }

    function start() {
      clearTimers();
      overlay.classList.remove("show");
      streak = 0;
      running = true;
      setStatus();
      nextFace();
    }

    // ---- initial idle state: a friendly preview face behind the start overlay ----
    setButtons(false);
    setStatus();
    stage.innerHTML = svgFor("happy");
    showOverlay(
      '<div class="g-result"><div class="g-sub">name the emotion on each face · one miss ends the run</div>' +
      '<button class="g-btn">start</button></div>',
      start
    );

    return function teardown() { clearTimers(); running = false; };
  }
});
