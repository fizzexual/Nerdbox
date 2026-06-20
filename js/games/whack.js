/* Whack — bonk the moles before they hide. A fast 30-second round.
   Moles pop up in random empty holes and stay visible for a SHRINKING
   window (faster as the clock runs down). Click a visible mole to whack it
   (+1 hit); moles you miss just duck back down (no penalty). Spawn rate
   ramps up over time so the board gets busier.

   Timers: every spawn-loop / hide timer id is stored in `timers` (a Set)
   and cleared on finish AND teardown. A `running` flag + `round` token make
   any stale callback a no-op, so nothing can fire after the round ends. */
NERDBOX.injectStyle("whack", `
.whack-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.1rem;
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
  position: relative;
}
.whack-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: clamp(10px, 3.2vw, 20px);
  width: 100%;
  touch-action: manipulation;
}
.whack-hole {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  background: var(--bg-alt);
  border: 2px solid var(--sub-alt);
  overflow: hidden;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  box-shadow: inset 0 6px 14px rgba(0, 0, 0, 0.28);
}
/* the mole — a filled critter rendered in the accent colour, hidden by default
   below the hole rim, sprung up when active */
.whack-mole {
  position: absolute;
  left: 14%;
  bottom: -64%;
  width: 72%;
  height: 86%;
  color: var(--accent);
  transform: translateY(0) scale(0.7);
  opacity: 0;
  transition: transform 0.09s cubic-bezier(.34, 1.7, .5, 1), opacity 0.09s ease, bottom 0.09s ease;
  pointer-events: none;
  will-change: transform, bottom;
}
.whack-mole svg { width: 100%; height: 100%; display: block; }
.whack-hole.whack-up .whack-mole {
  bottom: 8%;
  transform: translateY(0) scale(1);
  opacity: 1;
}
.whack-hole.whack-up { border-color: var(--accent); }
/* satisfying bonk flash on a successful whack */
.whack-hole.whack-bonk { border-color: var(--go); }
.whack-hole.whack-bonk .whack-mole {
  transform: translateY(0) scale(1.18);
  color: var(--go);
}
.whack-grid.whack-live .whack-hole:active { transform: scale(0.97); }

.whack-status { width: 100%; }
.whack-status .whack-hits { color: var(--accent); font-weight: 700; }
.whack-status .whack-time { color: var(--sub); }
.whack-status .whack-time.whack-low { color: var(--error); }
.whack-hint {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.85rem;
  text-align: center;
  line-height: 1.5;
}
`);

