/* CSS Duel — recreate the target shape by tweaking width/height/radius/rotate + color.
   No pixel diffing: we compare property VALUES numerically. score = closest match %. */
NERDBOX.injectStyle("cssduel", `
.cssduel-wrap { display: flex; flex-direction: column; align-items: center; gap: 1.1rem; width: 100%; }
.cssduel-score {
  font-family: "JetBrains Mono", monospace; line-height: 1; text-align: center;
}
.cssduel-pct { font-size: 3.4rem; font-weight: 500; color: var(--accent); transition: color 0.15s; }
.cssduel-pct.cssduel-perfect { color: var(--go); }
.cssduel-best { color: var(--sub); font-size: 0.9rem; margin-top: 0.35rem; }
.cssduel-best b { color: var(--text); font-weight: 500; }
.cssduel-arena {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 1rem; width: 100%;
}
.cssduel-pane {
  display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
}
.cssduel-pane-label {
  font-family: "JetBrains Mono", monospace; font-size: 0.72rem; letter-spacing: 2px;
  text-transform: uppercase; color: var(--sub);
}
.cssduel-stage {
  width: 200px; height: 200px; display: flex; align-items: center; justify-content: center;
  background: var(--bg-alt); border: 1px solid var(--sub-alt); border-radius: 10px;
  background-image: radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--text) 7%, transparent) 1px, transparent 0);
  background-size: 16px 16px;
}
.cssduel-box { background: var(--accent); will-change: transform; }
.cssduel-controls {
  width: 100%; max-width: 440px; display: flex; flex-direction: column; gap: 0.85rem;
  background: var(--bg-alt); border: 1px solid color-mix(in srgb, var(--text) 5%, transparent);
  border-radius: 12px; padding: 1.1rem 1.2rem;
}
.cssduel-ctl { display: flex; flex-direction: column; gap: 0.3rem; }
.cssduel-ctl-top {
  display: flex; justify-content: space-between; align-items: baseline;
  font-family: "JetBrains Mono", monospace; font-size: 0.78rem;
}
.cssduel-ctl-name { color: var(--sub); letter-spacing: 1px; text-transform: uppercase; }
.cssduel-ctl-val { color: var(--accent); font-weight: 500; }
.cssduel-slider {
  -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 6px;
  background: var(--sub-alt); outline: none; cursor: pointer; margin: 0;
}
.cssduel-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%;
  background: var(--accent); border: none; cursor: pointer; transition: transform 0.1s;
}
.cssduel-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }
.cssduel-slider::-moz-range-thumb {
  width: 16px; height: 16px; border-radius: 50%; background: var(--accent); border: none; cursor: pointer;
}
.cssduel-swatches { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.cssduel-swatch {
  width: 28px; height: 28px; border-radius: 7px; border: 2px solid transparent;
  cursor: pointer; padding: 0; transition: transform 0.1s, border-color 0.12s;
}
.cssduel-swatch:hover { transform: scale(1.1); }
.cssduel-swatch.cssduel-on { border-color: var(--text); }
.cssduel-actions { display: flex; justify-content: center; }
@media (max-width: 380px) {
  .cssduel-stage { width: 150px; height: 150px; }
}
`);

