/* Choice Reaction — choice reaction time across a 12-trial round.
   Four pads sit in a cross (top / bottom / left / right). Each trial, after a
   short random gap (500–1500ms), ONE pad lights up; respond as fast as you can
   with the MATCHING input — either the arrow key (Up/Down/Left/Right) or a click
   on the lit pad. Reaction time is recorded for CORRECT responses; a WRONG
   response (wrong pad / wrong arrow) costs a fixed 1000ms penalty for that trial.
   After 12 trials the AVERAGE ms is the score (scoreMode "min" → lower is better).

   Cleanup: there is exactly ONE timer at a time (`gapTimer`, the random pre-cue
   gap) and ONE document keydown listener. A `token` is bumped on every trial /
   start / finish / teardown, so any in-flight gap callback that fires late sees a
   stale token and bails. teardown clears the gap timer and removes the keydown
   listener — nothing can fire or mutate state after unmount. */
NERDBOX.injectStyle("choicereact", `
.choicereact-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.3rem;
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
  position: relative;
}
/* the cross board: a 3x3 grid with pads on the 4 edge-centre cells */
.choicereact-board {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: clamp(8px, 2.6vw, 16px);
  width: 100%;
  max-width: 380px;
  aspect-ratio: 1 / 1;
  touch-action: manipulation;
}
.choicereact-pad {
  border: 2px solid var(--sub-alt);
  border-radius: 16px;
  background: var(--bg-alt);
  color: var(--sub);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: background 0.08s ease, border-color 0.08s ease,
    color 0.08s ease, transform 0.08s ease;
}
.choicereact-pad svg {
  width: clamp(28px, 9vw, 44px);
  height: clamp(28px, 9vw, 44px);
  display: block;
}
/* cross placement on the 3x3 grid */
.choicereact-pad.choicereact-up    { grid-column: 2; grid-row: 1; }
.choicereact-pad.choicereact-down  { grid-column: 2; grid-row: 3; }
.choicereact-pad.choicereact-left  { grid-column: 1; grid-row: 2; }
.choicereact-pad.choicereact-right { grid-column: 3; grid-row: 2; }

/* centre fixation marker — purely decorative, never a target */
.choicereact-center {
  grid-column: 2; grid-row: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.choicereact-center span {
  width: clamp(10px, 3vw, 16px);
  height: clamp(10px, 3vw, 16px);
  border-radius: 50%;
  background: var(--sub-alt);
  transition: background 0.1s ease;
}
.choicereact-wrap.choicereact-armed .choicereact-center span { background: var(--sub); }

/* lit (active) pad — the one to respond to */
.choicereact-pad.choicereact-on {
  background: var(--go);
  border-color: var(--go);
  color: var(--bg);
  transform: scale(1.04);
}
/* correct-response flash */
.choicereact-pad.choicereact-good {
  background: var(--go);
  border-color: var(--go);
  color: var(--bg);
}
/* wrong-response flash (the pad the player actually hit) */
.choicereact-pad.choicereact-bad {
  background: var(--error);
  border-color: var(--error);
  color: var(--bg);
}
.choicereact-board.choicereact-live .choicereact-pad:active { transform: scale(0.97); }

.choicereact-status { width: 100%; }
.choicereact-status .choicereact-trial { color: var(--sub); }
.choicereact-status .choicereact-avg { color: var(--accent); font-weight: 700; }
.choicereact-cue {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: clamp(0.95rem, 4vw, 1.15rem);
  letter-spacing: 0.04em;
  min-height: 1.4em;
  text-align: center;
}
.choicereact-cue.choicereact-go { color: var(--go); }
.choicereact-hint {
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.85rem;
  text-align: center;
  line-height: 1.5;
}
.choicereact-hint b { color: var(--accent); font-weight: 700; }
.choicereact-break b { color: var(--accent); font-weight: 700; }
.choicereact-break i { color: var(--error); font-style: normal; font-weight: 700; }
`);

