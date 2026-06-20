/* Regex Rumble — type a pattern that matches every green and rejects every red.
   Pure vanilla JS. Registers itself with the global NERDBOX object. */
NERDBOX.injectStyle("regex", `
  .regex-stage { width: 100%; max-width: 560px; display: flex; flex-direction: column; align-items: center; gap: 1.1rem; position: relative; }
  .regex-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; width: 100%; }
  .regex-col { background: var(--bg-alt); border-radius: 14px; padding: 0.9rem 1rem 1.1rem; }
  .regex-col-head { font-family: "JetBrains Mono", monospace; font-size: 0.72rem; letter-spacing: 0.5px; text-transform: uppercase; color: var(--sub); margin-bottom: 0.7rem; text-align: center; }
  .regex-match .regex-col-head { color: var(--go); }
  .regex-reject .regex-col-head { color: var(--error); }
  .regex-list { display: flex; flex-direction: column; gap: 0.45rem; }
  .regex-str { font-family: "JetBrains Mono", monospace; font-size: 1rem; text-align: center; padding: 0.4rem 0.3rem; border-radius: 8px; background: color-mix(in srgb, var(--sub-alt) 30%, transparent); color: var(--sub); transition: color 0.12s, background 0.12s; word-break: break-all; }
  .regex-str.regex-ok { color: var(--go); background: color-mix(in srgb, var(--go) 16%, transparent); }
  .regex-str.regex-bad { color: var(--error); background: color-mix(in srgb, var(--error) 16%, transparent); }
  .regex-inputwrap { display: flex; align-items: center; gap: 0.4rem; width: 100%; max-width: 420px; background: var(--bg-alt); border: 1px solid var(--sub-alt); border-radius: 10px; padding: 0.55rem 0.8rem; transition: border-color 0.12s; }
  .regex-inputwrap.regex-focus { border-color: var(--accent); }
  .regex-slash { font-family: "JetBrains Mono", monospace; font-size: 1.3rem; color: var(--sub); user-select: none; }
  .regex-input { flex: 1; min-width: 0; background: transparent; border: none; color: var(--text); font-family: "JetBrains Mono", monospace; font-size: 1.1rem; }
  .regex-input:focus { outline: none; }
  .regex-note { font-family: "JetBrains Mono", monospace; font-size: 0.8rem; min-height: 1.2em; color: var(--error); text-align: center; }
`);

