/* Intercept — prediction / anticipation.
   A dot enters from a random edge and slides in a straight line at constant
   velocity. Partway across it VANISHES but keeps moving invisibly. Click the
   spot where the dot actually IS at the moment you click. We know the dot's
   start point, velocity, and the click time, so we compute its TRUE position
   exactly: pos(t) = P0 + v*t. Land inside the tolerance radius and the streak
   grows + the dot speeds up; miss (or let it cross the stage) and it's over.
   scoreMode "max" = longest streak. One injectStyle + one register, vanilla JS. */
NERDBOX.injectStyle("intercept", `
.intercept-wrap { position: relative; width: 100%; max-width: 560px; margin: 0 auto; }
.intercept-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 2;
  background: var(--bg-alt);
  border-radius: 16px;
  overflow: hidden;
  cursor: crosshair;
  touch-action: none;
}
.intercept-dot {
  position: absolute;
  width: 24px; height: 24px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 55%, transparent);
  transform: translate(-50%, -50%);
  pointer-events: none;
  opacity: 1;
  transition: opacity 0.12s linear;
}
.intercept-dot.hidden { opacity: 0; }
.intercept-stage .intercept-hint {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--sub); font-family: "JetBrains Mono", monospace; font-size: 1rem;
  pointer-events: none; text-align: center; padding: 0 1rem;
}
/* the player's click marker + the revealed true position */
.intercept-mark {
  position: absolute;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.intercept-guess {
  width: 14px; height: 14px;
  background: transparent;
  border: 2px solid var(--text);
}
.intercept-true {
  border-radius: 50%;
  border: 2px dashed var(--sub);
  background: color-mix(in srgb, var(--accent) 22%, transparent);
}
.intercept-true.hit { border-color: var(--go); }
.intercept-true.miss { border-color: var(--error); }
.intercept-line {
  position: absolute;
  height: 2px;
  transform-origin: 0 50%;
  background: var(--sub-alt);
  pointer-events: none;
  opacity: 0.7;
}
.intercept-msg { color: var(--go); }
.intercept-msg.miss { color: var(--error); }
.intercept-result-line { color: var(--sub); font-size: 0.95rem; }
.intercept-result-line b { color: var(--text); font-family: "JetBrains Mono", monospace; }
`);

