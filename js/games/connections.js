/* Dev Connections — group the 16 terms into 4 hidden categories (NYT-Connections style).
   Tap up to 4 tiles, submit, and lock a category if you nailed all four. 4 lives.
   Solve all 4 groups to advance; streak = puzzles solved in a row. Endless. */
NERDBOX.injectStyle("connections", `
.connections-wrap { width: 100%; max-width: 560px; margin: 0 auto; position: relative; }
.connections-solved { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.5rem; }
.connections-solved:empty { margin-bottom: 0; }
.connections-group { border-radius: 12px; padding: 0.6rem 0.8rem; text-align: center; color: #1a1a1a; animation: connections-pop 0.28s ease; }
.connections-group-name { font-family: "JetBrains Mono", monospace; font-weight: 700; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1.5px; }
.connections-group-terms { font-family: "JetBrains Mono", monospace; font-weight: 500; font-size: 0.95rem; margin-top: 0.15rem; }
.connections-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
.connections-tile { aspect-ratio: 1.35 / 1; display: flex; align-items: center; justify-content: center; text-align: center; padding: 0.2rem; border: 2px solid var(--sub-alt); border-radius: 12px; background: var(--bg-alt); color: var(--text); font-family: "JetBrains Mono", monospace; font-size: 0.92rem; font-weight: 500; cursor: pointer; user-select: none; line-height: 1.1; transition: transform 0.08s, border-color 0.12s, background 0.12s, color 0.12s; }
.connections-tile:hover:not(.connections-sel) { border-color: var(--sub); }
.connections-tile.connections-sel { background: var(--sub); color: var(--bg); border-color: var(--sub); transform: translateY(-2px); }
.connections-tile.connections-shake { animation: connections-shake 0.42s; border-color: var(--error); }
.connections-controls { display: flex; gap: 0.6rem; justify-content: center; margin-top: 1.1rem; }
.connections-btn-ghost { border: 2px solid var(--sub-alt); border-radius: 10px; background: transparent; color: var(--sub); padding: 0.7rem 1.2rem; font-size: 0.95rem; font-weight: 500; cursor: pointer; transition: border-color 0.12s, color 0.12s; }
.connections-btn-ghost:hover:not(:disabled) { border-color: var(--sub); color: var(--text); }
.connections-btn-ghost:disabled { opacity: 0.4; cursor: default; }
.connections-lives { display: inline-flex; gap: 0.3rem; align-items: center; }
.connections-dot { width: 0.7rem; height: 0.7rem; border-radius: 50%; background: var(--accent); display: inline-block; transition: background 0.2s; }
.connections-dot.connections-dead { background: var(--sub-alt); }
.connections-toast { font-family: "JetBrains Mono", monospace; font-size: 0.9rem; text-align: center; min-height: 1.4em; margin-top: 0.9rem; color: var(--sub); transition: color 0.12s; }
.connections-toast.connections-warn { color: var(--accent); }
.connections-toast.connections-bad { color: var(--error); }
.connections-toast.connections-good { color: var(--go); }
@keyframes connections-pop { 0% { transform: scale(0.94); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes connections-shake { 10%, 90% { transform: translateX(-2px); } 20%, 80% { transform: translateX(3px); } 30%, 50%, 70% { transform: translateX(-5px); } 40%, 60% { transform: translateX(5px); } }
`);

