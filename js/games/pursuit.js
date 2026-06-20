/* Pursuit — keep your cursor on the moving dot.
   Motor tracking: a target dot wanders smoothly around a stage for 15s while
   you chase it with the mouse. Every animation frame we sample whether the
   cursor sits within the dot's radius; the dot glows green while you're on it.
   Score = round(100 * onTargetFrames / totalFrames) — higher is better. */
NERDBOX.injectStyle("pursuit", `
.pursuit-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.1rem;
  width: 100%;
  max-width: 620px;
  margin: 0 auto;
  position: relative;
}
.pursuit-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  font-family: "JetBrains Mono", monospace;
}
.pursuit-status .pursuit-time { color: var(--sub); letter-spacing: 0.04em; }
.pursuit-status .pursuit-time b { color: var(--text); font-weight: 700; }
.pursuit-ind {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.9rem;
  color: var(--sub);
  letter-spacing: 0.03em;
}
.pursuit-ind .pursuit-dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: var(--sub-alt);
  transition: background 0.08s ease, box-shadow 0.08s ease;
}
.pursuit-ind.pursuit-on { color: var(--go); }
.pursuit-ind.pursuit-on .pursuit-dot {
  background: var(--go);
  box-shadow: 0 0 8px var(--go);
}
.pursuit-stage {
  position: relative;
  width: 100%;
  min-height: 320px;
  height: min(60vh, 420px);
  border-radius: 18px;
  background: var(--bg-alt);
  border: 2px solid var(--sub-alt);
  overflow: hidden;
  cursor: crosshair;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.pursuit-target {
  position: absolute;
  width: 26px;
  height: 26px;
  margin-left: -13px;
  margin-top: -13px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent);
  pointer-events: none;
  will-change: left, top;
  transition: background 0.08s ease, box-shadow 0.08s ease, transform 0.08s ease;
}
.pursuit-target.pursuit-hot {
  background: var(--go);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--go) 30%, transparent);
  transform: scale(1.08);
}
.pursuit-hint {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.85rem;
  text-align: center;
  line-height: 1.5;
}
.pursuit-hint b { color: var(--go); font-weight: 700; }
.pursuit-meter {
  position: relative;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--sub-alt);
  overflow: hidden;
}
.pursuit-meter > span {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 0%;
  background: var(--go);
  transition: width 0.12s linear;
}
`);

