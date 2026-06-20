/* Steady Hand — trace a winding corridor with the mouse without touching the walls.
   Fine-motor / dexterity. Desktop / mouse game. Each level is narrower / longer. */
NERDBOX.injectStyle("steadyhand", `
  .steadyhand-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.9rem; width: 100%; }
  .steadyhand-stage {
    position: relative;
    width: 100%;
    max-width: 720px;
    height: 62vh;
    max-height: 470px;
    background: var(--bg-alt);
    border-radius: 16px;
    overflow: hidden;
    cursor: crosshair;
    touch-action: none;
  }
  /* the wall surface = the whole stage; corridor segments are punched on top in --bg-alt */
  .steadyhand-stage.steadyhand-walls { background: color-mix(in srgb, var(--error) 16%, var(--bg)); }
  .steadyhand-seg {
    position: absolute;
    background: var(--bg-alt);
    border-radius: 7px;
    pointer-events: none;
  }
  .steadyhand-pad {
    position: absolute;
    border-radius: 8px;
    pointer-events: none;
    display: flex; align-items: center; justify-content: center;
    font-family: "JetBrains Mono", monospace;
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--bg);
    z-index: 3;
  }
  .steadyhand-start { background: var(--go); }
  .steadyhand-end   { background: var(--error); }
  .steadyhand-dot {
    position: absolute;
    width: 12px; height: 12px;
    margin-left: -6px; margin-top: -6px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent);
    pointer-events: none;
    z-index: 4;
    display: none;
    transition: background 0.1s;
  }
  .steadyhand-dot.steadyhand-armed { background: var(--go); box-shadow: 0 0 0 3px color-mix(in srgb, var(--go) 35%, transparent); }
  .steadyhand-stage.steadyhand-fail { animation: steadyhand-shake 0.32s ease; }
  .steadyhand-stage.steadyhand-fail .steadyhand-seg { background: color-mix(in srgb, var(--error) 35%, var(--bg-alt)); }
  @keyframes steadyhand-shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-7px); }
    40% { transform: translateX(7px); }
    60% { transform: translateX(-5px); }
    80% { transform: translateX(5px); }
  }
  .steadyhand-hud { font-family: "JetBrains Mono", monospace; color: var(--sub); display: flex; gap: 1.4rem; }
  .steadyhand-hud b { color: var(--accent); font-weight: 500; }
`);

