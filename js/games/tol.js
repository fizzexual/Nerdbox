/* Tower of London — a planning test (the classic Shallice ToL). Three pegs hold
   3 coloured balls. The pegs have FIXED capacities: peg A holds up to 3 balls,
   peg B up to 2, peg C up to 1. Two boards sit side by side: your WORKING board
   (the start arrangement) and the fixed TARGET. Rearrange the working board to
   match the target. A move = click a peg to lift its TOP ball, then click
   another peg to drop it — only onto a peg that still has free capacity.

   It is a BATTERY of ~10 problems of rising difficulty: the optimal solution is
   2,3,4,5,6,7,8 moves (one or two problems at each depth). For every problem you
   get a MOVE BUDGET equal to that optimal count — reach the target within budget
   to "solve" it. Exceed the budget without matching and the problem fails. The
   run ends after the first 2 failures (otherwise it walks the whole battery).

   The metric (max) is the number of problems solved within their optimal budget,
   submitted exactly once at the end via ctx.submitScore. Each problem is built by
   BFS over the tiny state space: from a random start we take the shortest-path
   distance to every reachable state and pick a target whose distance equals the
   desired optimal depth — so the budget is provably exact and the optimal count
   is correct. ANTI-SPAM: because the budget equals the optimal move count, random
   clicking cannot reach the target in time; only genuine planning scores. There
   is no mash path. Self-contained: one injectStyle + one register, ES5 vanilla;
   every timer is tracked and cleared on teardown, and all clicks are bound to peg
   elements inside root, so there are no document/window listeners to remove. */
NERDBOX.injectStyle("tol", `
  .tol-wrap {
    position: relative; width: 100%; max-width: 560px; margin: 0 auto;
    display: flex; flex-direction: column; align-items: center; gap: 1.1rem;
  }
  .tol-bar {
    display: flex; gap: 1.5rem; justify-content: center; flex-wrap: wrap;
    font-family: "JetBrains Mono", monospace; color: var(--sub);
    font-size: 0.95rem; min-height: 1.4em;
  }
  .tol-bar b { color: var(--text); font-weight: 600; }
  .tol-bar .tol-acc { color: var(--accent); font-weight: 600; }
  .tol-hint {
    font-family: "JetBrains Mono", monospace; font-size: 0.9rem;
    color: var(--sub); min-height: 1.2em; text-align: center;
  }
  .tol-hint.tol-warn { color: var(--error); }
  .tol-hint.tol-good { color: var(--go); }
  .tol-boards {
    display: flex; gap: 1.4rem; justify-content: center; align-items: stretch;
    width: 100%; flex-wrap: wrap;
  }
  .tol-panel {
    flex: 1 1 220px; min-width: 200px;
    display: flex; flex-direction: column; align-items: center; gap: 0.55rem;
    padding: 0.9rem 0.8rem 1rem;
    background: var(--bg-alt);
    border: 1px solid color-mix(in srgb, var(--text) 6%, transparent);
    border-radius: 16px;
  }
  .tol-label {
    font-family: "JetBrains Mono", monospace; font-size: 0.8rem;
    letter-spacing: 0.05em; text-transform: uppercase; color: var(--sub);
  }
  .tol-panel.tol-target .tol-label { color: var(--accent); }
  .tol-board {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 10px; width: 100%; align-items: end;
  }
  .tol-board.tol-locked .tol-peg { cursor: default; pointer-events: none; }
  .tol-peg {
    position: relative; padding: 8px 4px 12px; margin: 0; border: none;
    display: flex; flex-direction: column-reverse; align-items: center;
    justify-content: flex-start; gap: 5px;
    background: transparent; border-radius: 12px;
    cursor: pointer; min-height: 132px;
    transition: box-shadow 0.15s ease, background 0.15s ease, transform 0.07s ease;
  }
  /* spindle + base drawn behind the balls */
  .tol-peg::before {
    content: ""; position: absolute; left: 50%; transform: translateX(-50%);
    top: 10px; bottom: 16px; width: 5px; border-radius: 3px;
    background: var(--sub-alt); z-index: 0;
  }
  .tol-peg::after {
    content: ""; position: absolute; left: 8%; right: 8%; bottom: 8px;
    height: 5px; border-radius: 3px; background: var(--sub-alt); z-index: 0;
  }
  .tol-board:not(.tol-locked) .tol-peg:hover {
    background: color-mix(in srgb, var(--accent) 9%, transparent);
  }
  .tol-peg.tol-sel { box-shadow: inset 0 0 0 2px var(--accent); }
  .tol-peg.tol-ok:hover { box-shadow: inset 0 0 0 2px var(--go); }
  .tol-peg.tol-shake { animation: tol-shake 0.32s ease; }
  @keyframes tol-shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    50% { transform: translateX(4px); }
    75% { transform: translateX(-3px); }
  }
  /* capacity hint pip count under the spindle is implied by min-height; the
     cap is enforced in JS. */
  .tol-ball {
    position: relative; z-index: 1; width: 30px; height: 30px;
    border-radius: 50%; box-shadow: 0 1px 4px rgba(0,0,0,0.3),
      inset 0 -3px 6px rgba(0,0,0,0.22), inset 0 3px 5px rgba(255,255,255,0.22);
    transition: transform 0.08s ease, filter 0.12s ease;
  }
  .tol-ball.tol-lift { filter: brightness(1.2); transform: translateY(-4px); }
  .tol-cap {
    font-family: "JetBrains Mono", monospace; font-size: 0.66rem;
    color: var(--sub); opacity: 0.8; margin-top: 2px; min-height: 0.9em;
  }
  .tol-board.tol-win .tol-peg { box-shadow: inset 0 0 0 2px var(--go); }
`);