NERDBOX.register({
  id: "whack",
  name: "Whack",
  tagline: "bonk the moles before they hide",
  category: "reflex",
  scoreMode: "max",
  formatScore: function (v) { return v + " hits"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-3 3-6-6 3-3z"/><path d="M11 7L4 14l-1 4 4-1 7-7"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;

    /* ---- config ---- */
    var COLS = 3, ROWS = 3;
    var HOLES = COLS * ROWS;
    var ROUND_MS = 30000;            // 30-second round
    // mole visible window shrinks from SHOW_MAX -> SHOW_MIN across the round
    var SHOW_MAX = 1050, SHOW_MIN = 480;
    // gap between spawn attempts shrinks from SPAWN_MAX -> SPAWN_MIN (busier over time)
    var SPAWN_MAX = 720, SPAWN_MIN = 300;
    var MAX_UP = 4;                  // cap simultaneous moles so it stays fair

    // critter: a simple filled mole (no emoji) — rounded body, ears, eyes, nose
    var MOLE_SVG =
      '<svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">' +
        '<circle cx="26" cy="30" r="13"/>' +
        '<circle cx="74" cy="30" r="13"/>' +
        '<path d="M50 16c-22 0-38 16-38 40 0 24 16 40 38 40s38-16 38-40c0-24-16-40-38-40z"/>' +
        '<circle cx="36" cy="50" r="6" fill="var(--bg)"/>' +
        '<circle cx="64" cy="50" r="6" fill="var(--bg)"/>' +
        '<ellipse cx="50" cy="66" rx="9" ry="7" fill="var(--bg)"/>' +
      '</svg>';

    /* ---- timers: every active id lives here and is cleared on finish/teardown ---- */
    var timers = new Set();
    function later(fn, ms) {
      var id = setTimeout(function () {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    }
    function clearTimers() {
      timers.forEach(function (id) { clearTimeout(id); });
      timers.clear();
    }

    /* ---- state ---- */
    var running = false;
    var round = 0;            // bumped each start/finish/teardown; stale guard token
    var hits = 0;
    var startTime = 0;
    var endTimer = null;      // the master 30s timer (also tracked in `timers`)
    var tickTimer = null;     // countdown display tick (also tracked in `timers`)
    var holes = [];           // hole elements
    var holeUp = [];          // hole hide-timer id (or null) — null means empty
    var upCount = 0;

    /* ---- layout ---- */
    var wrap = el("div", "whack-wrap");
    var status = el("div", "g-status whack-status");
    var grid = el("div", "whack-grid");
    grid.style.gridTemplateColumns = "repeat(" + COLS + ", 1fr)";
    for (var i = 0; i < HOLES; i++) {
      var hole = el("div", "whack-hole");
      hole.appendChild(el("div", "whack-mole", MOLE_SVG));
      grid.appendChild(hole);
      holes.push(hole);
      holeUp.push(null);
    }
    var hint = el("div", "whack-hint", "moles pop up — click them before they duck back down");
    var overlay = el("div", "g-overlay");
    wrap.appendChild(status);
    wrap.appendChild(grid);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    function progress() {
      // 0 at start -> 1 at end of round
      var p = (performance.now() - startTime) / ROUND_MS;
      return p < 0 ? 0 : p > 1 ? 1 : p;
    }
    function lerp(a, b, t) { return a + (b - a) * t; }

    function remainingSec() {
      var ms = ROUND_MS - (performance.now() - startTime);
      return Math.max(0, Math.ceil(ms / 1000));
    }

    function renderStatus() {
      var secs = running ? remainingSec() : 30;
      var low = running && secs <= 5;
      status.innerHTML =
        '<span class="whack-hits">' + hits + ' hits</span>' +
        '<span class="whack-time' + (low ? ' whack-low' : '') + '">' + secs + 's</span>';
    }

    /* ---- a single click handler per hole, set up once ---- */
    function makeHandler(idx) {
      return function () { whack(idx); };
    }
    for (var h = 0; h < HOLES; h++) {
      holes[h].addEventListener("click", makeHandler(h));
    }

    function hideHole(idx) {
      var t = holeUp[idx];
      if (t !== null) { clearTimeout(t); timers.delete(t); holeUp[idx] = null; }
      var hole = holes[idx];
      if (hole.classList.contains("whack-up")) upCount--;
      hole.classList.remove("whack-up", "whack-bonk");
    }

    function whack(idx) {
      if (!running) return;
      if (!holes[idx].classList.contains("whack-up")) return; // only count visible moles
      hits++;
      // quick bonk flash, then duck down
      var hole = holes[idx];
      hole.classList.add("whack-bonk");
      // clear this mole's hide-timer; schedule the visual duck-down
      var prev = holeUp[idx];
      if (prev !== null) { clearTimeout(prev); timers.delete(prev); }
      var myRound = round;
      holeUp[idx] = later(function () {
        if (!running || myRound !== round) return;
        hideHole(idx);
      }, 70);
      renderStatus();
    }

    function popMole() {
      if (!running) return;
      if (upCount >= MAX_UP) return;
      // pick a random empty hole
      var empty = [];
      for (var i = 0; i < HOLES; i++) {
        if (holeUp[i] === null && !holes[i].classList.contains("whack-up")) empty.push(i);
      }
      if (!empty.length) return;
      var idx = empty[ctx.util.rand(empty.length)];
      var hole = holes[idx];
      hole.classList.remove("whack-bonk");
      hole.classList.add("whack-up");
      upCount++;

      var t = progress();
      var visible = lerp(SHOW_MAX, SHOW_MIN, t);
      var myRound = round;
      // hide-timer for THIS mole — stored so it's cleared on finish/teardown
      holeUp[idx] = later(function () {
        if (!running || myRound !== round) return;
        hideHole(idx); // missed — duck back down, no penalty
      }, visible);
    }

    function scheduleSpawn() {
      if (!running) return;
      var t = progress();
      var gap = lerp(SPAWN_MAX, SPAWN_MIN, t);
      var myRound = round;
      later(function () {
        if (!running || myRound !== round) return;
        popMole();
        scheduleSpawn(); // self-rescheduling spawn loop
      }, gap);
    }

    function tick() {
      if (!running) return;
      renderStatus();
      var myRound = round;
      tickTimer = later(function () {
        if (!running || myRound !== round) return;
        tick();
      }, 200);
    }

    function start() {
      clearTimers();
      round++;
      running = true;
      hits = 0;
      upCount = 0;
      for (var i = 0; i < HOLES; i++) {
        holeUp[i] = null;
        holes[i].classList.remove("whack-up", "whack-bonk");
      }
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      grid.classList.add("whack-live");
      startTime = performance.now();
      renderStatus();

      var myRound = round;
      endTimer = later(function () {
        if (!running || myRound !== round) return;
        finish();
      }, ROUND_MS);

      tick();
      scheduleSpawn();
      popMole(); // kick off immediately so there's no dead air
    }

    function finish() {
      running = false;
      round++;             // invalidate any callback still holding the old token
      clearTimers();
      endTimer = null;
      tickTimer = null;
      for (var i = 0; i < HOLES; i++) {
        holeUp[i] = null;
        holes[i].classList.remove("whack-up", "whack-bonk");
      }
      upCount = 0;
      grid.classList.remove("whack-live");

      var best = ctx.submitScore(hits);
      status.innerHTML =
        '<span class="whack-hits">' + hits + ' hits</span>' +
        '<span class="whack-time">0s</span>';

      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + hits + '</div>' +
          '<div class="g-sub">' + (best ? "new best! · " : "") + 'moles bonked in 30s</div>' +
          '<button class="g-btn">play again</button>' +
        '</div>'
      );
    }

    function showOverlay(html) {
      overlay.innerHTML = html;
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", start);
      overlay.classList.add("show");
    }

    /* ---- initial idle state ---- */
    renderStatus();
    showOverlay(
      '<div class="g-result">' +
        '<div class="g-sub" style="margin-bottom:.4rem">30 seconds · bonk as many moles as you can</div>' +
        '<button class="g-btn">start</button>' +
      '</div>'
    );

    /* ---- teardown: stop the round and clear EVERY timer so nothing fires later ---- */
    return function () {
      running = false;
      round++;            // any in-flight callback sees a stale token and bails
      clearTimers();      // clears spawn-loop, every mole hide-timer, end + tick timers
      endTimer = null;
      tickTimer = null;
    };
  }
});
