/* Maze — spatial navigation. A perfect maze (recursive-backtracker / randomized
   DFS) is generated on a grid; you are the marker at the top-left cell and the
   goal is the bottom-right cell. Steer with the ARROW KEYS (or WASD) — walls
   block you. Reach the goal to clear the level, then a bigger maze appears.
   Score = largest level cleared (MAX). */
NERDBOX.injectStyle("maze", `
  .maze-wrap { position: relative; width: 100%; max-width: 560px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 1rem; }
  .maze-board {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    display: grid;
    background: var(--bg-alt);
    border: 2px solid var(--sub-alt);
    border-radius: 12px;
    overflow: hidden;
    touch-action: none;
  }
  .maze-cell {
    position: relative;
    box-sizing: border-box;
    /* walls are drawn as borders; off by default, on when a wall exists */
    border: 0 solid var(--sub-alt);
  }
  .maze-cell.w-n { border-top-width: 2px; }
  .maze-cell.w-e { border-right-width: 2px; }
  .maze-cell.w-s { border-bottom-width: 2px; }
  .maze-cell.w-w { border-left-width: 2px; }
  .maze-cell.is-goal::after {
    content: "";
    position: absolute;
    inset: 14%;
    border-radius: 4px;
    background: color-mix(in srgb, var(--go) 28%, transparent);
    border: 2px solid var(--go);
  }
  /* the player marker — absolutely positioned so it can animate between cells */
  .maze-player {
    position: absolute;
    box-sizing: border-box;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 60%, transparent);
    transition: left 0.09s linear, top 0.09s linear;
    z-index: 2;
    pointer-events: none;
  }
  .maze-board.solved .maze-player { background: var(--go); box-shadow: 0 0 14px color-mix(in srgb, var(--go) 65%, transparent); }
  .maze-bar {
    display: flex;
    gap: 1.6rem;
    justify-content: center;
    flex-wrap: wrap;
    font-family: "JetBrains Mono", monospace;
    color: var(--sub);
    font-size: 0.95rem;
  }
  .maze-bar b { color: var(--text); font-weight: 500; }
  .maze-bar .maze-time { min-width: 4.4em; text-align: right; }
  .maze-msg { color: var(--go) !important; font-weight: 500; }
  .maze-actions { display: flex; justify-content: center; }
  .maze-reset {
    border: 1px solid var(--sub-alt);
    background: transparent;
    color: var(--sub);
    border-radius: 8px;
    padding: 0.5rem 1.2rem;
    font-family: "JetBrains Mono", monospace;
    font-size: 0.9rem;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .maze-reset:hover { color: var(--text); border-color: var(--accent); background: var(--bg-alt); }
  .maze-hint { font-family: "JetBrains Mono", monospace; font-size: 0.82rem; color: var(--sub); text-align: center; }
  .maze-hint b { color: var(--accent); font-weight: 500; }
`);

