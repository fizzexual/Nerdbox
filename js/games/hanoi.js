/* Tower of Hanoi — a tower of N disks (largest at the bottom, smallest on top)
   starts on the LEFT peg. Rebuild it on the RIGHT peg. Move ONE disk at a time
   (only the TOP disk of a peg) and never place a larger disk on a smaller one.
   Click a peg to pick up its top disk, then click a destination to drop it;
   clicking the same peg cancels. Solve the level -> submitScore(N), advance to
   N+1 disks. best = largest tower completed (max). Starts at N=3. */
NERDBOX.injectStyle("hanoi", `
.hanoi-wrap { position: relative; width: 100%; max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 1.1rem; }
.hanoi-bar {
  display: flex;
  gap: 1.6rem;
  justify-content: center;
  flex-wrap: wrap;
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.95rem;
  min-height: 1.4em;
}
.hanoi-bar b { color: var(--text); font-weight: 500; }
.hanoi-bar .hanoi-min b { color: var(--accent); }
.hanoi-msg {
  font-family: "JetBrains Mono", monospace;
  font-size: 0.9rem;
  min-height: 1.4em;
  color: var(--sub);
  text-align: center;
  transition: color 0.12s;
}
.hanoi-msg.bad { color: var(--error); }
.hanoi-msg.go { color: var(--go); }
.hanoi-board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: 100%;
}
.hanoi-peg {
  position: relative;
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  min-height: 240px;
  padding: 10px 6px 14px;
  border: none;
  border-radius: 12px;
  background: var(--bg-alt);
  cursor: pointer;
  transition: box-shadow 0.15s ease, background 0.15s ease, transform 0.08s ease;
}
/* the vertical spindle + base, drawn behind the disks */
.hanoi-peg::before {
  content: "";
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  top: 14px;
  bottom: 22px;
  width: 6px;
  border-radius: 3px;
  background: var(--sub-alt);
  z-index: 0;
}
.hanoi-peg::after {
  content: "";
  position: absolute;
  left: 10%;
  right: 10%;
  bottom: 12px;
  height: 6px;
  border-radius: 3px;
  background: var(--sub-alt);
  z-index: 0;
}
.hanoi-peg:hover { background: color-mix(in srgb, var(--accent) 8%, var(--bg-alt)); }
.hanoi-peg.selected { box-shadow: inset 0 0 0 2px var(--accent); }
.hanoi-peg.shake { animation: hanoi-shake 0.34s ease; }
.hanoi-peg.target-ok:hover { box-shadow: inset 0 0 0 2px var(--go); }
@keyframes hanoi-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-5px); }
  40% { transform: translateX(5px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(3px); }
}
.hanoi-disk {
  position: relative;
  z-index: 1;
  height: 22px;
  border-radius: 6px;
  background: var(--accent);
  box-shadow: 0 1px 4px rgba(0,0,0,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: "JetBrains Mono", monospace;
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--bg);
  transition: transform 0.08s ease, filter 0.12s ease, box-shadow 0.12s ease;
}
.hanoi-disk.lifted {
  filter: brightness(1.18);
  transform: translateY(-3px);
  box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 60%, transparent);
}
.hanoi-board.locked .hanoi-peg { cursor: default; pointer-events: none; }
.hanoi-actions { display: flex; justify-content: center; margin-top: 0.1rem; }
.hanoi-reset {
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
.hanoi-reset:hover { color: var(--text); border-color: var(--accent); background: var(--bg-alt); }
.hanoi-pegline { color: var(--accent); }
`);

