/* Gate Match — a truth table appears; pick the logic gate that produces it.
   Pure vanilla JS. Registers itself with the global NERDBOX object. */
NERDBOX.injectStyle("logicgate", `
  .logicgate-stage { position: relative; width: 100%; max-width: 460px; display: flex; flex-direction: column; align-items: center; gap: 1.3rem; }
  .logicgate-prompt { font-family: "JetBrains Mono", monospace; font-size: 0.78rem; letter-spacing: 0.5px; text-transform: uppercase; color: var(--sub); text-align: center; }
  .logicgate-table { border-collapse: collapse; font-family: "JetBrains Mono", monospace; font-size: 1.25rem; background: var(--bg-alt); border-radius: 14px; overflow: hidden; }
  .logicgate-table th, .logicgate-table td { padding: 0.55rem 1.3rem; text-align: center; }
  .logicgate-table th { font-size: 0.85rem; font-weight: 500; text-transform: uppercase; letter-spacing: 1px; color: var(--sub); border-bottom: 2px solid var(--sub-alt); }
  .logicgate-table td { color: var(--text); border-bottom: 1px solid color-mix(in srgb, var(--sub-alt) 45%, transparent); }
  .logicgate-table tr:last-child td { border-bottom: none; }
  .logicgate-table .logicgate-out { color: var(--accent); font-weight: 500; border-left: 1px solid color-mix(in srgb, var(--sub-alt) 45%, transparent); }
  .logicgate-table th.logicgate-out { color: var(--accent); border-left: 1px solid var(--sub-alt); }
  .logicgate-gates { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.7rem; width: 100%; }
  .logicgate-gate { background: var(--bg-alt); color: var(--text); border: 1px solid var(--sub-alt); border-radius: 10px; padding: 0.8rem 0.5rem; font-family: "JetBrains Mono", monospace; font-size: 1rem; letter-spacing: 1px; transition: border-color 0.12s, background 0.12s, color 0.12s, transform 0.1s; }
  .logicgate-gate:hover:not(:disabled) { border-color: var(--accent); }
  .logicgate-gate:active:not(:disabled) { transform: translateY(1px); }
  .logicgate-gate.logicgate-correct { background: var(--go); color: var(--bg); border-color: var(--go); }
  .logicgate-gate.logicgate-wrong { background: var(--error); color: var(--bg); border-color: var(--error); }
`);

NERDBOX.register({
  id: "logicgate",
  name: "Gate Match",
  tagline: "which logic gate fits the table?",
  category: "puzzle",
  scoreMode: "max",
  formatScore: function (v) { return v + " streak"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h2"/><path d="M4 17h2"/><path d="M18 12h2"/><path d="M6 6h5a5 5 0 0 1 0 12H6z"/></svg>',
  mount: function (root, ctx) {
    // The 4 input rows, in fixed truth-table order.
    var ROWS = [[0, 0], [0, 1], [1, 0], [1, 1]];

    // Gate name -> function over (a, b) booleans (0/1) returning 0/1.
    var GATES = {
      AND:  function (a, b) { return (a && b) ? 1 : 0; },
      OR:   function (a, b) { return (a || b) ? 1 : 0; },
      XOR:  function (a, b) { return (a !== b) ? 1 : 0; },
      NAND: function (a, b) { return !(a && b) ? 1 : 0; },
      NOR:  function (a, b) { return !(a || b) ? 1 : 0; },
      XNOR: function (a, b) { return (a === b) ? 1 : 0; }
    };
    var GATE_NAMES = ["AND", "OR", "XOR", "NAND", "NOR", "XNOR"];

    var status = ctx.util.el("div", "g-status", "");
    var stage = ctx.util.el("div", "logicgate-stage");
    var overlay = ctx.util.el("div", "g-overlay");
    stage.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(stage);

    var streak = 0;        // current run length
    var answer = null;     // gate name the current table was built from
    var locked = false;    // ignore clicks between rounds / after game over
    var timers = [];       // every setTimeout id, cleared on teardown

    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }

    function updateStatus() {
      status.innerHTML = '<span class="gl-score">streak ' + streak + '</span>';
    }

    function buildTable(gateName) {
      var fn = GATES[gateName];
      var table = ctx.util.el("table", "logicgate-table");
      var thead = '<thead><tr><th>A</th><th>B</th><th class="logicgate-out">out</th></tr></thead>';
      var body = "<tbody>";
      for (var i = 0; i < ROWS.length; i++) {
        var a = ROWS[i][0], b = ROWS[i][1];
        body += "<tr><td>" + a + "</td><td>" + b + '</td><td class="logicgate-out">' + fn(a, b) + "</td></tr>";
      }
      body += "</tbody>";
      table.innerHTML = thead + body;
      return table;
    }

    function newRound() {
      locked = false;
      answer = GATE_NAMES[ctx.util.rand(GATE_NAMES.length)];
      updateStatus();

      while (stage.firstChild) stage.removeChild(stage.firstChild);

      stage.appendChild(ctx.util.el("div", "logicgate-prompt", "which gate makes this output?"));
      stage.appendChild(buildTable(answer));

      var gates = ctx.util.el("div", "logicgate-gates");
      ctx.util.shuffle(GATE_NAMES).forEach(function (name) {
        var b = ctx.util.el("button", "logicgate-gate", name);
        b.dataset.gate = name;
        b.addEventListener("click", function () { choose(name); });
        gates.appendChild(b);
      });
      stage.appendChild(gates);
      stage.appendChild(overlay);
    }

    function choose(name) {
      if (locked) return;
      locked = true;

      if (name === answer) {
        // correct: flash green, advance streak, submit, next round
        var picked = stage.querySelector('.logicgate-gate[data-gate="' + name + '"]');
        if (picked) picked.classList.add("logicgate-correct");
        streak++;
        ctx.submitScore(streak);
        updateStatus();
        later(newRound, 480);
      } else {
        gameOver(name);
      }
    }

    function gameOver(chosen) {
      // highlight correct (green) + the wrong pick (red), disable the rest
      var btns = stage.querySelectorAll(".logicgate-gate");
      for (var i = 0; i < btns.length; i++) {
        var g = btns[i].dataset.gate;
        if (g === answer) btns[i].classList.add("logicgate-correct");
        else if (g === chosen) btns[i].classList.add("logicgate-wrong");
        btns[i].disabled = true;
      }

      var best = ctx.submitScore(streak);
      status.innerHTML = '<span class="gl-score">streak ' + streak + '</span><span class="gl-time">it was ' + answer + '</span>';

      later(function () {
        showOverlay(
          '<div class="g-result"><div class="g-big">' + streak + '</div>' +
          '<div class="g-sub">streak' + (best ? ' &middot; new best!' : '') + '</div>' +
          '<button class="g-btn">play again</button></div>',
          function () { streak = 0; newRound(); }
        );
      }, 900);
    }

    function showOverlay(html, onPlay) {
      overlay.innerHTML = html;
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", function () {
        overlay.classList.remove("show");
        onPlay();
      });
      overlay.classList.add("show");
    }

    // intro
    streak = 0;
    updateStatus();
    overlay.innerHTML = '<button class="g-btn">start</button>';
    overlay.querySelector("button").addEventListener("click", function () {
      overlay.classList.remove("show");
      streak = 0;
      newRound();
    });
    overlay.classList.add("show");

    return function teardown() { clearTimers(); };
  }
});