NERDBOX.register({
  id: "pursuit",
  name: "Pursuit",
  tagline: "keep your cursor on the moving dot",
  category: "motor",
  scoreMode: "max",
  formatScore: function (v) { return v + "%"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="5"/><circle cx="11" cy="11" r="1" fill="currentColor"/><path d="M11 3v2M11 17v2M3 11h2M17 11h2"/><path d="M16 16l5 5"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;

    /* ---- config ---- */
    var DURATION = 15000;     // round length, ms
    var RADIUS = 26;          // hit radius, px (cursor within this of dot center = on target)
    var MAX_SPEED = 0.42;     // px per ms ceiling for the dot
    var STEER = 0.0009;       // random acceleration applied each ms

    /* ---- state ---- */
    var running = false;      // a round is in progress
    var rafId = null;         // current animation-frame handle
    var lastTs = 0;           // timestamp of previous frame
    var startTs = 0;          // round start timestamp
    var onFrames = 0;         // frames sampled with cursor on target
    var totalFrames = 0;      // frames sampled total

    // dot position (stage-local, center) + velocity (px/ms)
    var tx = 0, ty = 0, vx = 0, vy = 0;
    // cursor position (stage-local); known=false until the first mousemove
    var cx = 0, cy = 0, cursorKnown = false;

    /* ---- layout ---- */
    var wrap = el("div", "pursuit-wrap");
    var status = el("div", "pursuit-status");
    var timeEl = el("div", "pursuit-time");
    var ind = el("div", "pursuit-ind");
    var indDot = el("span", "pursuit-dot");
    var indLabel = el("span", null, "on target");
    ind.appendChild(indDot);
    ind.appendChild(indLabel);
    status.appendChild(timeEl);
    status.appendChild(ind);

    var stage = el("div", "pursuit-stage");
    var target = el("div", "pursuit-target");
    stage.appendChild(target);

    var meter = el("div", "pursuit-meter");
    var meterFill = el("span", null, "");
    meter.appendChild(meterFill);

    var hint = el("div", "pursuit-hint",
      'keep your cursor on the dot — it glows <b>green</b> when you’re on it');
    var overlay = el("div", "g-overlay");

    wrap.appendChild(status);
    wrap.appendChild(stage);
    wrap.appendChild(meter);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    function stageSize() {
      var r = stage.getBoundingClientRect();
      return { w: r.width, h: r.height, left: r.left, top: r.top };
    }

    function setIndicator(on) {
      if (on) ind.classList.add("pursuit-on");
      else ind.classList.remove("pursuit-on");
      target.classList.toggle("pursuit-hot", on);
    }

    function drawDot() {
      target.style.left = tx + "px";
      target.style.top = ty + "px";
    }

    // Track the cursor in stage-local coordinates.
    function onMove(e) {
      var s = stageSize();
      cx = e.clientX - s.left;
      cy = e.clientY - s.top;
      cursorKnown = true;
    }

    // Advance the dot: drift its velocity with small random steering, clamp to
    // a max speed, and bounce off the stage edges. dt is the frame delta in ms.
    function step(dt) {
      var s = stageSize();
      var minX = RADIUS, maxX = s.w - RADIUS;
      var minY = RADIUS, maxY = s.h - RADIUS;

      // random steering (acceleration), scaled by elapsed time
      vx += (Math.random() * 2 - 1) * STEER * dt;
      vy += (Math.random() * 2 - 1) * STEER * dt;

      // clamp speed to MAX_SPEED
      var sp = Math.sqrt(vx * vx + vy * vy);
      if (sp > MAX_SPEED) { vx = vx / sp * MAX_SPEED; vy = vy / sp * MAX_SPEED; }

      tx += vx * dt;
      ty += vy * dt;

      // bounce off edges (reflect velocity, keep dot inside)
      if (tx < minX) { tx = minX; vx = Math.abs(vx); }
      else if (tx > maxX) { tx = maxX; vx = -Math.abs(vx); }
      if (ty < minY) { ty = minY; vy = Math.abs(vy); }
      else if (ty > maxY) { ty = maxY; vy = -Math.abs(vy); }
    }

    function frame(ts) {
      if (!running) return;
      var dt = ts - lastTs;
      lastTs = ts;
      // guard against huge first/idle deltas (e.g. tab refocus)
      if (dt > 64) dt = 64;
      if (dt < 0) dt = 0;

      step(dt);
      drawDot();

      // sample on-target for this frame
      var on = false;
      if (cursorKnown) {
        var dx = cx - tx, dy = cy - ty;
        on = (dx * dx + dy * dy) <= (RADIUS * RADIUS);
      }
      totalFrames++;
      if (on) onFrames++;
      setIndicator(on);

      // live readouts
      var elapsed = ts - startTs;
      var remain = Math.max(0, DURATION - elapsed);
      timeEl.innerHTML = '<b>' + (remain / 1000).toFixed(1) + 's</b> left';
      var pct = totalFrames ? Math.round(100 * onFrames / totalFrames) : 0;
      meterFill.style.width = pct + "%";

      if (elapsed >= DURATION) { finish(); return; }
      rafId = requestAnimationFrame(frame);
    }

    function start() {
      stopLoop();
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      running = true;
      onFrames = 0;
      totalFrames = 0;

      var s = stageSize();
      // start the dot near the center with a random initial heading
      tx = s.w / 2;
      ty = s.h / 2;
      var ang = Math.random() * Math.PI * 2;
      vx = Math.cos(ang) * MAX_SPEED * 0.7;
      vy = Math.sin(ang) * MAX_SPEED * 0.7;
      drawDot();
      setIndicator(false);
      meterFill.style.width = "0%";
      timeEl.innerHTML = '<b>' + (DURATION / 1000).toFixed(1) + 's</b> left';

      startTs = performance.now();
      lastTs = startTs;
      rafId = requestAnimationFrame(frame);
    }

    function finish() {
      running = false;
      stopLoop();
      setIndicator(false);

      var pct = totalFrames ? Math.round(100 * onFrames / totalFrames) : 0;
      meterFill.style.width = pct + "%";
      timeEl.innerHTML = '<b>0.0s</b> left';
      var best = ctx.submitScore(pct);

      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + pct + '%</div>' +
          '<div class="g-sub">' +
            (best ? "new best! · " : "") + "time on target" +
          '</div>' +
          '<button class="g-btn">play again</button>' +
        '</div>'
      );
    }

    function stopLoop() {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }

    function showOverlay(html) {
      overlay.innerHTML = html;
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", start);
      overlay.classList.add("show");
    }

    // listen on the window so quick cursor moves outside the stage still update
    window.addEventListener("mousemove", onMove);

    /* ---- initial idle state ---- */
    timeEl.innerHTML = '<b>' + (DURATION / 1000).toFixed(1) + 's</b> left';
    drawDot();
    showOverlay(
      '<div class="g-result">' +
        '<div class="g-sub" style="margin-bottom:.4rem">15 seconds · keep your cursor on the dot</div>' +
        '<button class="g-btn">start</button>' +
      '</div>'
    );

    /* ---- teardown: stop the loop, drop the listener, halt the round ---- */
    return function () {
      running = false;
      stopLoop();
      window.removeEventListener("mousemove", onMove);
    };
  }
});
