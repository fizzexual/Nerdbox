/* Polyrhythm Tap — motor / cross-rhythm coordination (extreme).
   Two stacked lanes sweep under one playhead. The LEFT lane (key F) has N
   beats per bar, the RIGHT lane (key J) has M beats per bar — a true
   polyrhythm (e.g. 2 vs 3). Tap each lane's key as the playhead crosses that
   lane's markers. A tap is judged against the nearest beat in its lane:
   within 18% of that lane's inter-beat interval = HIT, else MISS; a beat that
   sweeps past untapped is also a MISS. Clear a level (>=75% accuracy over a
   few bars) to advance to a tighter ratio + faster tempo. Score = highest
   level reached. Visual only — no audio. */
NERDBOX.injectStyle("polyrhythm", `
  .poly-wrap { display: flex; flex-direction: column; align-items: center; gap: 1rem; width: 100%; max-width: 680px; margin: 0 auto; position: relative; }
  .poly-lanes { display: flex; flex-direction: column; gap: 0.7rem; width: 100%; position: relative; }
  .poly-lane {
    position: relative;
    width: 100%;
    height: 96px;
    background: var(--bg-alt);
    border: 2px solid var(--sub-alt);
    border-radius: 14px;
    overflow: hidden;
  }
  .poly-lane-tag {
    position: absolute;
    left: 10px; top: 8px;
    font-family: "JetBrains Mono", monospace;
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    color: var(--sub);
    z-index: 3;
    pointer-events: none;
  }
  .poly-lane-tag b { color: var(--accent); font-weight: 700; }
  .poly-beat {
    position: absolute;
    top: 50%;
    width: 26px; height: 26px;
    margin-left: -13px; margin-top: -13px;
    border-radius: 50%;
    background: var(--sub-alt);
    border: 2px solid var(--sub);
    transition: background 0.08s ease, border-color 0.08s ease, transform 0.08s ease;
    pointer-events: none;
    z-index: 2;
  }
  .poly-beat.poly-hit  { background: var(--go);    border-color: var(--go);    transform: scale(1.32); }
  .poly-beat.poly-miss { background: var(--error); border-color: var(--error); transform: scale(1.12); }
  .poly-head {
    position: absolute;
    top: 0; bottom: 0;
    width: 3px;
    margin-left: -1.5px;
    background: var(--accent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 60%, transparent);
    pointer-events: none;
    z-index: 4;
  }
  .poly-pads { display: flex; gap: 0.7rem; width: 100%; }
  .poly-pad {
    flex: 1 1 0;
    min-height: 72px;
    border: 2px solid var(--sub-alt);
    border-radius: 12px;
    background: var(--bg-alt);
    color: var(--text);
    font-family: "JetBrains Mono", monospace;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.15rem;
    transition: border-color 0.1s ease, background 0.06s ease, transform 0.04s ease;
  }
  .poly-pad:hover { border-color: var(--accent); }
  .poly-pad .poly-key { font-size: 1.5rem; font-weight: 700; letter-spacing: 0.04em; }
  .poly-pad .poly-side { font-size: 0.72rem; color: var(--sub); letter-spacing: 0.08em; text-transform: uppercase; }
  .poly-pad.poly-flash { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 18%, var(--bg-alt)); transform: scale(0.985); }
  .poly-hint { font-family: "JetBrains Mono", monospace; color: var(--sub); font-size: 0.85rem; text-align: center; line-height: 1.5; }
  .poly-hint b { color: var(--accent); font-weight: 700; }
  .poly-count {
    position: absolute;
    inset: 0;
    display: none;
    align-items: center; justify-content: center;
    font-family: "JetBrains Mono", monospace;
    font-size: 3.4rem; font-weight: 700;
    color: var(--accent);
    background: color-mix(in srgb, var(--bg) 55%, transparent);
    border-radius: 14px;
    z-index: 5;
    pointer-events: none;
  }
  .poly-count.show { display: flex; }
`);