NERDBOX.register({
  id: "hanoi",
  name: "Tower of Hanoi",
  tagline: "move the stack, one disk at a time",
  category: "reasoning",
  difficulty: "hard",
  scoreMode: "max",
  formatScore: function (v) { return v + " disks"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M12 3v14"/><path d="M8 9h8"/><path d="M6 13h12"/><path d="M9.5 17h5"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;
    var PEGS = 3;            // left=0, middle=1, right=2
    var RIGHT = 2;
    var START_N = 3;

    // ---- state ----
    var N = START_N;         // disks in the current level
    var pegs = [[], [], []]; // pegs[i] = array of disk sizes, index 0 = bottom, last = top
    var picked = -1;         // peg index of the lifted disk, or -1 when nothing held
    var moves = 0;
    var solved = false;      // current level cleared (lock input during transition)
    var started = false;
    var timer = null;
    var msgTimer = null;

    // ---- DOM ----
    var bar = el("div", "hanoi-bar");
    var msg = el("div", "hanoi-msg");
    var board = el("div", "hanoi-board");
    var overlay = el("div", "g-overlay");
    var wrap = el("div", "hanoi-wrap");

    var pegEls = [];
    for (var p = 0; p < PEGS; p++) {
      var pe = el("button", "hanoi-peg");
      pe.dataset.peg = p;
      pe.setAttribute("aria-label", p === 0 ? "left peg" : (p === RIGHT ? "right peg" : "middle peg"));
      pe.addEventListener("click", onPeg);
      board.appendChild(pe);
      pegEls.push(pe);
    }

    wrap.appendChild(bar);
    wrap.appendChild(msg);
    wrap.appendChild(board);
    wrap.appendChild(overlay);

    var actions = el("div", "hanoi-actions");
    var resetBtn = el("button", "hanoi-reset", "reset level");
    actions.appendChild(resetBtn);

    root.appendChild(wrap);
    root.appendChild(actions);

    // ---- helpers ----
    function later(fn, ms) { clearTimeout(timer); timer = setTimeout(fn, ms); }
    function minMoves(n) { return Math.pow(2, n) - 1; } // optimal solution length

    function topOf(i) { var s = pegs[i]; return s.length ? s[s.length - 1] : null; }

    // build the starting tower for the current N on the LEFT peg:
    // largest (N) at the bottom -> smallest (1) on top.
    function buildLevel() {
      pegs = [[], [], []];
      for (var d = N; d >= 1; d--) pegs[0].push(d); // push N..1 so last element (top) is 1
      picked = -1;
      moves = 0;
      solved = false;
      board.classList.remove("locked");
    }

    // Is the puzzle complete? Every disk on the RIGHT peg, correctly ordered
    // (bottom = N, top = 1). Moves are always legal so length === N is enough,
    // but verify the full ordering defensively.
    function isSolved() {
      var s = pegs[RIGHT];
      if (s.length !== N) return false;
      for (var i = 0; i < N; i++) {
        if (s[i] !== N - i) return false; // bottom-up must be N, N-1, ..., 1
      }
      return true;
    }

    function flashMsg(text, cls, sticky) {
      clearTimeout(msgTimer);
      msg.className = "hanoi-msg" + (cls ? " " + cls : "");
      msg.textContent = text;
      if (!sticky) {
        msgTimer = setTimeout(function () {
          if (!started || solved) return;
          msg.className = "hanoi-msg";
          msg.textContent = pickHint();
        }, 1100);
      }
    }

    function pickHint() {
      if (picked >= 0) return "drop on a peg (or click the same peg to cancel)";
      return "click a peg to pick up its top disk";
    }

    function shake(i) {
      var pe = pegEls[i];
      pe.classList.remove("shake");
      void pe.offsetWidth; // restart the animation on repeated illegal moves
      pe.classList.add("shake");
    }

    // ---- rendering ----
    function render() {
      for (var i = 0; i < PEGS; i++) {
        var pe = pegEls[i];
        pe.innerHTML = "";
        pe.classList.toggle("selected", picked === i);
        // highlight legal drop targets while a disk is held
        var canDrop = picked >= 0 && i !== picked && legal(picked, i);
        pe.classList.toggle("target-ok", canDrop);

        var stack = pegs[i];
        for (var k = 0; k < stack.length; k++) {
          var size = stack[k];
          var disk = el("div", "hanoi-disk");
          // width grows with disk size: smallest ~34%, largest ~100% of the peg
          var pct = 34 + (size - 1) * (66 / Math.max(1, N - 1));
          disk.style.width = pct + "%";
          disk.textContent = size;
          // the top disk of the picked peg is the lifted one
          if (picked === i && k === stack.length - 1) disk.classList.add("lifted");
          pe.appendChild(disk);
        }
      }
    }

    function updateBar() {
      bar.innerHTML =
        '<span class="hanoi-disks">disks&nbsp;<b>' + N + "</b></span>" +
        '<span class="hanoi-moves">your moves&nbsp;<b>' + moves + "</b></span>" +
        '<span class="hanoi-min">min&nbsp;<b>' + minMoves(N) + "</b></span>";
    }

    // ---- rules ----
    // a move from `src` to `dst` is legal when the destination is empty or its
    // top disk is LARGER than the disk being moved (src's top).
    function legal(src, dst) {
      var moving = topOf(src);
      if (moving === null) return false;
      var onto = topOf(dst);
      return onto === null || moving < onto;
    }

    // ---- interaction ----
    function onPeg() {
      if (!started || solved) return;
      var i = Number(this.dataset.peg);

      if (picked < 0) {
        // pick up: must have a disk to lift
        if (topOf(i) === null) {
          flashMsg("that peg is empty", "bad");
          shake(i);
          return;
        }
        picked = i;
        render();
        flashMsg(pickHint(), "");
        return;
      }

      // a disk is already held
      if (i === picked) {
        // clicking the same peg cancels the pickup
        picked = -1;
        render();
        flashMsg(pickHint(), "");
        return;
      }

      if (!legal(picked, i)) {
        // illegal: cannot place a larger disk on a smaller one
        flashMsg("can't place a larger disk on a smaller one", "bad");
        shake(i);
        return;
      }

      // legal move: pop from src, push onto dst
      var disk = pegs[picked].pop();
      pegs[i].push(disk);
      picked = -1;
      moves++;
      render();
      updateBar();

      if (isSolved()) { win(); return; }
      flashMsg(pickHint(), "");
    }

    function win() {
      solved = true;
      board.classList.add("locked");
      clearTimeout(msgTimer);
      var par = moves === minMoves(N);
      var isBest = ctx.submitScore(N); // max — largest tower solved
      msg.className = "hanoi-msg go";
      msg.textContent = "solved in " + moves + " moves" +
        (par ? " — optimal!" : "") + (isBest ? " · new best!" : "");
      later(function () {
        N++;
        buildLevel();
        render();
        updateBar();
        msg.className = "hanoi-msg";
        msg.textContent = pickHint();
      }, 1100);
    }

    // ---- lifecycle ----
    function startGame() {
      overlay.classList.remove("show");
      started = true;
      N = START_N;
      buildLevel();
      render();
      updateBar();
      flashMsg(pickHint(), "");
    }

    resetBtn.addEventListener("click", function () {
      if (!started || solved) return;
      // rebuild the current N on the left; keeps the level number
      buildLevel();
      render();
      updateBar();
      flashMsg("level reset", "");
    });

    function showStart() {
      overlay.innerHTML =
        '<div class="g-result">' +
        '<div class="g-sub">rebuild the tower on the <span class="hanoi-pegline">right</span> peg &middot; one disk at a time</div>' +
        '<button class="g-btn">start</button></div>';
      overlay.querySelector("button").addEventListener("click", startGame);
      overlay.classList.add("show");
    }

    // ---- idle preview ----
    buildLevel();          // seed a calm N=3 tower on the left behind the overlay
    render();
    updateBar();
    board.classList.add("locked");
    msg.className = "hanoi-msg";
    msg.textContent = "move the stack, one disk at a time";
    showStart();

    return function teardown() {
      clearTimeout(timer);
      clearTimeout(msgTimer);
    };
  }
});