NERDBOX.register({
  id: "intercept",
  name: "Intercept",
  tagline: "click where it WILL be",
  category: "motor",
  scoreMode: "max",
  formatScore: function (v) { return v + " streak"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6"/><circle cx="11" cy="9" r="2"/><path d="M14 6l7-3-3 7"/><circle cx="18" cy="18" r="3"/><path d="M18 16.5v3M16.5 18h3"/></svg>',
  mount: function (root, ctx) {
    var BASE_SPEED = 0.16;   // px per ms on round 1 (scaled by stage width below)
    var SPEED_STEP = 0.012;  // speed added per streak
    var SPEED_CAP = 0.55;    // never faster than this (px/ms at reference width)
    var REF_W = 520;         // speed is defined at this stage width, scaled to real width
    var TOL = 26;            // hit tolerance radius in px (a bit forgiving)
    var VANISH_MIN = 0.30;   // dot vanishes somewhere in this fraction-of-travel window
    var VANISH_MAX = 0.55;

    var streak = 0;
    var phase = "idle";      // idle | run | between | over
    var rafId = null;        // the single in-flight animation frame
    var timers = [];         // every setTimeout id — all cleared on teardown

    // motion record — everything needed to compute the true position at any time
    var startT = 0;          // performance.now() when the dot started moving
    var travelMs = 0;        // ms for the dot to cross the full path
    var p0x = 0, p0y = 0;    // start point
    var vx = 0, vy = 0;      // velocity (px/ms)
    var vanishMs = 0;        // elapsed time at which the dot turns invisible
    var vanished = false;    // has the dot vanished yet this round?

    // ---- timer helpers: track every id so teardown can clear them all ----
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
    function stopRaf() {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }

    function speedFor(s) { return Math.min(BASE_SPEED + s * SPEED_STEP, SPEED_CAP); }

    // true position at elapsed time t (clamped to the travel window)
    function posAt(t) {
      if (t < 0) t = 0;
      if (t > travelMs) t = travelMs;
      return { x: p0x + vx * t, y: p0y + vy * t };
    }

    // ---- DOM ----
    var status = ctx.util.el("div", "g-status");
    var wrap = ctx.util.el("div", "intercept-wrap");
    var stage = ctx.util.el("div", "intercept-stage");
    var hint = ctx.util.el("div", "intercept-hint");
    var dot = ctx.util.el("div", "intercept-dot hidden");
    var overlay = ctx.util.el("div", "g-overlay");

    stage.appendChild(hint);
    stage.appendChild(dot);
    wrap.appendChild(stage);
    wrap.appendChild(overlay);
    root.appendChild(status);
    root.appendChild(wrap);

    function setStatus(msg, miss) {
      var s = '<span>streak&nbsp;<b style="color:var(--text);font-weight:500">' + streak + "</b></span>";
      if (msg) s += '<span class="intercept-msg' + (miss ? " miss" : "") + '">' + msg + "</span>";
      else if (phase === "run") s += "<span>" + (vanished ? "click where it is now" : "watch it…") + "</span>";
      status.innerHTML = s;
    }

    // remove any markers / connecting line from a previous round
    function clearMarks() {
      var olds = stage.querySelectorAll(".intercept-mark, .intercept-line");
      for (var i = 0; i < olds.length; i++) olds[i].remove();
    }

    // place dot at a pixel position inside the stage
    function placeDot(x, y) {
      dot.style.left = x + "px";
      dot.style.top = y + "px";
    }

    // pick a random straight path: start on one edge, head across to a point
    // on a different edge so the line genuinely crosses the stage.
    function makePath(w, h) {
      var pad = 14; // keep endpoints a little inside the rounded corners
      var edge = ctx.util.rand(4); // 0 top, 1 right, 2 bottom, 3 left
      var sx, sy, ex, ey, exitEdge;
      function ptOnEdge(e) {
        if (e === 0) return { x: pad + Math.random() * (w - 2 * pad), y: pad };
        if (e === 1) return { x: w - pad, y: pad + Math.random() * (h - 2 * pad) };
        if (e === 2) return { x: pad + Math.random() * (w - 2 * pad), y: h - pad };
        return { x: pad, y: pad + Math.random() * (h - 2 * pad) };
      }
      var s = ptOnEdge(edge);
      sx = s.x; sy = s.y;
      // exit on any edge except the one we started on
      do { exitEdge = ctx.util.rand(4); } while (exitEdge === edge);
      var e2 = ptOnEdge(exitEdge);
      ex = e2.x; ey = e2.y;
      return { sx: sx, sy: sy, ex: ex, ey: ey };
    }

    function startRound() {
      clearTimers();
      stopRaf();
      clearMarks();
      phase = "run";
      vanished = false;
      hint.textContent = "";

      var r = stage.getBoundingClientRect();
      var w = r.width, h = r.height;
      var path = makePath(w, h);
      p0x = path.sx; p0y = path.sy;

      var dx = path.ex - path.sx, dy = path.ey - path.sy;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var speed = speedFor(streak) * (w / REF_W); // px/ms, scaled to real width
      travelMs = dist / speed;
      vx = dx / travelMs;
      vy = dy / travelMs;
      vanishMs = travelMs * (VANISH_MIN + Math.random() * (VANISH_MAX - VANISH_MIN));

      placeDot(p0x, p0y);
      dot.classList.remove("hidden"); // visible while it approaches the vanish point
      setStatus();

      startT = performance.now();
      tick();
    }

    function tick() {
      if (phase !== "run") return;
      var t = performance.now() - startT;

      if (!vanished && t >= vanishMs) {
        vanished = true;
        dot.classList.add("hidden");
        setStatus();
      }

      if (t >= travelMs) {
        // dot reached the far edge without being intercepted -> miss
        var endP = posAt(travelMs);
        gameOver(null, endP, "it left the stage");
        return;
      }

      // keep the visible dot tracking the path until it vanishes
      if (!vanished) {
        var p = posAt(t);
        placeDot(p.x, p.y);
      }
      rafId = requestAnimationFrame(tick);
    }

    // draw a dashed line between the player's guess and the true spot
    function drawLink(gx, gy, tx, ty) {
      var ddx = tx - gx, ddy = ty - gy;
      var len = Math.sqrt(ddx * ddx + ddy * ddy);
      var line = ctx.util.el("div", "intercept-line");
      line.style.left = gx + "px";
      line.style.top = gy + "px";
      line.style.width = len + "px";
      line.style.transform = "rotate(" + Math.atan2(ddy, ddx) + "rad)";
      stage.appendChild(line);
    }

    function showMarks(gx, gy, truePos, hit) {
      // guess marker
      var g = ctx.util.el("div", "intercept-mark intercept-guess");
      g.style.left = gx + "px"; g.style.top = gy + "px";
      stage.appendChild(g);
      // true-position marker, sized to the tolerance circle so the gap is legible
      var tm = ctx.util.el("div", "intercept-mark intercept-true " + (hit ? "hit" : "miss"));
      tm.style.left = truePos.x + "px"; tm.style.top = truePos.y + "px";
      tm.style.width = (TOL * 2) + "px"; tm.style.height = (TOL * 2) + "px";
      stage.appendChild(tm);
      drawLink(gx, gy, truePos.x, truePos.y);
    }

    function onStageClick(e) {
      if (phase !== "run") return;
      // only count the click once the dot has vanished — clicking early does nothing
      if (!vanished) return;

      var clickT = performance.now() - startT;
      var truePos = posAt(clickT);

      stopRaf();
      var r = stage.getBoundingClientRect();
      var gx = e.clientX - r.left;
      var gy = e.clientY - r.top;
      var dist = Math.sqrt((gx - truePos.x) * (gx - truePos.x) + (gy - truePos.y) * (gy - truePos.y));

      phase = "between";
      // reveal the dot exactly where it truly was
      placeDot(truePos.x, truePos.y);
      var hit = dist <= TOL;
      dot.classList.toggle("hidden", false);
      showMarks(gx, gy, truePos, hit);

      if (hit) {
        streak++;
        ctx.submitScore(streak); // max -> longest streak
        setStatus("intercepted! off by " + Math.round(dist) + "px");
        after(900, function () { if (phase === "between") startRound(); });
      } else {
        dot.classList.add("hidden");
        gameOver(Math.round(dist), truePos, "off by " + Math.round(dist) + "px");
      }
    }

    function gameOver(dist, truePos, reason) {
      phase = "over";
      stopRaf();
      clearTimers();
      dot.classList.add("hidden");
      setStatus(reason, true);
      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-big">' + streak + "</div>" +
          '<div class="g-sub">best streak</div>' +
          '<div class="intercept-result-line">' +
            (dist === null ? "you didn’t click in time" : "your click was <b>" + dist + "px</b> away") +
          "</div>" +
          '<button class="g-btn">play again</button>' +
        "</div>";
      overlay.querySelector("button").addEventListener("click", startGame);
      overlay.classList.add("show");
    }

    function startGame() {
      clearTimers();
      stopRaf();
      clearMarks();
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      streak = 0;
      startRound();
    }

    function showStart() {
      phase = "idle";
      stopRaf();
      clearMarks();
      dot.classList.add("hidden");
      hint.textContent = "a dot crosses, then vanishes — click where it kept going";
      setStatus();
      overlay.innerHTML = '<button class="g-btn">start</button>';
      overlay.querySelector("button").addEventListener("click", startGame);
      overlay.classList.add("show");
    }

    // ---- wiring ----
    stage.addEventListener("click", onStageClick);

    showStart();

    return function () {
      stopRaf();
      clearTimers();
      stage.removeEventListener("click", onStageClick);
    };
  }
});