NERDBOX.register({
  id: "choicereact",
  name: "Choice Reaction",
  tagline: "hit the right one, instantly",
  category: "reflex",
  scoreMode: "min",
  formatScore: function (v) { return v + " ms"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="2.5"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;

    /* ---- config ---- */
    var TOTAL = 12;          // trials per round
    var GAP_MIN = 500;       // random pre-cue gap, ms
    var GAP_MAX = 1500;
    var WRONG_PENALTY = 1000;// ms added for a wrong-target response
    var FEEDBACK_MS = 320;   // good/bad flash before the next trial

    // the four directions, in a stable order; each maps a pad to its arrow key
    var DIRS = ["up", "down", "left", "right"];
    var KEY_TO_DIR = {
      ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right"
    };
    var ARROW_SVG = {
      up:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
      down:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>',
      left:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
      right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
    };

    /* ---- timers: only ever one outstanding (the gap/feedback timer) ----
       Tracked explicitly and cleared on finish AND teardown. */
    var gapTimer = null;

    /* ---- state machine ---- */
    var running = false;     // a round is in progress
    var trial = 0;           // trials completed so far (0..TOTAL)
    var times = [];          // recorded ms per completed trial (incl. penalties)
    var target = null;       // current lit direction, or null
    var accepting = false;   // input counts only while true
    var cueTime = 0;         // performance.now() when the pad lit up
    // token bumped each trial / start / finish / teardown; every gap callback
    // captures it and bails if it no longer matches → no stale mutation.
    var token = 0;

    /* ---- layout ---- */
    var wrap = el("div", "choicereact-wrap");
    var status = el("div", "g-status choicereact-status");
    var board = el("div", "choicereact-board");

    // build the four pads + decorative centre
    var pads = {}; // dir -> element
    DIRS.forEach(function (dir) {
      var pad = el("button", "choicereact-pad choicereact-" + dir, ARROW_SVG[dir]);
      pad.setAttribute("type", "button");
      pad.setAttribute("aria-label", dir);
      pad.dataset.dir = dir;
      board.appendChild(pad);
      pads[dir] = pad;
    });
    var center = el("div", "choicereact-center", "<span></span>");
    board.appendChild(center);

    var cue = el("div", "choicereact-cue", "");
    var hint = el("div", "choicereact-hint",
      'one pad lights up — hit the matching <b>arrow key</b> or <b>click</b> it, fast');
    var overlay = el("div", "g-overlay");

    wrap.appendChild(status);
    wrap.appendChild(board);
    wrap.appendChild(cue);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    function clearTimers() {
      if (gapTimer !== null) { clearTimeout(gapTimer); gapTimer = null; }
    }

    function avgMs() {
      if (!times.length) return 0;
      var sum = 0;
      for (var i = 0; i < times.length; i++) sum += times[i];
      return Math.round(sum / times.length);
    }

    function renderStatus() {
      var done = Math.min(trial, TOTAL);
      var shown = running ? Math.min(trial + 1, TOTAL) : done;
      var avgTxt = times.length ? avgMs() + " ms" : "—";
      status.innerHTML =
        '<span class="choicereact-trial">trial ' + shown + ' / ' + TOTAL + '</span>' +
        '<span class="choicereact-avg">avg ' + avgTxt + '</span>';
    }

    function clearPadStates() {
      DIRS.forEach(function (dir) {
        pads[dir].classList.remove(
          "choicereact-on", "choicereact-good", "choicereact-bad"
        );
      });
    }

    // Resolve the current trial: record its time, flash feedback on the relevant
    // pad(s), then schedule the next trial (or finish). `ms` already includes any
    // wrong-target penalty.
    function resolveTrial(ms, hitDir, good) {
      accepting = false;
      var litDir = target;
      target = null;
      var myToken = token; // freeze: only THIS trial's feedback timer advances
      trial++;
      times.push(ms);
      wrap.classList.remove("choicereact-armed");

      clearPadStates();
      if (good) {
        if (litDir) pads[litDir].classList.add("choicereact-good");
      } else {
        // show the correct pad as "on" and the wrongly-hit pad as "bad"
        if (litDir) pads[litDir].classList.add("choicereact-on");
        if (hitDir && pads[hitDir]) pads[hitDir].classList.add("choicereact-bad");
      }
      cue.className = "choicereact-cue";
      cue.textContent = good
        ? ms + " ms"
        : "wrong — +" + WRONG_PENALTY + " ms";
      renderStatus();

      clearTimers();
      gapTimer = setTimeout(function () {
        gapTimer = null;
        if (!running || myToken !== token) return; // stale (torn down / restarted)
        clearPadStates();
        if (trial >= TOTAL) finish();
        else nextTrial();
      }, FEEDBACK_MS);
    }

    // Begin a trial: blank gap with the centre fixation, then light one pad.
    function nextTrial() {
      if (!running) return;
      token++;
      var myToken = token;
      accepting = false;
      target = null;
      clearPadStates();
      wrap.classList.add("choicereact-armed");
      cue.className = "choicereact-cue";
      cue.textContent = "ready…";
      renderStatus();

      var gap = GAP_MIN + ctx.util.rand(GAP_MAX - GAP_MIN + 1);
      clearTimers();
      gapTimer = setTimeout(function () {
        gapTimer = null;
        if (!running || myToken !== token) return; // stale guard
        lightUp(myToken);
      }, gap);
    }

    function lightUp(myToken) {
      if (!running || myToken !== token) return;
      target = DIRS[ctx.util.rand(DIRS.length)];
      wrap.classList.remove("choicereact-armed");
      clearPadStates();
      pads[target].classList.add("choicereact-on");
      cue.className = "choicereact-cue choicereact-go";
      cue.textContent = "go!";
      accepting = true;
      cueTime = performance.now();
    }

    // A response arrives (from a click or an arrow key). `dir` is the chosen
    // direction. Only counts while a pad is lit and we're accepting input.
    function respond(dir) {
      if (!running || !accepting || target === null) return;
      var rt = Math.round(performance.now() - cueTime);
      if (dir === target) {
        resolveTrial(rt, dir, true);
      } else {
        // wrong target: fixed penalty for this trial (don't add the raw RT —
        // keep the penalty deterministic regardless of how fast they mis-hit)
        resolveTrial(WRONG_PENALTY, dir, false);
      }
    }

    /* ---- click input: one handler per pad ---- */
    function makeClick(dir) {
      return function () { respond(dir); };
    }
    var clickHandlers = {};
    DIRS.forEach(function (dir) {
      var h = makeClick(dir);
      clickHandlers[dir] = h;
      pads[dir].addEventListener("click", h);
    });

    /* ---- keyboard input: a single document keydown listener ---- */
    function onKeyDown(e) {
      var dir = KEY_TO_DIR[e.key];
      if (!dir) return;
      if (running && accepting && target !== null) {
        e.preventDefault(); // stop the page scrolling on arrow keys mid-trial
        respond(dir);
      }
    }
    document.addEventListener("keydown", onKeyDown);

    function start() {
      clearTimers();
      token++;             // invalidate any pending callback before resetting
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      running = true;
      trial = 0;
      times = [];
      target = null;
      accepting = false;
      clearPadStates();
      wrap.classList.remove("choicereact-armed");
      board.classList.add("choicereact-live");
      renderStatus();
      nextTrial();
    }

    function finish() {
      running = false;
      accepting = false;
      target = null;
      token++;             // any in-flight callback now sees a stale token
      clearTimers();
      clearPadStates();
      wrap.classList.remove("choicereact-armed");
      board.classList.remove("choicereact-live");
      cue.className = "choicereact-cue";
      cue.textContent = "";

      var avg = avgMs();
      var best = ctx.submitScore(avg);
      // count clean (penalty-free) trials for the result blurb
      var clean = 0;
      for (var i = 0; i < times.length; i++) if (times[i] < WRONG_PENALTY) clean++;
      var errs = TOTAL - clean;
      renderStatus();

      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">' + avg + ' ms</div>' +
          '<div class="g-sub choicereact-break">' +
            (best ? "new best! · " : "") +
            'avg over ' + TOTAL + ' · ' +
            '<b>' + clean + '</b> clean · <i>' + errs + '</i> errors' +
          '</div>' +
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
    clearPadStates();
    renderStatus();
    showOverlay(
      '<div class="g-result">' +
        '<div class="g-sub" style="margin-bottom:.4rem">12 trials · hit the lit pad with the matching arrow or a click</div>' +
        '<button class="g-btn">start</button>' +
      '</div>'
    );

    /* ---- teardown: stop the round, clear EVERY timer, drop the key listener ---- */
    return function () {
      running = false;
      accepting = false;
      target = null;
      token++;            // any in-flight gap/feedback callback bails on stale token
      clearTimers();      // clears the single outstanding gap/feedback timer
      document.removeEventListener("keydown", onKeyDown);
      DIRS.forEach(function (dir) {
        pads[dir].removeEventListener("click", clickHandlers[dir]);
      });
    };
  }
});