NERDBOX.register({
  id: "maze",
  name: "Maze",
  tagline: "find your way out, fast",
  category: "reasoning",
  scoreMode: "max",
  formatScore: function (v) { return v + " level"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h6V3"/><path d="M21 9h-6"/><path d="M9 9v6H3"/><path d="M15 3v12h6"/><path d="M15 21v-6h-6"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;

    // wall bit flags (per cell): which sides still have a wall
    var N = 1, E = 2, S = 4, W = 8;
    var DX = { 1: 0, 2: 1, 4: 0, 8: -1 };   // column delta per direction
    var DY = { 1: -1, 2: 0, 4: 1, 8: 0 };   // row delta per direction
    var OPP = { 1: 4, 2: 8, 4: 1, 8: 2 };   // opposite wall

    var START_SIZE = 8;
    var MAX_SIZE = 16;

    var size = START_SIZE;     // current grid is size x size
    var grid = [];             // wall bitmask per cell, length size*size
    var cellEls = [];          // cell <div> elements, parallel to grid
    var px = 0, py = 0;        // player column/row
    var level = 1;
    var started = false;
    var solved = false;        // current maze cleared (lock input during transition)
    var startMs = 0;
    var timerId = null;
    var transId = null;        // level-advance timeout
    var keyHandler = null;     // the single active keydown listener (or null)

    // ---- DOM ----
    var bar = el("div", "maze-bar");
    var board = el("div", "maze-board");
    var player = el("div", "maze-player");
    var overlay = el("div", "g-overlay");
    var wrap = el("div", "maze-wrap");
    wrap.appendChild(bar);
    wrap.appendChild(board);
    wrap.appendChild(overlay);

    var actions = el("div", "maze-actions");
    var resetBtn = el("button", "maze-reset", "new maze");
    actions.appendChild(resetBtn);

    var hint = el("div", "maze-hint",
      'steer with <b>arrow keys</b> or <b>WASD</b> — reach the goal');

    root.appendChild(wrap);
    root.appendChild(actions);
    root.appendChild(hint);

    function idx(c, r) { return r * size + c; }
    function inBounds(c, r) { return c >= 0 && c < size && r >= 0 && r < size; }

    // ---- maze generation: iterative recursive-backtracker (randomized DFS) ----
    // Start with every wall present, then carve a spanning tree: from a cell,
    // step to a random unvisited neighbor, knocking down the wall between them.
    // The result is a "perfect" maze — exactly one path between any two cells,
    // so every cell is reachable and none is isolated.
    function generate() {
      var total = size * size;
      grid = new Array(total);
      for (var i = 0; i < total; i++) grid[i] = N | E | S | W; // all walls up

      var visited = new Array(total);
      for (i = 0; i < total; i++) visited[i] = false;

      var stack = [];
      var startIdx = idx(0, 0);
      visited[startIdx] = true;
      stack.push(startIdx);

      var dirs = [N, E, S, W];

      while (stack.length > 0) {
        var cur = stack[stack.length - 1];
        var cc = cur % size, cr = Math.floor(cur / size);

        // collect unvisited neighbors
        var options = [];
        for (var d = 0; d < 4; d++) {
          var dir = dirs[d];
          var nc = cc + DX[dir], nr = cr + DY[dir];
          if (inBounds(nc, nr) && !visited[idx(nc, nr)]) {
            options.push(dir);
          }
        }

        if (options.length === 0) {
          stack.pop();                       // dead end — backtrack
          continue;
        }

        var pick = options[rand(options.length)];
        var ni = idx(cc + DX[pick], cr + DY[pick]);
        grid[cur] &= ~pick;                  // remove wall on current side
        grid[ni] &= ~OPP[pick];              // and matching wall on neighbor
        visited[ni] = true;
        stack.push(ni);
      }
    }

    // ---- rendering ----
    function buildBoard() {
      board.style.gridTemplateColumns = "repeat(" + size + ", 1fr)";
      board.style.gridTemplateRows = "repeat(" + size + ", 1fr)";
      // wipe old cells but keep the player element in the DOM
      cellEls = [];
      var keepPlayer = player.parentNode === board;
      board.innerHTML = "";
      var goal = idx(size - 1, size - 1);
      for (var i = 0; i < size * size; i++) {
        var c = el("div", "maze-cell");
        var w = grid[i];
        if (w & N) c.classList.add("w-n");
        if (w & E) c.classList.add("w-e");
        if (w & S) c.classList.add("w-s");
        if (w & W) c.classList.add("w-w");
        if (i === goal) c.classList.add("is-goal");
        board.appendChild(c);
        cellEls.push(c);
      }
      // (re)attach the player marker on top of the grid cells
      board.appendChild(player);
      if (!keepPlayer) { /* first attach */ }
      sizePlayer();
      placePlayer();
    }

    // size the round marker to ~70% of a cell and position it over (px,py)
    function sizePlayer() {
      var frac = (1 / size) * 0.62;
      player.style.width = (frac * 100) + "%";
      player.style.height = (frac * 100) + "%";
    }

    function placePlayer() {
      var cellPct = 100 / size;
      var frac = (1 / size) * 0.62;
      var offset = (cellPct - frac * 100) / 2;       // center within the cell
      player.style.left = (px * cellPct + offset) + "%";
      player.style.top = (py * cellPct + offset) + "%";
    }

    // ---- bar / timer ----
    function fmtTime() {
      if (!started || startMs === 0) return "0.0s";
      return (Math.floor((performance.now() - startMs) / 100) / 10).toFixed(1) + "s";
    }
    function updateBar(msg) {
      if (msg) {
        bar.innerHTML = '<span class="maze-msg">' + msg + "</span>";
        return;
      }
      bar.innerHTML =
        '<span>level&nbsp;<b>' + level + "</b></span>" +
        '<span>size&nbsp;<b>' + size + "×" + size + "</b></span>" +
        '<span class="maze-time">' + fmtTime() + "</span>";
    }
    function startTimer() {
      stopTimer();
      startMs = performance.now();
      timerId = setInterval(function () {
        if (!solved) updateBar();
      }, 100);
    }
    function stopTimer() {
      if (timerId !== null) { clearInterval(timerId); timerId = null; }
    }

    // ---- movement ----
    // attempt a step in a direction; blocked if a wall sits on that side
    function tryMove(dir) {
      if (!started || solved) return;
      var here = idx(px, py);
      if (grid[here] & dir) return;                  // wall in the way
      var nc = px + DX[dir], nr = py + DY[dir];
      if (!inBounds(nc, nr)) return;                 // safety (outer walls block anyway)
      px = nc; py = nr;
      placePlayer();
      if (px === size - 1 && py === size - 1) win();
    }

    function onKey(e) {
      var k = e.key;
      var dir = null;
      if (k === "ArrowUp" || k === "w" || k === "W") dir = N;
      else if (k === "ArrowRight" || k === "d" || k === "D") dir = E;
      else if (k === "ArrowDown" || k === "s" || k === "S") dir = S;
      else if (k === "ArrowLeft" || k === "a" || k === "A") dir = W;
      if (dir === null) return;
      // stop arrow keys (and WASD) from scrolling / leaking to the hub
      e.preventDefault();
      tryMove(dir);
    }

    function startListening() {
      if (keyHandler) return;
      keyHandler = onKey;
      document.addEventListener("keydown", keyHandler);
    }
    function stopListening() {
      if (keyHandler) {
        document.removeEventListener("keydown", keyHandler);
        keyHandler = null;
      }
    }

    // ---- level flow ----
    function loadLevel() {
      solved = false;
      board.classList.remove("solved");
      generate();
      px = 0; py = 0;
      buildBoard();
      updateBar();
      startTimer();
    }

    function win() {
      solved = true;
      stopTimer();
      board.classList.add("solved");
      var best = ctx.submitScore(level);
      updateBar("level " + level + " solved! ✓" + (best ? "  (best)" : ""));
      // grow the maze and advance after a short beat
      if (transId !== null) clearTimeout(transId);
      transId = setTimeout(function () {
        transId = null;
        level++;
        if (size < MAX_SIZE) size++;
        loadLevel();
      }, 900);
    }

    function startGame() {
      overlay.classList.remove("show");
      if (transId !== null) { clearTimeout(transId); transId = null; }
      started = true;
      level = 1;
      size = START_SIZE;
      startListening();
      loadLevel();
    }

    function showStart() {
      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-sub">reach the bottom-right goal · arrow keys / WASD</div>' +
          '<button class="g-btn" type="button">start</button>' +
        '</div>';
      overlay.querySelector("button").addEventListener("click", startGame);
      overlay.classList.add("show");
    }

    resetBtn.addEventListener("click", function () {
      if (!started) { startGame(); return; }
      // regenerate the SAME level number (fresh layout); level/score unchanged
      if (transId !== null) { clearTimeout(transId); transId = null; }
      loadLevel();
    });

    // ---- initial idle state: show a calm preview maze behind the start overlay ----
    generate();
    px = 0; py = 0;
    buildBoard();
    updateBar("find your way out");
    showStart();

    // ---- teardown: MUST remove the keydown listener and clear all timers ----
    return function teardown() {
      stopListening();
      stopTimer();
      if (transId !== null) { clearTimeout(transId); transId = null; }
    };
  }
});