NERDBOX.register({
  id: "polyrhythm",
  name: "Polyrhythm Tap",
  tagline: "two hands, two rhythms at once",
  category: "motor",
  difficulty: "extreme",
  scoreMode: "max",
  formatScore: function (v) { return "lvl " + v; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9c2 0 2-4 4-4s2 4 4 4 2-4 4-4 2 4 4 4 2-4 4-4"/><path d="M2 17c1.5 0 1.5-6 3-6s1.5 6 3 6 1.5-6 3-6 1.5 6 3 6 1.5-6 3-6 1.5 6 3 6"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;

    /* ---- level table: [leftBeats, rightBeats, barMs] ---- */
    var LEVELS = [
      [2, 3, 2400],
      [3, 4, 2200],
      [3, 5, 2050],
      [4, 5, 1900],
      [5, 7, 1750],
      [5, 8, 1600],
      [7, 9, 1480]
    ];
    var SCORE_BARS = 4;       // scored bars per level
    var TOL_FRAC = 0.18;      // hit window = 18% of a lane's inter-beat interval
    var PASS = 0.75;          // accuracy needed to clear a level

    /* ---- mutable state ---- */
    var level = 1;            // 1-based; clamps to last LEVELS entry beyond table
    var t0 = 0;               // performance.now() at the start of the current bar timeline
    var barMs = LEVELS[0][2];
    var phase = "ready";      // "ready" | "countin" | "play" | "over"
    var barsLeft = 0;         // scored bars remaining (incl. current)
    var lastProgress = 0;     // progress value from previous frame (for wrap detection)
    var hits = 0, total = 0;  // tallies across both lanes for the level

    var rafId = null;
    var running = false;      // gate for the rAF loop
    var timers = [];          // every pending setTimeout (pad flash + count-in pulse)

    // lanes[side] = { beats:int, nodes:[el], state:[0|1|2], els }
    // state per beat: 0 pending, 1 hit, 2 missed (resolved)
    var lanes = { L: null, R: null };

    /* ---- layout ---- */
    var wrap = el("div", "poly-wrap");
    var status = el("div", "g-status");
    var lanesBox = el("div", "poly-lanes");

    var laneL = el("div", "poly-lane");
    var tagL = el("div", "poly-lane-tag", 'LEFT &middot; <b>F</b>');
    laneL.appendChild(tagL);

    var laneR = el("div", "poly-lane");
    var tagR = el("div", "poly-lane-tag", 'RIGHT &middot; <b>J</b>');
    laneR.appendChild(tagR);

    var headL = el("div", "poly-head");
    var headR = el("div", "poly-head");
    laneL.appendChild(headL);
    laneR.appendChild(headR);

    var countL = el("div", "poly-count");
    var countR = el("div", "poly-count");
    laneL.appendChild(countL);
    laneR.appendChild(countR);

    lanesBox.appendChild(laneL);
    lanesBox.appendChild(laneR);

    var pads = el("div", "poly-pads");
    var padL = el("button", "poly-pad");
    padL.innerHTML = '<span class="poly-key">F</span><span class="poly-side">left hand</span>';
    var padR = el("button", "poly-pad");
    padR.innerHTML = '<span class="poly-key">J</span><span class="poly-side">right hand</span>';
    pads.appendChild(padL);
    pads.appendChild(padR);

    var hint = el("div", "poly-hint",
      'tap <b>F</b> for the left lane and <b>J</b> for the right — each lane has its own beat count');
    var overlay = el("div", "g-overlay");

    wrap.appendChild(status);
    wrap.appendChild(lanesBox);
    wrap.appendChild(pads);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    /* ---- helpers ---- */
    function cfg() {
      var idx = level - 1;
      if (idx >= LEVELS.length) idx = LEVELS.length - 1;
      return LEVELS[idx];
    }

    function clearTimers() {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers = [];
    }
    function stopLoop() {
      running = false;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }

    function setStatus(extra) {
      var c = cfg();
      var s = "lvl " + level + " &middot; " + c[0] + " vs " + c[1] +
              " &middot; hits " + hits + "/" + total;
      if (extra) s += " &middot; " + extra;
      status.innerHTML = s;
    }

    // build a lane's beat markers; positions evenly spaced, i/beats across the bar.
    function buildLane(side, laneEl, beats) {
      // remove old beat nodes (keep tag/head/count)
      var old = laneEl.querySelectorAll(".poly-beat");
      for (var k = 0; k < old.length; k++) old[k].remove();
      var nodes = [], state = [];
      for (var i = 0; i < beats; i++) {
        var b = el("div", "poly-beat");
        var pct = (i / beats) * 100;
        // nudge off the very edges so the marker is fully visible
        b.style.left = "calc(" + pct + "% + " + (13 + (i === 0 ? 4 : 0)) + "px)";
        laneEl.appendChild(b);
        nodes.push(b);
        state.push(0);
      }
      lanes[side] = { beats: beats, nodes: nodes, state: state };
    }

    function resetBeats(side) {
      var L = lanes[side];
      for (var i = 0; i < L.nodes.length; i++) {
        L.state[i] = 0;
        L.nodes[i].className = "poly-beat";
      }
    }

    function flashBeat(side, idx, ok) {
      var L = lanes[side];
      if (!L || idx < 0 || idx >= L.nodes.length) return;
      L.nodes[idx].className = "poly-beat " + (ok ? "poly-hit" : "poly-miss");
    }

    function flashPad(side) {
      var pad = side === "L" ? padL : padR;
      pad.classList.remove("poly-flash");
      void pad.offsetWidth; // restart transition
      pad.classList.add("poly-flash");
      var t = setTimeout(function () { pad.classList.remove("poly-flash"); }, 110);
      timers.push(t);
    }

    /* ---- timing ---- */
    // progress in [0,1) of the current bar timeline.
    function progressAt(now) {
      var p = ((now - t0) % barMs) / barMs;
      if (p < 0) p += 1;
      return p;
    }

    // judge a tap for a lane at time `now`. Find nearest beat (handling the
    // wrap across the bar boundary) and compare against the tolerance window.
    function judgeTap(side) {
      if (phase !== "play") return;
      var L = lanes[side];
      if (!L) return;
      var beats = L.beats;
      var now = performance.now();
      var p = progressAt(now);               // 0..1 along the bar
      var ibi = 1 / beats;                    // inter-beat interval in progress units
      // nearest beat index by circular distance
      var raw = p / ibi;                      // fractional beat position
      var idx = Math.round(raw) % beats;
      if (idx < 0) idx += beats;
      // circular distance in progress units
      var d = Math.abs(p - idx * ibi);
      if (d > 0.5) d = 1 - d;                 // wrap-around shortest distance
      var tol = TOL_FRAC * ibi;

      total++;
      if (d <= tol && L.state[idx] === 0) {
        L.state[idx] = 1;
        hits++;
        flashBeat(side, idx, true);
      } else {
        // off-window tap, or that beat was already resolved → a miss
        flashBeat(side, idx, false);
      }
      setStatus();
    }

    // as the playhead sweeps, mark any beat it has fully passed (with a small
    // grace = tolerance) that is still pending as a MISS.
    function resolvePassed(side, p) {
      var L = lanes[side];
      if (!L) return;
      var beats = L.beats;
      var ibi = 1 / beats;
      var tol = TOL_FRAC * ibi;
      for (var i = 0; i < beats; i++) {
        if (L.state[i] !== 0) continue;
        var beatPos = i * ibi;
        // resolve once the head is tol past the beat (and before wrap brings it back)
        if (p > beatPos + tol) {
          L.state[i] = 2;
          total++;           // a required beat swept past untapped = miss
          flashBeat(side, i, false);
        }
      }
    }

    /* ---- main loop ---- */
    function frame() {
      if (!running) return;
      var now = performance.now();
      var p = progressAt(now);
      var xL = p * 100, xR = p * 100;
      headL.style.left = xL + "%";
      headR.style.left = xR + "%";

      // bar boundary crossed (progress wrapped from ~1 back to ~0)
      if (p < lastProgress) {
        onBarBoundary();
      }
      lastProgress = p;

      if (phase === "play") {
        resolvePassed("L", p);
        resolvePassed("R", p);
        setStatus();
      }

      // a boundary handler may have ended the level + stopped the loop; only
      // reschedule if we're still running, so no orphan frame is queued.
      if (running) rafId = requestAnimationFrame(frame);
    }

    function onBarBoundary() {
      if (phase === "countin") {
        // count-in bar finished → start scoring
        phase = "play";
        barsLeft = SCORE_BARS;
        countL.classList.remove("show");
        countR.classList.remove("show");
        resetBeats("L");
        resetBeats("R");
        setStatus("go!");
        return;
      }
      if (phase === "play") {
        // any beats still pending at the wrap are misses for the bar just ended
        resolveRemaining("L");
        resolveRemaining("R");
        barsLeft -= 1;
        if (barsLeft <= 0) { endLevel(); return; }
        resetBeats("L");
        resetBeats("R");
        setStatus();
      }
    }

    function resolveRemaining(side) {
      var L = lanes[side];
      if (!L) return;
      for (var i = 0; i < L.state.length; i++) {
        if (L.state[i] === 0) {
          L.state[i] = 2;
          total++;
          // no hit increment; mark visually
          L.nodes[i].className = "poly-beat poly-miss";
        }
      }
    }

    /* ---- level flow ---- */
    function startLevel() {
      stopLoop();
      clearTimers();
      overlay.classList.remove("show");
      overlay.innerHTML = "";

      var c = cfg();
      barMs = c[2];
      buildLane("L", laneL, c[0]);
      buildLane("R", laneR, c[1]);
      resetBeats("L");
      resetBeats("R");
      hits = 0; total = 0;

      phase = "countin";
      barsLeft = 0;
      t0 = performance.now();
      lastProgress = 0;
      setStatus("get ready…");

      // one unscored count-in bar: "ready" → "set", cleared at the bar boundary
      running = true;
      rafId = requestAnimationFrame(frame);
      countInPulse();
    }

    // brief count-in display over the lanes; cleared at the bar boundary in
    // onBarBoundary(). Bounded + self-clearing via a single setTimeout.
    function countInPulse() {
      countL.textContent = "ready";
      countL.classList.add("show");
      countR.classList.add("show");
      countR.textContent = "";
      var half = Math.max(200, barMs * 0.5);
      var t = setTimeout(function () {
        if (phase === "countin") { countL.textContent = "set"; }
      }, half);
      timers.push(t);
    }

    function endLevel() {
      var acc = total > 0 ? hits / total : 0;
      var pct = Math.round(acc * 100);
      if (acc >= PASS) {
        // cleared → record and advance
        ctx.submitScore(level);
        phase = "ready";
        stopLoop();
        clearTimers();
        showCleared(pct);
      } else {
        // failed → game over, score = highest level reached = level - 1
        phase = "over";
        stopLoop();
        clearTimers();
        var reached = level - 1;
        if (reached < 0) reached = 0;
        ctx.submitScore(reached);
        showGameOver(pct, reached);
      }
    }

    function showCleared(pct) {
      var c = cfg();
      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-big">lvl ' + level + '</div>' +
          '<div class="g-sub">cleared &middot; ' + pct + '% accuracy (' + c[0] + ' vs ' + c[1] + ')</div>' +
          '<button class="g-btn">next level</button>' +
        '</div>';
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", function () {
        level += 1;
        startLevel();
      });
      overlay.classList.add("show");
    }

    function showGameOver(pct, reached) {
      var best = NERDBOX.getBest("polyrhythm");
      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-big">lvl ' + reached + '</div>' +
          '<div class="g-sub">highest level reached &middot; needed 75%, got ' + pct + '%' +
            (best != null ? ' &middot; best lvl ' + best : '') + '</div>' +
          '<button class="g-btn">play again</button>' +
        '</div>';
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", function () {
        level = 1;
        startLevel();
      });
      overlay.classList.add("show");
    }

    function showIntro() {
      phase = "ready";
      var c = cfg();
      setStatus("press start");
      overlay.innerHTML =
        '<div class="g-result">' +
          '<div class="g-sub" style="margin-bottom:.4rem">tap two cross-rhythms at once &middot; F = left, J = right<br>level 1 is ' + c[0] + ' vs ' + c[1] + ' &middot; clear 75% to advance</div>' +
          '<button class="g-btn">start</button>' +
        '</div>';
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", function () {
        level = 1;
        startLevel();
      });
      overlay.classList.add("show");
    }

    /* ---- input ---- */
    function onKey(e) {
      var k = e.key;
      if (k === "f" || k === "F") { e.preventDefault(); flashPad("L"); judgeTap("L"); }
      else if (k === "j" || k === "J") { e.preventDefault(); flashPad("R"); judgeTap("R"); }
    }
    function onPadL(e) { e.preventDefault(); flashPad("L"); judgeTap("L"); }
    function onPadR(e) { e.preventDefault(); flashPad("R"); judgeTap("R"); }

    document.addEventListener("keydown", onKey);
    padL.addEventListener("pointerdown", onPadL);
    padR.addEventListener("pointerdown", onPadR);

    // build initial lanes so the stage isn't empty behind the intro overlay
    buildLane("L", laneL, LEVELS[0][0]);
    buildLane("R", laneR, LEVELS[0][1]);
    showIntro();

    /* ---- teardown: stop the rAF sweep, clear all timers, drop listeners ---- */
    return function () {
      stopLoop();                 // running = false + cancelAnimationFrame
      clearTimers();              // clear pad-flash + count-in setTimeouts
      document.removeEventListener("keydown", onKey);
      padL.removeEventListener("pointerdown", onPadL);
      padR.removeEventListener("pointerdown", onPadR);
    };
  }
});
