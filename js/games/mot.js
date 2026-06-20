/* Multi-Object Tracking — classic attention psychophysics. Three phases per level:
   IDENTIFY (K of N dots glow as targets) -> TRACK (all go neutral and drift/bounce
   via rAF, faster each level) -> SELECT (dots stop; click the K you tracked). All K
   correct -> next level (more dots, sometimes more targets, faster) and submitScore(K).
   Any wrong -> game over showing the last CLEARED K. Score = MAX tracked. */
NERDBOX.injectStyle("mot", `
.mot-wrap { width: 100%; max-width: 600px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 1rem; }
.mot-status { font-family: "JetBrains Mono", monospace; color: var(--sub); font-size: 1rem; min-height: 1.4em; display: flex; gap: 1.6rem; justify-content: center; align-items: baseline; flex-wrap: wrap; text-align: center; }
.mot-status b { color: var(--text); font-weight: 500; }
.mot-level { color: var(--accent); font-weight: 700; font-size: 1.25rem; min-width: 1.4em; display: inline-block; text-align: center; }
.mot-area { position: relative; width: min(560px, 100%); height: 360px; background: var(--bg-alt); border: 2px solid var(--sub-alt); border-radius: 14px; overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; }
.mot-dot { position: absolute; width: 26px; height: 26px; margin-left: -13px; margin-top: -13px; border-radius: 50%; background: var(--sub); pointer-events: none; will-change: left, top; box-shadow: 0 0 0 2px var(--bg-alt); }
.mot-area.mot-pickable .mot-dot { pointer-events: auto; cursor: pointer; }
.mot-dot.mot-target { background: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 28%, transparent); }
.mot-dot.mot-picked { background: var(--caret); box-shadow: 0 0 0 4px color-mix(in srgb, var(--caret) 30%, transparent); }
.mot-dot.mot-right { background: var(--accent); box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 35%, transparent); }
.mot-dot.mot-wrong { background: var(--error); box-shadow: 0 0 0 5px color-mix(in srgb, var(--error) 35%, transparent); }
.mot-dot.mot-was { box-shadow: 0 0 0 3px var(--accent); }
.mot-overlay-host { position: relative; width: min(560px, 100%); }
`);