NERDBOX.register({
  id: "tol",
  name: "Tower of London",
  tagline: "reach the target in the fewest moves",
  category: "reasoning",
  test: true,
  scoreMode: "max",
  formatScore: function (v) { return v + " solved"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V8"/><path d="M12 21V5"/><path d="M19 21V11"/><circle cx="5" cy="6" r="1.6"/><circle cx="12" cy="3.4" r="1.6"/><circle cx="19" cy="9" r="1.6"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand, shuffle = ctx.util.shuffle;

    // peg capacities: A=3, B=2, C=1 (classic ToL). index 0,1,2.
    var CAP = [3, 2, 1];
    var NBALLS = 3;
    var BALL_LABEL = ["a", "b", "c"];           // stable ids for the 3 balls
    // three distinct, theme-derived colours (same palette idea as triplenback)
    var BALL_COLOR = [
      ctx.themeColor("--accent") || "#e2b714",
      ctx.themeColor("--go") || "#4caf72",
      ctx.themeColor("--error") || "#ca4754"
    ];

    // the battery: optimal depths to attempt, in order. ~10 problems.
    var DEPTHS = [2, 3, 3, 4, 4, 5, 5, 6, 7, 8];
    var MAX_FAILS = 2;                           // stop after this many failures
    var BFS_CAP = 2000;                          // defensive bound on BFS expansion

    // ---- state ----
    var idx = 0;                 // index into DEPTHS (current problem, 0-based)
    var solvedCount = 0;         // problems solved within budget (the metric)
    var failCount = 0;           // problems failed so far
    var workStacks = null;       // [[..A],[..B],[..C]] working board, bottom->top
    var targetStacks = null;     // target arrangement
    var optimal = 0;             // optimal moves for the current problem (= budget)
    var movesUsed = 0;           // moves the player has made this problem
    var picked = -1;             // peg index of the lifted ball, or -1
    var phase = "idle";          // idle | play | wait | over

    var timers = [];             // every setTimeout id, cleared on teardown

    // ---- DOM ----
    var bar = el("div", "tol-bar");
    var boards = el("div", "tol-boards");
    var hint = el("div", "tol-hint", "");
    var overlay = el("div", "g-overlay");
    var wrap = el("div", "tol-wrap");

    // working panel (interactive) + target panel (static)
    var workPanel = el("div", "tol-panel");
    workPanel.appendChild(el("div", "tol-label", "your board"));
    var workBoard = el("div", "tol-board");
    workPanel.appendChild(workBoard);

    var targetPanel = el("div", "tol-panel tol-target");
    targetPanel.appendChild(el("div", "tol-label", "target"));
    var targetBoard = el("div", "tol-board tol-locked");
    targetPanel.appendChild(targetBoard);

    var workPegs = [];
    var targetPegs = [];
    var p, pe, capEl;
    for (p = 0; p < 3; p++) {
      pe = el("button", "tol-peg");
      pe.type = "button";
      pe.dataset.peg = p;
      pe.setAttribute("aria-label", "peg " + BALL_LABEL[p].toUpperCase());
      pe.addEventListener("click", onPeg);   // bound to the element, no global listeners
      capEl = el("div", "tol-cap", "max " + CAP[p]);
      workBoard.appendChild(pe);
      workPegs.push(pe);

      var te = el("button", "tol-peg");
      te.type = "button";
      te.setAttribute("aria-label", "target peg " + BALL_LABEL[p].toUpperCase());
      targetBoard.appendChild(te);
      targetPegs.push(te);
    }
    // capacity labels under each working peg (a small row beneath the board)
    var capRow = el("div", "tol-board");
    for (p = 0; p < 3; p++) capRow.appendChild(el("div", "tol-cap", "max " + CAP[p]));
    workPanel.appendChild(capRow);

    boards.appendChild(workPanel);
    boards.appendChild(targetPanel);
    wrap.appendChild(bar);
    wrap.appendChild(boards);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    // ---- timer helpers (tracked so teardown clears every one) ----
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

    // ---- state / BFS plumbing -------------------------------------------------
    // A state is encoded as a string "a1b2|c|" : each peg's ball-ids bottom->top,
    // pegs separated by "|". Ball ids are 0,1,2. This is a canonical key.
    function keyOf(stacks) {
      var parts = [];
      for (var i = 0; i < 3; i++) parts.push(stacks[i].join(","));
      return parts.join("|");
    }
    function cloneStacks(stacks) {
      return [stacks[0].slice(), stacks[1].slice(), stacks[2].slice()];
    }
    function stacksFromKey(k) {
      var parts = k.split("|");
      var out = [];
      for (var i = 0; i < 3; i++) {
        out.push(parts[i] === "" ? [] : parts[i].split(",").map(Number));
      }
      return out;
    }
    // legal next states from a state key (top ball -> any other peg with room)
    function neighbors(stacks) {
      var res = [];
      for (var s = 0; s < 3; s++) {
        if (stacks[s].length === 0) continue;        // nothing to lift
        for (var d = 0; d < 3; d++) {
          if (d === s) continue;
          if (stacks[d].length >= CAP[d]) continue;  // destination full
          var ns = cloneStacks(stacks);
          var ball = ns[s].pop();
          ns[d].push(ball);
          res.push(ns);
        }
      }
      return res;
    }
    // BFS from a start state: returns { dist: {key:depth}, atDepth: {depth:[keys]} }.
    // The reachable space here is tiny (3 balls, caps 3/2/1) — a few dozen states —
    // but the expansion is hard-capped at BFS_CAP for safety.
    function bfs(startStacks) {
      var dist = {};
      var atDepth = {};
      var startKey = keyOf(startStacks);
      dist[startKey] = 0;
      atDepth[0] = [startKey];
      var queue = [startKey];
      var head = 0;
      var expanded = 0;
      while (head < queue.length && expanded < BFS_CAP) {
        var curKey = queue[head++];
        expanded++;
        var d0 = dist[curKey];
        var nbrs = neighbors(stacksFromKey(curKey));
        for (var i = 0; i < nbrs.length; i++) {
          var nk = keyOf(nbrs[i]);
          if (dist.hasOwnProperty(nk)) continue;
          dist[nk] = d0 + 1;
          if (!atDepth[d0 + 1]) atDepth[d0 + 1] = [];
          atDepth[d0 + 1].push(nk);
          queue.push(nk);
        }
      }
      return { dist: dist, atDepth: atDepth };
    }

    // a random legal full arrangement of the 3 balls across the capacities
    function randomArrangement() {
      // assign each of the 3 balls to a peg, respecting capacity, then BFS will
      // guarantee reachability anyway. We build by shuffling balls and greedily
      // placing where room remains.
      var order = shuffle([0, 1, 2]);             // ball ids in random order
      var attempt = 0;
      while (attempt < 50) {                      // bounded retry, practically 1 pass
        attempt++;
        var stacks = [[], [], []];
        var ok = true;
        for (var i = 0; i < order.length; i++) {
          // pick a random peg that still has room
          var rooms = [];
          for (var pgi = 0; pgi < 3; pgi++) if (stacks[pgi].length < CAP[pgi]) rooms.push(pgi);
          if (!rooms.length) { ok = false; break; }
          var peg = rooms[rand(rooms.length)];
          stacks[peg].push(order[i]);
        }
        if (ok) return stacks;
        order = shuffle(order);
      }
      // guaranteed-valid fallback: a=ball0,ball1; ... actually place all 3 within caps
      return [[order[0], order[1]], [order[2]], []];
    }

    // build a problem with a known optimal depth `want`. Returns {start,target,opt}.
    // We BFS from a random start; if a state exists exactly `want` away, pick one.
    // Otherwise retry with a new random start (bounded). Falls back to the deepest
    // available state so a problem is always produced.
    function makeProblem(want) {
      var tries = 0;
      var best = null;                 // best fallback {start,target,opt}
      while (tries < 60) {
        tries++;
        var start = randomArrangement();
        var info = bfs(start);
        var pool = info.atDepth[want];
        if (pool && pool.length) {
          var tk = pool[rand(pool.length)];
          return { start: start, target: stacksFromKey(tk), opt: want };
        }
        // remember the deepest reachable target as a fallback
        var maxD = 0;
        for (var k in info.dist) if (info.dist.hasOwnProperty(k) && info.dist[k] > maxD) maxD = info.dist[k];
        if (maxD > 0 && (!best || maxD > best.opt)) {
          var fk = info.atDepth[maxD][0];
          best = { start: start, target: stacksFromKey(fk), opt: maxD };
        }
      }
      // fallback (extremely unlikely): use the deepest we saw, else a 1-move pair
      if (best) return best;
      var s = randomArrangement();
      var nb = neighbors(s);
      return { start: s, target: nb.length ? nb[0] : cloneStacks(s), opt: nb.length ? 1 : 0 };
    }

    // ---- rendering ------------------------------------------------------------
    function renderBoard(pegEls, stacks, allowLift) {
      for (var i = 0; i < 3; i++) {
        var node = pegEls[i];
        node.innerHTML = "";
        node.classList.toggle("tol-sel", allowLift && picked === i);
        var canDrop = allowLift && picked >= 0 && i !== picked && stacks[i].length < CAP[i];
        node.classList.toggle("tol-ok", canDrop);
        var st = stacks[i];
        for (var j = 0; j < st.length; j++) {
          var ball = el("div", "tol-ball");
          ball.style.background = BALL_COLOR[st[j]];
          if (allowLift && picked === i && j === st.length - 1) ball.classList.add("tol-lift");
          node.appendChild(ball);
        }
      }
    }
    function render() {
      renderBoard(workPegs, workStacks, true);
      renderBoard(targetPegs, targetStacks, false);
    }

    function setBar() {
      var best = NERDBOX.getBest("tol");
      bar.innerHTML =
        '<span>problem&nbsp;<b>' + Math.min(idx + 1, DEPTHS.length) + '</b>/<b>' + DEPTHS.length + '</b></span>' +
        '<span>optimal&nbsp;<span class="tol-acc">' + optimal + '</span></span>' +
        '<span>moves&nbsp;<b>' + movesUsed + '</b>/<b>' + optimal + '</b></span>' +
        '<span>solved&nbsp;<b>' + solvedCount + '</b></span>' +
        (best === null ? "" : '<span>best&nbsp;<b>' + best + '</b></span>');
    }

    function shake(i) {
      var node = workPegs[i];
      node.classList.remove("tol-shake");
      void node.offsetWidth;
      node.classList.add("tol-shake");
    }

    function isMatch() {
      return keyOf(workStacks) === keyOf(targetStacks);
    }

    // ---- problem lifecycle ----------------------------------------------------
    function loadProblem() {
      var prob = makeProblem(DEPTHS[idx]);
      workStacks = cloneStacks(prob.start);
      targetStacks = cloneStacks(prob.target);
      optimal = prob.opt;
      movesUsed = 0;
      picked = -1;
      phase = "play";
      workBoard.classList.remove("tol-locked", "tol-win");
      hint.className = "tol-hint";
      hint.textContent = "match the target in " + optimal + " move" + (optimal === 1 ? "" : "s");
      render();
      setBar();
    }

    function nextProblem() {
      idx++;
      if (idx >= DEPTHS.length || failCount >= MAX_FAILS) { finish(); return; }
      loadProblem();
    }

    function problemSolved() {
      phase = "wait";
      solvedCount++;
      workBoard.classList.add("tol-locked", "tol-win");
      picked = -1;
      render();
      setBar();
      hint.className = "tol-hint tol-good";
      hint.textContent = "solved in " + movesUsed + " — optimal!";
      after(820, nextProblem);
    }

    function problemFailed() {
      phase = "wait";
      failCount++;
      workBoard.classList.add("tol-locked");
      picked = -1;
      render();
      hint.className = "tol-hint tol-warn";
      hint.textContent = "out of moves — failed (" + failCount + "/" + MAX_FAILS + ")";
      after(900, nextProblem);
    }

    // ---- interaction ----------------------------------------------------------
    function onPeg() {
      if (phase !== "play") return;
      var i = Number(this.dataset.peg);

      if (picked < 0) {
        // lift the top ball of this peg
        if (workStacks[i].length === 0) {
          hint.className = "tol-hint tol-warn";
          hint.textContent = "that peg is empty";
          shake(i);
          return;
        }
        picked = i;
        render();
        hint.className = "tol-hint";
        hint.textContent = "drop on a peg with room (click the same peg to cancel)";
        return;
      }

      // a ball is held
      if (i === picked) {
        picked = -1;
        render();
        hint.className = "tol-hint";
        hint.textContent = "match the target in " + optimal + " move" + (optimal === 1 ? "" : "s");
        return;
      }

      if (workStacks[i].length >= CAP[i]) {
        hint.className = "tol-hint tol-warn";
        hint.textContent = "peg " + BALL_LABEL[i].toUpperCase() + " is full (max " + CAP[i] + ")";
        shake(i);
        return;
      }

      // legal move
      var ball = workStacks[picked].pop();
      workStacks[i].push(ball);
      picked = -1;
      movesUsed++;
      render();
      setBar();

      if (isMatch()) { problemSolved(); return; }
      if (movesUsed >= optimal) { problemFailed(); return; }

      hint.className = "tol-hint";
      hint.textContent = (optimal - movesUsed) + " move" + (optimal - movesUsed === 1 ? "" : "s") + " left";
    }

    // ---- end of test ----------------------------------------------------------
    function finish() {
      phase = "over";
      workBoard.classList.add("tol-locked");
      var isBest = ctx.submitScore(solvedCount);   // max -> problems solved optimally
      overlay.innerHTML =
        '<div class="g-result">' +
        '<div class="g-big">' + solvedCount + ' / ' + DEPTHS.length + '</div>' +
        '<div class="g-sub">' + (isBest && solvedCount > 0 ? "new best &middot; " : "") + 'problems solved' + '</div>' +
        '<div class="g-sub">' + (solvedCount > 0
          ? "reached the target within the optimal move budget"
          : "plan the moves — match the target in the fewest moves") + '</div>' +
        '<button class="g-btn">retake</button>' +
        '</div>';
      overlay.querySelector("button").addEventListener("click", startTest);
      overlay.classList.add("show");
    }

    function startTest() {
      clearTimers();
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      idx = 0;
      solvedCount = 0;
      failCount = 0;
      loadProblem();
    }

    // ---- idle preview behind the start overlay --------------------------------
    function showStart() {
      idx = 0;
      solvedCount = 0;
      failCount = 0;
      optimal = 0;
      movesUsed = 0;
      // a calm sample arrangement behind the overlay
      workStacks = [[0], [1], [2]];
      targetStacks = [[2, 0], [1], []];
      workBoard.classList.add("tol-locked");
      render();
      setBar();
      hint.className = "tol-hint";
      hint.textContent = "peg A holds 3, B holds 2, C holds 1";
      overlay.innerHTML =
        '<div class="g-result">' +
        '<div class="g-sub">rearrange <b>your board</b> to match the <b>target</b>. click a peg to lift its top ball, then a peg with room to drop it.</div>' +
        '<div class="g-sub">each problem gives you exactly the <b>optimal</b> number of moves. ' + DEPTHS.length + ' problems, harder each time.</div>' +
        '<button class="g-btn">start</button>' +
        '</div>';
      overlay.querySelector("button").addEventListener("click", startTest);
      overlay.classList.add("show");
    }

    showStart();

    // teardown: clear every tracked timer. All clicks are on peg <button>s inside
    // root (no document/window listeners), so removing the subtree releases them.
    return function teardown() {
      phase = "over";
      clearTimers();
    };
  }
});