NERDBOX.register({
  id: "steadyhand",
  name: "Steady Hand",
  tagline: "trace the path without touching the walls",
  category: "motor",
  scoreMode: "max",
  formatScore: function (v) { return v + " level"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18c0-4 3-4 3-8s3-5 5-5 4 2 4 5-2 4-2 7"/><circle cx="18" cy="18" r="2.5"/><path d="M2 21h6"/></svg>',
  mount: function (root, ctx) {
    var PAD = 30;        // start/end pad size (px)
    var MARGIN = 18;     // keep corridor away from stage edges

    var wrap = ctx.util.el("div", "steadyhand-wrap");
    var hud = ctx.util.el("div", "steadyhand-hud",
      '<span>level <b id="steadyhand-lvl">1</b></span><span>best <b id="steadyhand-best">' +
      (function () { var b = NERDBOX.getBest("steadyhand"); return b == null ? "—" : b; })() + '</span>');
    var status = ctx.util.el("div", "g-status");
    status.id = "steadyhand-status";
    var stage = ctx.util.el("div", "steadyhand-stage steadyhand-walls");
    stage.id = "steadyhand-stage";
    var dot = ctx.util.el("div", "steadyhand-dot");

    wrap.appendChild(hud);
    wrap.appendChild(status);
    wrap.appendChild(stage);
    root.appendChild(wrap);

    var level = 1;
    var segments = [];   // array of {x, y, w, h} rects (px, stage-local)
    var startRect = null, endRect = null;
    var armed = false;
    var locked = false;  // true between fail/win and the next build (ignore moves)
    var failTimer = null;
    var listening = false;

    function clearFailTimer() { if (failTimer) { clearTimeout(failTimer); failTimer = null; } }

    /* ---- geometry: build a winding corridor as a chain of overlapping rects ---- */
    function buildCorridor(w, h) {
      segments = [];
      // corridor width shrinks with level; length (waypoint count) grows.
      var halfW = Math.max(13, 46 - (level - 1) * 4) / 2;          // 23px half at L1 → floors at 6.5
      var pts = 3 + Math.min(6, Math.floor((level - 1) / 1.5));     // 3 → up to 9 waypoints

      var x0 = MARGIN + PAD / 2;
      var x1 = w - MARGIN - PAD / 2;
      // vertical band the centreline may wander within (leave room for halfW + margin)
      var yMin = MARGIN + halfW;
      var yMax = h - MARGIN - halfW;
      if (yMax < yMin) { var mid = h / 2; yMin = mid - 1; yMax = mid + 1; }

      // waypoints: evenly spaced in x, alternating high/low y for a gentle zig-zag.
      var path = [];
      var amp = (yMax - yMin) / 2;
      // tame the amplitude on the first couple levels for a wide, gentle curve
      var ampScale = Math.min(1, 0.45 + (level - 1) * 0.12);
      var yc = (yMin + yMax) / 2;
      for (var i = 0; i < pts; i++) {
        var t = i / (pts - 1);
        var px = x0 + (x1 - x0) * t;
        var py;
        if (i === 0 || i === pts - 1) {
          py = yc; // start & end on the centre line (pads sit here)
        } else {
          var dir = (i % 2 === 0) ? 1 : -1;
          var jitter = (ctx.util.rand(40) - 20) / 100; // ±0.2 wobble
          var off = amp * ampScale * (0.6 + jitter);
          py = yc + dir * off;
          if (py < yMin) py = yMin;
          if (py > yMax) py = yMax;
        }
        path.push({ x: px, y: py });
      }

      // each consecutive pair → an axis-aligned rect bounding the two points, inflated by halfW.
      // consecutive rects share a joint waypoint, so a 2*halfW square overlaps at every corner
      // → the corridor is fully connected (no gaps where direction changes).
      for (var s = 0; s < path.length - 1; s++) {
        var a = path[s], b = path[s + 1];
        var minX = Math.min(a.x, b.x) - halfW;
        var minY = Math.min(a.y, b.y) - halfW;
        var maxX = Math.max(a.x, b.x) + halfW;
        var maxY = Math.max(a.y, b.y) + halfW;
        segments.push({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
      }

      // pads centred on the first / last waypoint
      var sp = path[0], ep = path[path.length - 1];
      startRect = { x: sp.x - PAD / 2, y: sp.y - PAD / 2, w: PAD, h: PAD };
      endRect   = { x: ep.x - PAD / 2, y: ep.y - PAD / 2, w: PAD, h: PAD };
    }

    function inRect(px, py, r) {
      return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
    }
    function inCorridor(px, py) {
      for (var i = 0; i < segments.length; i++) {
        if (inRect(px, py, segments[i])) return true;
      }
      return false;
    }

    /* ---- rendering ---- */
    function render() {
      // remove old seg/pad nodes but keep the dot
      var old = stage.querySelectorAll(".steadyhand-seg, .steadyhand-pad");
      for (var i = 0; i < old.length; i++) old[i].remove();

      for (var s = 0; s < segments.length; s++) {
        var r = segments[s];
        var seg = ctx.util.el("div", "steadyhand-seg");
        seg.style.left = r.x + "px";
        seg.style.top = r.y + "px";
        seg.style.width = r.w + "px";
        seg.style.height = r.h + "px";
        stage.appendChild(seg);
      }
      var ps = ctx.util.el("div", "steadyhand-pad steadyhand-start", "start");
      ps.style.left = startRect.x + "px"; ps.style.top = startRect.y + "px";
      ps.style.width = startRect.w + "px"; ps.style.height = startRect.h + "px";
      stage.appendChild(ps);

      var pe = ctx.util.el("div", "steadyhand-pad steadyhand-end", "end");
      pe.style.left = endRect.x + "px"; pe.style.top = endRect.y + "px";
      pe.style.width = endRect.w + "px"; pe.style.height = endRect.h + "px";
      stage.appendChild(pe);
    }

    function buildLevel() {
      clearFailTimer();
      armed = false;
      locked = false;
      dot.classList.remove("steadyhand-armed");
      dot.style.display = "none";
      stage.classList.remove("steadyhand-fail");
      var r = stage.getBoundingClientRect();
      var w = r.width, h = r.height;
      if (!w || !h) { // stage not laid out yet — retry next frame
        requestAnimationFrame(buildLevel);
        return;
      }
      buildCorridor(w, h);
      render();
      var lvlEl = document.getElementById("steadyhand-lvl");
      if (lvlEl) lvlEl.textContent = level;
      setStatus("move into the green start to begin");
    }

    function setStatus(msg) {
      var st = document.getElementById("steadyhand-status");
      if (st) st.textContent = msg;
    }

    function fail() {
      if (locked) return;
      locked = true;
      armed = false;
      dot.classList.remove("steadyhand-armed");
      dot.style.display = "none";
      stage.classList.add("steadyhand-fail");
      setStatus("you touched a wall — back to the start");
      clearFailTimer();
      failTimer = setTimeout(function () {
        failTimer = null;
        stage.classList.remove("steadyhand-fail");
        // keep the same level; player retries the same corridor
        locked = false;
        armed = false;
        setStatus("move into the green start to begin");
      }, 700);
    }

    function win() {
      if (locked) return;
      locked = true;
      armed = false;
      dot.classList.remove("steadyhand-armed");
      var isBest = ctx.submitScore(level);
      var bestEl = document.getElementById("steadyhand-best");
      if (bestEl) bestEl.textContent = NERDBOX.getBest("steadyhand");
      setStatus("solved level " + level + (isBest ? " — new best!" : "") + " — get ready…");
      clearFailTimer();
      failTimer = setTimeout(function () {
        failTimer = null;
        level += 1;
        buildLevel();
      }, 850);
    }

    /* ---- mouse tracking ---- */
    function onMove(e) {
      var r = stage.getBoundingClientRect();
      var px = e.clientX - r.left;
      var py = e.clientY - r.top;

      // position the cursor dot whenever the pointer is over the stage
      var overStage = px >= 0 && px <= r.width && py >= 0 && py <= r.height;
      if (overStage && !locked) {
        dot.style.left = px + "px";
        dot.style.top = py + "px";
        dot.style.display = "block";
      } else if (!overStage) {
        dot.style.display = "none";
      }

      if (locked) return;

      if (!armed) {
        // arm only when the cursor enters the start pad
        if (overStage && inRect(px, py, startRect)) {
          armed = true;
          dot.classList.add("steadyhand-armed");
          setStatus("now trace to the red end — stay inside the path");
        }
        return;
      }

      // armed: reaching the end pad wins
      if (inRect(px, py, endRect)) { win(); return; }

      // armed: leaving every corridor segment = touched a wall = fail.
      // (the start/end pads sit on the corridor, so being on a pad still counts as inside.)
      if (!inCorridor(px, py) && !inRect(px, py, startRect) && !inRect(px, py, endRect)) {
        fail();
      }
    }

    stage.addEventListener("mousemove", onMove);
    listening = true;

    stage.appendChild(dot);
    buildLevel();

    /* ---- teardown: remove the listener + clear all timers ---- */
    return function () {
      if (listening) { stage.removeEventListener("mousemove", onMove); listening = false; }
      clearFailTimer();
    };
  }
});