NERDBOX.register({
  id: "mot",
  name: "Multi-Object Tracking",
  tagline: "keep your eyes on the marked dots",
  category: "attention",
  difficulty: "extreme",
  scoreMode: "max",
  formatScore: function (v) { return v + " tracked"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="9" r="2"/><circle cx="8" cy="17" r="2"/><path d="M16 17h6M19 14v6"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;
    var shuffle = ctx.util.shuffle;

    /* ---- config ---- */
    var START_DOTS = 8, START_TARGETS = 3;     // level-1 totals
    var IDENTIFY_MS = 2000, TRACK_MS = 6000;   // phase durations
    var R = 13;                                // dot radius (px)
    var BASE_SPEED = 0.10, SPEED_STEP = 0.012; // px/ms at lvl 1, + per level

    /* ---- state ---- */
    var running = false;      // rAF loop active (tracking phase)
    var rafId = null;         // current animation-frame handle
    var phaseTimer = null;    // setTimeout handle for phase transitions
    var lastTs = 0;           // previous frame timestamp
    var level = 1;            // current level (1-based)
    var lastCleared = 0;      // K of the highest cleared level (score floor)
    var dots = [];            // { x,y,vx,vy,node,isTarget }
    var picks = 0;            // selections made this SELECT phase
    var pickable = false;     // SELECT phase accepting clicks

    /* ---- layout ---- */
    var wrap = el("div", "mot-wrap");
    var status = el("div", "mot-status",
      '<span>level <span class="mot-level">1</span></span>' +
      '<span><b class="mot-msg">tap start</b></span>');
    var host = el("div", "mot-overlay-host");
    var area = el("div", "mot-area");
    var overlay = el("div", "g-overlay");
    host.appendChild(area);
    host.appendChild(overlay);

    wrap.appendChild(status);
    wrap.appendChild(host);
    root.appendChild(wrap);

    var levelEl = status.querySelector(".mot-level");
    var msgEl = status.querySelector(".mot-msg");

    function areaSize() {
      var r = area.getBoundingClientRect();
      return { w: r.width || 560, h: r.height || 360 }; // fall back to CSS size
    }

    function dotsFor(lv) { return START_DOTS + (lv - 1); }
    // +1 target every other level (levels 1-2 -> 3, 3-4 -> 4, ...)
    function targetsFor(lv) { return START_TARGETS + Math.floor((lv - 1) / 2); }
    function speedFor(lv) { return BASE_SPEED + (lv - 1) * SPEED_STEP; }

    function clearPhaseTimer() {
      if (phaseTimer !== null) { clearTimeout(phaseTimer); phaseTimer = null; }
    }
    // run fn after ms as the single tracked phase timer (auto-clears its own handle)
    function schedule(fn, ms) {
      clearPhaseTimer();
      phaseTimer = setTimeout(function () { phaseTimer = null; fn(); }, ms);
    }
    function stopLoop() {
      running = false;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }
    function clearArea() {
      for (var i = 0; i < dots.length; i++) {
        var n = dots[i].node;
        if (n && n.parentNode) n.parentNode.removeChild(n);
      }
      dots = [];
    }
    function drawDot(d) { d.node.style.left = d.x + "px"; d.node.style.top = d.y + "px"; }
    function setMsg(text) { msgEl.textContent = text; }

    // Build the dots for the current level, mark K as targets (spaced out), and
    // give each a random heading at the level's speed.
    function buildLevel() {
      clearArea();
      var s = areaSize();
      var total = dotsFor(level);
      var k = targetsFor(level);
      var speed = speedFor(level);

      var idx = [];
      for (var i = 0; i < total; i++) idx.push(i);
      var targetSet = {};
      var shuffled = shuffle(idx.slice());
      for (var t = 0; t < k && t < shuffled.length; t++) targetSet[shuffled[t]] = true;

      for (var j = 0; j < total; j++) {
        var node = el("div", "mot-dot");
        var pos = placeDot(s);
        var ang = Math.random() * Math.PI * 2;
        var d = {
          x: pos.x, y: pos.y,
          vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
          node: node, isTarget: !!targetSet[j]
        };
        if (d.isTarget) node.classList.add("mot-target");
        node.setAttribute("data-i", String(j));
        area.appendChild(node);
        drawDot(d);
        dots.push(d);
      }
    }

    // find a spot inside the area, avoiding overlap (bounded attempts; min gap 2.4R)
    function placeDot(s) {
      var pad = R + 2, min2 = (R * 2.4) * (R * 2.4), best = null;
      for (var attempt = 0; attempt < 30; attempt++) {
        var x = pad + Math.random() * (s.w - pad * 2);
        var y = pad + Math.random() * (s.h - pad * 2);
        var ok = true;
        for (var i = 0; i < dots.length; i++) {
          var dx = dots[i].x - x, dy = dots[i].y - y;
          if (dx * dx + dy * dy < min2) { ok = false; break; }
        }
        if (ok) return { x: x, y: y };
        if (!best) best = { x: x, y: y };
      }
      return best || { x: s.w / 2, y: s.h / 2 };
    }

    // ---- phase 1: identify (targets glow) ----
    function startLevel() {
      stopLoop();
      clearPhaseTimer();
      pickable = false;
      area.classList.remove("mot-pickable");
      picks = 0;
      levelEl.textContent = String(level);
      buildLevel();
      setMsg("watch the glowing dots");
      schedule(beginTrack, IDENTIFY_MS);
    }

    // ---- phase 2: track (all neutral, moving) ----
    function beginTrack() {
      for (var i = 0; i < dots.length; i++) dots[i].node.classList.remove("mot-target");
      setMsg("track them!");
      running = true;
      lastTs = performance.now();
      rafId = requestAnimationFrame(frame);
      schedule(beginSelect, TRACK_MS);
    }

    // advance one dot: move and bounce off the edges (reflect velocity).
    function step(d, dt, s) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      var minX = R, maxX = s.w - R, minY = R, maxY = s.h - R;
      if (d.x < minX) { d.x = minX; d.vx = Math.abs(d.vx); }
      else if (d.x > maxX) { d.x = maxX; d.vx = -Math.abs(d.vx); }
      if (d.y < minY) { d.y = minY; d.vy = Math.abs(d.vy); }
      else if (d.y > maxY) { d.y = maxY; d.vy = -Math.abs(d.vy); }
    }

    function frame(ts) {
      if (!running) return;
      var dt = ts - lastTs;
      lastTs = ts;
      if (dt > 64) dt = 64;       // guard against tab-refocus jumps
      if (dt < 0) dt = 0;
      var s = areaSize();
      for (var i = 0; i < dots.length; i++) {
        step(dots[i], dt, s);
        drawDot(dots[i]);
      }
      rafId = requestAnimationFrame(frame);
    }

    // ---- phase 3: select (stop, accept K clicks) ----
    function beginSelect() {
      stopLoop();
      var k = targetsFor(level);
      pickable = true;
      area.classList.add("mot-pickable");
      setMsg("now click the " + k + " you tracked");
    }

    // a dot clicked during SELECT (delegated on `area`)
    function onAreaClick(e) {
      if (!pickable) return;
      var node = e.target;
      while (node && node !== area && !node.classList.contains("mot-dot")) node = node.parentNode;
      if (!node || node === area || !node.classList.contains("mot-dot")) return;
      if (node.classList.contains("mot-picked")) return; // already chosen
      node.classList.add("mot-picked");
      picks++;
      if (picks >= targetsFor(level)) reveal();
    }

    function reveal() {
      pickable = false;
      area.classList.remove("mot-pickable");
      var allCorrect = true;
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        var picked = d.node.classList.contains("mot-picked");
        d.node.classList.remove("mot-picked");
        if (picked && d.isTarget) d.node.classList.add("mot-right");
        else if (picked && !d.isTarget) { d.node.classList.add("mot-wrong"); allCorrect = false; }
        else if (!picked && d.isTarget) { d.node.classList.add("mot-was"); allCorrect = false; }
      }

      if (allCorrect) {
        lastCleared = targetsFor(level);
        ctx.submitScore(lastCleared);
        setMsg("cleared! +1 level");
        schedule(function () { level++; startLevel(); }, 1100);
      } else {
        gameOver();
      }
    }

    // render an overlay card; wire its button to onClick
    function showOverlay(inner, onClick) {
      overlay.innerHTML = '<div class="g-result">' + inner +
        '<button class="g-btn" type="button" data-act="go">' +
        (onClick.label || "play again") + '</button></div>';
      overlay.classList.add("show");
      var btn = overlay.querySelector('[data-act="go"]');
      if (btn) btn.addEventListener("click", onClick);
    }
    function hideOverlay() { overlay.classList.remove("show"); overlay.innerHTML = ""; }

    function gameOver() {
      stopLoop();
      clearPhaseTimer();
      var best = ctx.submitScore(lastCleared);
      setMsg("missed one — run over");
      showOverlay(
        '<div class="g-big">' + lastCleared + ' tracked</div>' +
        '<div class="g-sub">that selection wasn\'t exact' +
        (best ? ' · new best!' : '') + ' — targets are ringed</div>', reset);
    }

    function reset() {
      stopLoop();
      clearPhaseTimer();
      hideOverlay();
      level = 1;
      lastCleared = 0;
      startLevel();
    }

    function begin() { hideOverlay(); startLevel(); }
    begin.label = "start";

    function showStart() {
      clearArea();
      setMsg("tap start");
      showOverlay(
        '<div class="g-sub">' + START_TARGETS + ' of ' + START_DOTS +
        ' dots glow — memorise them. they go neutral and drift, then stop. ' +
        'click the ones you tracked. all correct = next level (more dots, ' +
        'faster). one miss ends the run.</div>', begin);
    }

    area.addEventListener("click", onAreaClick);

    showStart();

    /* ---- teardown: stop rAF, clear phase timer, drop the click listener ---- */
    return function () {
      stopLoop();                  // sets running=false + cancelAnimationFrame
      clearPhaseTimer();           // clears the active setTimeout
      area.removeEventListener("click", onAreaClick);
    };
  }
});
