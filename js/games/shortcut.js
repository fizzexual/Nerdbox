/* Shortcut Sensei — a big action flashes; fire the matching VS Code keyboard
   shortcut as fast as you can in 60 seconds. Score = correct shortcuts hit. */
NERDBOX.injectStyle("shortcut", `
  .shortcut-stage { width: 100%; max-width: 560px; display: flex; flex-direction: column; align-items: center; gap: 1.3rem; }
  .shortcut-card { width: 100%; background: var(--bg-alt); border-radius: 16px; padding: 2.4rem 1.6rem; display: flex; flex-direction: column; align-items: center; gap: 1.1rem; min-height: 190px; justify-content: center; transition: background 0.12s; }
  .shortcut-card.flash-go { background: color-mix(in srgb, var(--go) 26%, var(--bg-alt)); }
  .shortcut-card.flash-bad { background: color-mix(in srgb, var(--error) 26%, var(--bg-alt)); }
  .shortcut-label { font-family: "JetBrains Mono", monospace; font-size: 2.2rem; font-weight: 500; color: var(--text); text-align: center; line-height: 1.15; word-break: break-word; }
  .shortcut-hint { font-family: "JetBrains Mono", monospace; font-size: 0.95rem; color: var(--sub); min-height: 1.3em; text-align: center; }
  .shortcut-hint b { color: var(--text); font-weight: 500; }
  .shortcut-hint.ok b { color: var(--go); }
  .shortcut-hint.bad b { color: var(--error); }
  .shortcut-keys { display: inline-flex; gap: 0.35rem; flex-wrap: wrap; justify-content: center; align-items: center; }
  .shortcut-key { font-family: "JetBrains Mono", monospace; font-size: 1.05rem; color: var(--text); background: var(--bg); border: 1px solid var(--sub-alt); border-bottom-width: 3px; border-radius: 8px; padding: 0.35rem 0.7rem; min-width: 1.4em; text-align: center; }
  .shortcut-plus { font-family: "JetBrains Mono", monospace; color: var(--sub); font-size: 0.95rem; }
  .shortcut-tip { font-family: "JetBrains Mono", monospace; font-size: 0.82rem; color: var(--sub); text-align: center; }
`);