NERDBOX.register({
  id: "cssduel",
  name: "CSS Duel",
  tagline: "recreate the target shape",
  category: "knowledge",
  scoreMode: "max",
  formatScore: function (v) { return v + "%"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="2"/><circle cx="17.5" cy="6.5" r="3.5"/><path d="M7 14l4 7H3l4-7z"/><rect x="14" y="14" width="7" height="7" rx="3.5" transform="rotate(15 17.5 17.5)"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;

    // ranges (min, max, span) — span used to normalize diffs
    var SPEC = {
      width:  { min: 40, max: 160, span: 120, unit: "px",  step: 1 },
      height: { min: 40, max: 160, span: 120, unit: "px",  step: 1 },
      radius: { min: 0,  max: 80,  span: 80,  unit: "px",  step: 1 },
      rotate: { min: 0,  max: 90,  span: 90,  unit: "deg", step: 1 }
    };
    var ORDER = ["width", "height", "radius", "rotate"];
    var COLOR_PENALTY = 18;
    var PALETTE = ["#e2b714", "#7aa2f7", "#ca4754", "#4caf72", "#bd93f9", "#e0e0e0"];

    var target = {};   // { width, height, radius, rotate, color }
    var player = {};   // same shape
    var best = 0;
    var sliders = {};  // name -> input
    var valOut = {};   // name -> readout span
    var swatchEls = [];

    function mid(name) {
      var s = SPEC[name];
      return Math.round((s.min + s.max) / 2);
    }
    function randProp(name) {
      var s = SPEC[name];
      return s.min + rand(s.span + 1); // inclusive of max
    }

    // ---------- DOM ----------
    var wrap = el("div", "cssduel-wrap");

    var scoreBox = el("div", "cssduel-score");
    var pctEl = el("div", "cssduel-pct", "0%");
    var bestEl = el("div", "cssduel-best", "");
    scoreBox.appendChild(pctEl);
    scoreBox.appendChild(bestEl);

    var status = el("div", "g-status", "match the target — closest wins");

    var arena = el("div", "cssduel-arena");

    var targetPane = el("div", "cssduel-pane");
    targetPane.appendChild(el("div", "cssduel-pane-label", "target"));
    var targetStage = el("div", "cssduel-stage");
    var targetBox = el("div", "cssduel-box");
    targetStage.appendChild(targetBox);
    targetPane.appendChild(targetStage);

    var playerPane = el("div", "cssduel-pane");
    playerPane.appendChild(el("div", "cssduel-pane-label", "you"));
    var playerStage = el("div", "cssduel-stage");
    var playerBox = el("div", "cssduel-box");
    playerStage.appendChild(playerBox);
    playerPane.appendChild(playerStage);

    arena.appendChild(targetPane);
    arena.appendChild(playerPane);

    // controls
    var controls = el("div", "cssduel-controls");
    ORDER.forEach(function (name) {
      var s = SPEC[name];
      var ctl = el("div", "cssduel-ctl");
      var top = el("div", "cssduel-ctl-top");
      var nm = el("span", "cssduel-ctl-name", name);
      var vv = el("span", "cssduel-ctl-val", "");
      top.appendChild(nm); top.appendChild(vv);

      var input = el("input", "cssduel-slider");
      input.type = "range";
      input.min = String(s.min);
      input.max = String(s.max);
      input.step = String(s.step);
      input.setAttribute("aria-label", name);
      input.addEventListener("input", function () {
        player[name] = Number(input.value);
        renderPlayer();
        recompute();
      });

      ctl.appendChild(top);
      ctl.appendChild(input);
      controls.appendChild(ctl);
      sliders[name] = input;
      valOut[name] = vv;
    });

    // color swatches
    var swCtl = el("div", "cssduel-ctl");
    var swTop = el("div", "cssduel-ctl-top");
    swTop.appendChild(el("span", "cssduel-ctl-name", "color"));
    swCtl.appendChild(swTop);
    var swatches = el("div", "cssduel-swatches");
    PALETTE.forEach(function (col) {
      var b = el("button", "cssduel-swatch");
      b.type = "button";
      b.style.background = col;
      b.setAttribute("aria-label", "set color " + col);
      b.addEventListener("click", function () {
        player.color = col;
        markSwatches();
        renderPlayer();
        recompute();
      });
      swatches.appendChild(b);
      swatchEls.push({ btn: b, color: col });
    });
    swCtl.appendChild(swatches);
    controls.appendChild(swCtl);

    // actions
    var actions = el("div", "cssduel-actions");
    var newBtn = el("button", "g-btn", "new shape");
    newBtn.type = "button";
    newBtn.addEventListener("click", newShape);
    actions.appendChild(newBtn);

    wrap.appendChild(scoreBox);
    wrap.appendChild(status);
    wrap.appendChild(arena);
    wrap.appendChild(controls);
    wrap.appendChild(actions);
    root.appendChild(wrap);

    // ---------- logic ----------
    function applyBox(box, p) {
      box.style.width = p.width + "px";
      box.style.height = p.height + "px";
      box.style.borderRadius = p.radius + "px";
      box.style.transform = "rotate(" + p.rotate + "deg)";
      box.style.background = p.color;
    }
    function renderTarget() { applyBox(targetBox, target); }
    function renderPlayer() {
      applyBox(playerBox, player);
      ORDER.forEach(function (name) {
        valOut[name].textContent = player[name] + SPEC[name].unit;
      });
    }
    function markSwatches() {
      swatchEls.forEach(function (s) {
        s.btn.classList.toggle("cssduel-on", s.color === player.color);
      });
    }
    function computeMatch() {
      var sum = 0;
      ORDER.forEach(function (name) {
        var diff = Math.abs(player[name] - target[name]) / SPEC[name].span;
        sum += diff;
      });
      var avg = sum / ORDER.length;          // 0..1 average normalized numeric diff
      var pct = 100 * (1 - avg);
      if (player.color !== target.color) pct -= COLOR_PENALTY;
      pct = Math.max(0, Math.min(100, pct));
      return Math.round(pct);
    }
    function recompute() {
      var m = computeMatch();
      pctEl.textContent = m + "%";
      var perfect = m >= 99;
      pctEl.classList.toggle("cssduel-perfect", perfect);
      if (m > best) {
        best = m;
        ctx.submitScore(best);
        updateBestLine(perfect);
      } else {
        updateBestLine(perfect && best >= 99);
      }
      status.textContent = perfect
        ? "perfect! pixel-for-pixel."
        : "match the target — closest wins";
    }
    function updateBestLine(perfect) {
      bestEl.innerHTML = "best this shape <b>" + best + "%</b>" +
        (perfect ? " — nailed it!" : "");
    }

    function newShape() {
      target = {
        width:  randProp("width"),
        height: randProp("height"),
        radius: randProp("radius"),
        rotate: randProp("rotate"),
        color:  PALETTE[rand(PALETTE.length)]
      };
      // player starts at the middle of every range, default color = first swatch
      player = {
        width:  mid("width"),
        height: mid("height"),
        radius: mid("radius"),
        rotate: mid("rotate"),
        color:  PALETTE[0]
      };
      ORDER.forEach(function (name) { sliders[name].value = String(player[name]); });
      best = 0;
      renderTarget();
      renderPlayer();
      markSwatches();
      recompute();
    }

    newShape();

    return function () {};
  }
});