NERDBOX.register({
  id: "connections",
  name: "Dev Connections",
  tagline: "group the 16 terms into 4",
  category: "puzzle",
  scoreMode: "max",
  formatScore: function (v) { return v + " solved"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, shuffle = ctx.util.shuffle, rand = ctx.util.rand;

    // 5 puzzles. Each = 4 groups of 4 unambiguous, short, lowercase dev terms.
    // Every term within a puzzle belongs to exactly one group (no overlaps).
    var PUZZLES = [
      {
        "js array methods": ["map", "filter", "reduce", "slice"],
        "http methods": ["get", "post", "put", "patch"],
        "css units": ["px", "rem", "vh", "ch"],
        "git commands": ["clone", "merge", "rebase", "stash"]
      },
      {
        "data structures": ["stack", "queue", "tree", "heap"],
        "loops": ["for", "while", "foreach", "do"],
        "booleans": ["true", "false", "and", "or"],
        "http codes": ["200", "301", "404", "500"]
      },
      {
        "primitive types": ["int", "char", "float", "bool"],
        "package managers": ["npm", "pip", "cargo", "gem"],
        "bash commands": ["cd", "ls", "grep", "chmod"],
        "sql keywords": ["select", "where", "join", "group"]
      },
      {
        "frontend frameworks": ["react", "vue", "svelte", "angular"],
        "databases": ["mongo", "redis", "postgres", "sqlite"],
        "html tags": ["div", "span", "section", "header"],
        "comparison operators": ["less", "greater", "equal", "not"]
      },
      {
        "logical operators": ["xor", "nand", "nor", "implies"],
        "containers": ["docker", "podman", "kube", "helm"],
        "test runners": ["jest", "mocha", "vitest", "pytest"],
        "json types": ["string", "number", "array", "object"]
      }
    ];

    var MAX_SELECT = 4;
    var START_LIVES = 4;
    // Fixed, accessible category colours (light fills, dark text) — readable on every theme.
    var GROUP_COLORS = ["#e6c84f", "#7fc97f", "#7aaef0", "#c79be8"];

    var streak = 0;
    var lives = START_LIVES;
    var order = [];          // randomized rotation through PUZZLES
    var orderPos = 0;
    var current = null;      // active puzzle (name -> [terms])
    var groupOf = {};        // term -> group name
    var solvedNames = [];    // groups already locked (in solve order)
    var tiles = [];          // remaining unsolved terms (rendered in grid)
    var selected = [];       // currently selected terms
    var locked = false;      // input lock during animations / game over
    var toastTimer = null;

    // ---- DOM ----
    var status = el("div", "g-status", "");
    var wrap = el("div", "connections-wrap");
    var solvedBox = el("div", "connections-solved");
    var grid = el("div", "connections-grid");
    var controls = el("div", "connections-controls");
    var deselectBtn = el("button", "connections-btn-ghost", "deselect all");
    var submitBtn = el("button", "g-btn", "submit");
    var toast = el("div", "connections-toast", "");
    var overlay = el("div", "g-overlay");

    deselectBtn.type = "button";
    submitBtn.type = "button";
    controls.appendChild(deselectBtn);
    controls.appendChild(submitBtn);
    wrap.appendChild(solvedBox);
    wrap.appendChild(grid);
    wrap.appendChild(controls);
    wrap.appendChild(toast);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    function setToast(msg, cls) {
      clearTimeout(toastTimer);
      toast.className = "connections-toast" + (cls ? " connections-" + cls : "");
      toast.textContent = msg || "";
    }
    function flashToast(msg, cls, ms) {
      setToast(msg, cls);
      toastTimer = setTimeout(function () {
        toast.className = "connections-toast";
        toast.textContent = "";
      }, ms || 1600);
    }

    function updateStatus() {
      var dots = "";
      for (var i = 0; i < START_LIVES; i++) {
        dots += '<span class="connections-dot' + (i >= lives ? " connections-dead" : "") + '"></span>';
      }
      status.innerHTML =
        '<span class="gl-score">streak ' + streak + '</span>' +
        '<span class="connections-lives">lives ' + dots + '</span>';
    }

    function nextPuzzleIndex() {
      // Reshuffle the rotation each full pass so it stays endless and varied.
      if (orderPos >= order.length) {
        order = shuffle(PUZZLES.map(function (_, i) { return i; }));
        orderPos = 0;
      }
      return order[orderPos++];
    }

    function loadPuzzle(idx) {
      current = PUZZLES[idx];
      groupOf = {};
      solvedNames = [];
      selected = [];
      var allTerms = [];
      Object.keys(current).forEach(function (name) {
        current[name].forEach(function (term) {
          groupOf[term] = name;
          allTerms.push(term);
        });
      });
      tiles = shuffle(allTerms);
      solvedBox.innerHTML = "";
      renderGrid();
      updateButtons();
      setToast("find four groups of four", null);
    }

    function colorFor(name) {
      // Colour by the group's position in the puzzle's key order (stable per puzzle).
      var idx = Object.keys(current).indexOf(name);
      return GROUP_COLORS[idx % GROUP_COLORS.length];
    }

    function renderGrid() {
      grid.innerHTML = "";
      tiles.forEach(function (term) {
        var t = el("div", "connections-tile", esc(term));
        if (selected.indexOf(term) >= 0) t.classList.add("connections-sel");
        t.setAttribute("data-term", term);
        t.addEventListener("click", function () { tapTile(term, t); });
        grid.appendChild(t);
      });
    }

    function updateButtons() {
      deselectBtn.disabled = locked || selected.length === 0;
      submitBtn.disabled = locked || selected.length !== MAX_SELECT;
    }

    function tapTile(term, node) {
      if (locked) return;
      var i = selected.indexOf(term);
      if (i >= 0) {
        selected.splice(i, 1);
        node.classList.remove("connections-sel");
      } else {
        if (selected.length >= MAX_SELECT) return; // cap at 4
        selected.push(term);
        node.classList.add("connections-sel");
      }
      updateButtons();
    }

    function deselectAll() {
      if (locked || !selected.length) return;
      selected = [];
      grid.querySelectorAll(".connections-sel").forEach(function (n) {
        n.classList.remove("connections-sel");
      });
      updateButtons();
    }

    // How many of the 4 selected share their most-common group.
    function bestGroupOverlap() {
      var counts = {};
      var best = 0;
      selected.forEach(function (term) {
        var g = groupOf[term];
        counts[g] = (counts[g] || 0) + 1;
        if (counts[g] > best) best = counts[g];
      });
      return best;
    }

    function submit() {
      if (locked || selected.length !== MAX_SELECT) return;
      var overlap = bestGroupOverlap();

      if (overlap === MAX_SELECT) {
        lockGroup(groupOf[selected[0]]);
        return;
      }

      // Wrong guess: shake the selected tiles + lose a life.
      locked = true;
      updateButtons();
      var nodes = selected.map(function (term) {
        return grid.querySelector('.connections-tile[data-term="' + cssEscape(term) + '"]');
      });
      nodes.forEach(function (n) { if (n) n.classList.add("connections-shake"); });

      lives--;
      updateStatus();
      if (overlap === 3) flashToast("one away…", "warn", 1300);
      else setToast("not a group — try again", "bad");

      setTimeout(function () {
        nodes.forEach(function (n) { if (n) n.classList.remove("connections-shake"); });
        if (lives <= 0) {
          gameOver();
          return;
        }
        locked = false;
        updateButtons();
      }, 460);
    }

    function lockGroup(name) {
      locked = true;
      updateButtons();
      // Remove the group's terms from the grid and selection.
      var terms = current[name];
      tiles = tiles.filter(function (t) { return terms.indexOf(t) < 0; });
      selected = [];
      solvedNames.push(name);

      var rowBg = colorFor(name);
      var row = el("div", "connections-group");
      row.style.background = rowBg;
      row.innerHTML =
        '<div class="connections-group-name">' + esc(name) + '</div>' +
        '<div class="connections-group-terms">' + terms.map(esc).join("  ·  ") + '</div>';
      solvedBox.appendChild(row);

      renderGrid();

      if (solvedNames.length === 4) {
        puzzleSolved();
      } else {
        setToast("nice — " + (4 - solvedNames.length) + " to go", "good");
        locked = false;
        updateButtons();
      }
    }

    function puzzleSolved() {
      streak++;
      var isBest = ctx.submitScore(streak);
      updateStatus();
      setToast("puzzle solved!" + (isBest ? " new best!" : ""), "good");
      // Brief celebration, then auto-advance to the next puzzle.
      setTimeout(function () {
        locked = false;
        loadPuzzle(nextPuzzleIndex());
        flashToast("next puzzle — streak " + streak, "good", 1400);
      }, 1200);
    }

    function gameOver() {
      locked = true;
      updateButtons();
      // Reveal every grouping for the puzzle they lost on.
      var revealed = "";
      Object.keys(current).forEach(function (name) {
        revealed +=
          '<div class="connections-group" style="background:' + colorFor(name) + ';animation:none">' +
          '<div class="connections-group-name">' + esc(name) + '</div>' +
          '<div class="connections-group-terms">' + current[name].map(esc).join("  ·  ") + '</div>' +
          '</div>';
      });
      overlay.innerHTML =
        '<div class="g-result">' +
        '<div class="g-big">' + streak + '</div>' +
        '<div class="g-sub">puzzles solved in a row</div>' +
        '<div class="connections-solved" style="margin:0.8rem 0;width:100%;max-width:420px">' + revealed + '</div>' +
        '<button class="g-btn">play again</button>' +
        '</div>';
      overlay.querySelector("button").addEventListener("click", restart);
      overlay.classList.add("show");
      setToast("", null);
    }

    function restart() {
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      streak = 0;
      lives = START_LIVES;
      locked = false;
      order = [];
      orderPos = 0;
      updateStatus();
      loadPuzzle(nextPuzzleIndex());
    }

    // Minimal CSS.escape fallback for attribute selectors (terms are simple, but be safe).
    function cssEscape(s) {
      if (window.CSS && CSS.escape) return CSS.escape(s);
      return String(s).replace(/[^a-zA-Z0-9_-]/g, function (c) { return "\\" + c; });
    }

    // ---- wire up ----
    deselectBtn.addEventListener("click", deselectAll);
    submitBtn.addEventListener("click", submit);

    updateStatus();
    loadPuzzle(nextPuzzleIndex());

    return function () {
      clearTimeout(toastTimer);
    };
  }
});