NERDBOX.register({
  id: "shortcut",
  name: "Shortcut Sensei",
  tagline: "fire the right keyboard shortcut, fast",
  category: "knowledge",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h0M10 10h0M14 10h0M18 10h0M6 14h0M18 14h0"/><path d="M9 14h6"/></svg>',
  mount: function (root, ctx) {
    // action label -> expected canonical chord
    var ACTIONS = [
      ["save", "Ctrl+S"],
      ["find", "Ctrl+F"],
      ["comment line", "Ctrl+/"],
      ["select all", "Ctrl+A"],
      ["undo", "Ctrl+Z"],
      ["redo", "Ctrl+Y"],
      ["copy", "Ctrl+C"],
      ["paste", "Ctrl+V"],
      ["cut", "Ctrl+X"],
      ["go to line", "Ctrl+G"],
      ["command palette", "Ctrl+Shift+P"],
      ["open file", "Ctrl+O"],
      ["new file", "Ctrl+N"],
      ["save all", "Ctrl+Shift+S"],
      ["find in files", "Ctrl+Shift+F"],
      ["toggle sidebar", "Ctrl+B"],
      ["delete line", "Ctrl+Shift+K"]
    ];
    var TIME = 60;
    var MODS = { Control: 1, Alt: 1, Shift: 1, Meta: 1 };

    var status = ctx.util.el("div", "g-status", "");
    var stage = ctx.util.el("div", "shortcut-stage");
    root.appendChild(status);
    root.appendChild(stage);

    var score = 0, timeLeft = TIME, ticker = null;
    var cur = null, keyHandler = null, running = false, flashT = null;

    /* ---- canonical chord from a keyboard event ---- */
    function chordOf(e) {
      var parts = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      if (e.metaKey) parts.push("Meta");
      var k = e.key;
      if (k.length === 1) k = k.toUpperCase();
      parts.push(k);
      return parts.join("+");
    }

    /* ---- pretty "Ctrl + S" rendering of an expected chord ---- */
    function renderChord(chord) {
      var keys = chord.split("+");
      var html = '<span class="shortcut-keys">';
      for (var i = 0; i < keys.length; i++) {
        if (i > 0) html += '<span class="shortcut-plus">+</span>';
        html += '<span class="shortcut-key">' + esc(keys[i]) + "</span>";
      }
      return html + "</span>";
    }
    function esc(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function updateStatus() {
      status.innerHTML =
        '<span class="gl-score">' + score + ' pts</span>' +
        '<span class="gl-time">' + Math.max(0, timeLeft) + "s</span>";
    }

    function next() {
      cur = ACTIONS[ctx.util.rand(ACTIONS.length)];
      stage.innerHTML =
        '<div class="shortcut-card">' +
          '<div class="shortcut-label">' + esc(cur[0]) + "</div>" +
          '<div class="shortcut-hint">press the shortcut</div>' +
        "</div>" +
        '<div class="shortcut-tip">' + renderChord(cur[1]) + " is the answer</div>";
      updateStatus();
    }

    function flash(cls) {
      var card = stage.querySelector(".shortcut-card");
      if (!card) return;
      card.classList.remove("flash-go", "flash-bad");
      // force reflow so a repeat of the same class re-triggers visibly
      void card.offsetWidth;
      card.classList.add(cls);
      clearTimeout(flashT);
      flashT = setTimeout(function () {
        var c = stage.querySelector(".shortcut-card");
        if (c) c.classList.remove("flash-go", "flash-bad");
      }, 160);
    }

    function setHint(cls, html) {
      var h = stage.querySelector(".shortcut-hint");
      if (h) { h.className = "shortcut-hint" + (cls ? " " + cls : ""); h.innerHTML = html; }
    }

    function onKey(e) {
      if (!running) return;
      if (MODS[e.key]) return;        // ignore lone modifier presses
      e.preventDefault();             // stop the browser's own shortcut (Ctrl+S/F/...)
      if (!cur) return;
      var pressed = chordOf(e);
      if (pressed === cur[1]) {
        score++;
        ctx.submitScore(score);
        flash("flash-go");
        next();
      } else {
        flash("flash-bad");
        setHint("bad", "you pressed <b>" + esc(pressed) + "</b>");
        // brief beat so the feedback is readable, then move on (no point)
        setTimeout(function () { if (running) next(); }, 320);
      }
    }

    function start() {
      score = 0; timeLeft = TIME; cur = null;
      running = true;
      updateStatus();
      next();
      // listener lives only while a round runs; reference stored for removal
      keyHandler = onKey;
      document.addEventListener("keydown", keyHandler);
      clearInterval(ticker);
      ticker = setInterval(function () {
        timeLeft--;
        updateStatus();
        if (timeLeft <= 0) finish();
      }, 1000);
    }

    function stopListening() {
      if (keyHandler) {
        document.removeEventListener("keydown", keyHandler);
        keyHandler = null;
      }
    }

    function finish() {
      running = false;
      clearInterval(ticker);
      clearTimeout(flashT);
      stopListening();
      timeLeft = 0;
      updateStatus();
      status.textContent = "time!";
      var best = ctx.submitScore(score);
      stage.innerHTML =
        '<div class="g-result">' +
          '<div class="g-big">' + score + "</div>" +
          '<div class="g-sub">shortcuts in 60s' + (best ? " · new best!" : "") + "</div>" +
          '<button class="g-btn">play again</button>' +
        "</div>";
      stage.querySelector(".g-btn").addEventListener("click", start);
    }

    function showIntro() {
      status.textContent = "fire the matching VS Code shortcut";
      stage.innerHTML =
        '<div class="shortcut-card">' +
          '<div class="shortcut-label">Shortcut Sensei</div>' +
          '<div class="shortcut-hint">an action appears — press its shortcut</div>' +
        "</div>" +
        '<button class="g-btn">start</button>';
      stage.querySelector(".g-btn").addEventListener("click", start);
    }

    showIntro();

    // CRITICAL: ensure the keydown listener never leaks back to the hub.
    return function teardown() {
      running = false;
      clearInterval(ticker);
      clearTimeout(flashT);
      stopListening();
    };
  }
});