NERDBOX.register({
  id: "regex",
  name: "Regex Rumble",
  tagline: "match the greens, reject the reds",
  category: "knowledge",
  scoreMode: "max",
  formatScore: function (v) { return v + " levels"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l3.5-3.5"/><path d="M11 14v-8"/><path d="M7.5 8l7 4"/><path d="M14.5 8l-7 4"/><circle cx="11" cy="14" r="0.6" fill="currentColor"/></svg>',
  mount: function (root, ctx) {
    /* Each level: { match: [...], reject: [...] } — every match string must pass
       pattern.test(), every reject string must fail it. All verified solvable. */
    var LEVELS = [
      { match: ["cat", "car", "can"],        reject: ["dog", "sun"] },          // e.g.  ^ca
      { match: ["played", "fixed", "used"],  reject: ["play", "fix", "run"] },  // e.g.  ed$
      { match: ["a1", "x9", "7z"],           reject: ["abc", "xyz", "foo"] },   // e.g.  [0-9]
      { match: ["book", "moon", "foot"],     reject: ["on", "hop", "sock"] },   // e.g.  o{2}
      { match: ["Apple", "Box", "Cat"],      reject: ["apple", "box", "cat"] }, // e.g.  ^[A-Z]
      { match: ["cat", "dog", "mydog"],      reject: ["bird", "fish", "cow"] }, // e.g.  cat|dog
      { match: ["ab", "abab", "ababab"],     reject: ["aba", "ba", "abc"] }     // e.g.  ^(ab)+$
    ];

    var escapeHTML = function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    };

    var idx = 0;            // current level index
    var timers = [];        // every setTimeout id, cleared on teardown
    var solved = false;     // guard so a level only fires submitScore once

    var status = ctx.util.el("div", "g-status", "");
    var stage = ctx.util.el("div", "regex-stage");
    var overlay = ctx.util.el("div", "g-overlay");
    stage.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(stage);

    // references rebuilt per level
    var input = null, note = null, matchRows = [], rejectRows = [];

    function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
    function clearTimers() { timers.forEach(clearTimeout); timers = []; }

    function buildColumn(label, cls, strings) {
      var col = ctx.util.el("div", "regex-col " + cls);
      col.appendChild(ctx.util.el("div", "regex-col-head", escapeHTML(label)));
      var list = ctx.util.el("div", "regex-list");
      var rows = [];
      strings.forEach(function (s) {
        var row = ctx.util.el("div", "regex-str", escapeHTML(s));
        row._value = s;
        list.appendChild(row);
        rows.push(row);
      });
      col.appendChild(list);
      return { col: col, rows: rows };
    }

    function loadLevel() {
      solved = false;
      var lvl = LEVELS[idx];
      status.innerHTML = '<span class="gl-score">level ' + (idx + 1) + "</span><span class=\"gl-time\">of " + LEVELS.length + "</span>";

      // wipe stage but keep the overlay node
      while (stage.firstChild) stage.removeChild(stage.firstChild);

      var cols = ctx.util.el("div", "regex-cols");
      var m = buildColumn("match these", "regex-match", lvl.match);
      var r = buildColumn("reject these", "regex-reject", lvl.reject);
      matchRows = m.rows; rejectRows = r.rows;
      cols.appendChild(m.col); cols.appendChild(r.col);
      stage.appendChild(cols);

      var wrap = ctx.util.el("div", "regex-inputwrap");
      wrap.appendChild(ctx.util.el("span", "regex-slash", "/"));
      input = document.createElement("input");
      input.type = "text";
      input.className = "regex-input";
      input.setAttribute("placeholder", "your pattern");
      input.setAttribute("autocomplete", "off");
      input.setAttribute("autocapitalize", "off");
      input.setAttribute("spellcheck", "false");
      wrap.appendChild(input);
      wrap.appendChild(ctx.util.el("span", "regex-slash", "/"));
      stage.appendChild(wrap);

      note = ctx.util.el("div", "regex-note", "");
      stage.appendChild(note);

      stage.appendChild(overlay);

      input.addEventListener("input", evaluate);
      input.addEventListener("focus", function () { wrap.classList.add("regex-focus"); });
      input.addEventListener("blur", function () { wrap.classList.remove("regex-focus"); });
      later(function () { try { input.focus(); } catch (e) {} }, 0);
    }

    function paint(rows, states) {
      rows.forEach(function (row, i) {
        row.classList.remove("regex-ok", "regex-bad");
        if (states[i] === true) row.classList.add("regex-ok");
        else if (states[i] === false) row.classList.add("regex-bad");
      });
    }

    function evaluate() {
      if (solved) return;
      var pattern = input.value;
      note.textContent = "";

      if (pattern === "") {
        paint(matchRows, matchRows.map(function () { return null; }));
        paint(rejectRows, rejectRows.map(function () { return null; }));
        return;
      }

      var re;
      try {
        re = new RegExp(pattern);
      } catch (e) {
        note.textContent = "invalid pattern";
        paint(matchRows, matchRows.map(function () { return null; }));
        paint(rejectRows, rejectRows.map(function () { return null; }));
        return;
      }

      var allGood = true;
      var matchStates = matchRows.map(function (row) {
        var ok = re.test(row._value);          // match column: should match
        if (!ok) allGood = false;
        return ok;
      });
      var rejectStates = rejectRows.map(function (row) {
        var ok = !re.test(row._value);         // reject column: should NOT match
        if (!ok) allGood = false;
        return ok;
      });
      paint(matchRows, matchStates);
      paint(rejectRows, rejectStates);

      if (allGood) winLevel();
    }

    function winLevel() {
      if (solved) return;
      solved = true;
      var levelNumber = idx + 1;
      ctx.submitScore(levelNumber);
      if (input) input.disabled = true;

      if (idx >= LEVELS.length - 1) {
        showOverlay(
          '<div class="g-result"><div class="g-big">' + LEVELS.length + '</div>' +
          '<div class="g-sub">all levels cleared 🏆</div>' +
          '<button class="g-btn">play again</button></div>',
          function () { idx = 0; loadLevel(); }
        );
      } else {
        status.innerHTML = '<span class="gl-score">level ' + levelNumber + " cleared</span>";
        later(function () { idx++; loadLevel(); }, 850);
      }
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
    status.textContent = "type a regex that fits every clue";
    overlay.innerHTML = '<button class="g-btn">start</button>';
    overlay.querySelector("button").addEventListener("click", function () {
      overlay.classList.remove("show");
      idx = 0;
      loadLevel();
    });
    overlay.classList.add("show");

    return function teardown() { clearTimers(); };
  }
});
