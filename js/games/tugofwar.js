/* Tug of War — 2-player local hotseat button-masher. One keyboard, two people.
   Player 1 mashes F (pulls the knot LEFT), Player 2 mashes J (pulls it RIGHT).
   A "3 · 2 · 1 · MASH!" countdown gates input; first to drag the knot to their
   end (pos <= -100 or >= +100) wins. We submit the winner's tap count (max →
   the device keeps the biggest mash total ever).

   Cleanup: every countdown setTimeout id lives in `timers` and the tps interval
   in `tpsTimer`; teardown clears them all AND removeEventListener's the single
   document keydown handler so a remounted game can't keep moving an old knot. */
NERDBOX.injectStyle("tugofwar", `
.tow-wrap { display: flex; flex-direction: column; align-items: center; gap: 1.2rem; width: 100%; max-width: 560px; margin: 0 auto; }
.tow-players { display: flex; justify-content: space-between; width: 100%; gap: 1rem; }
.tow-side { flex: 1; text-align: center; }
.tow-name { font-weight: 700; color: var(--accent); font-size: 1rem; }
.tow-key { display: inline-block; margin-top: .35rem; padding: .25rem .7rem; border: 2px solid var(--sub-alt); border-radius: 8px; font-family: "JetBrains Mono", monospace; font-weight: 700; color: var(--text); background: var(--bg-alt); }
.tow-taps { margin-top: .4rem; font-family: "JetBrains Mono", monospace; color: var(--sub); font-size: .85rem; }
.tow-tps { color: var(--sub-alt); }
.tow-track { position: relative; width: 100%; height: 56px; border-radius: 28px; background: var(--bg-alt); border: 2px solid var(--sub-alt); overflow: hidden; touch-action: manipulation; }
.tow-fill { position: absolute; top: 0; bottom: 0; width: 50%; opacity: .28; }
.tow-fill-left { left: 0; background: var(--accent); transform-origin: left; }
.tow-fill-right { right: 0; background: var(--caret); transform-origin: right; }
.tow-center { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--sub); opacity: .6; }
.tow-knot { position: absolute; left: 50%; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%; background: var(--text); border: 3px solid var(--accent); transform: translateX(0); will-change: transform; box-shadow: 0 0 12px rgba(0, 0, 0, .35); }
.tow-hint { font-family: "JetBrains Mono", monospace; color: var(--sub); font-size: .85rem; text-align: center; line-height: 1.5; }
.tow-count { font-family: "JetBrains Mono", monospace; font-weight: 700; color: var(--accent); font-size: 1.4rem; min-height: 1.5rem; text-align: center; }
`);

NERDBOX.register({
  id: "tugofwar",
  name: "Tug of War",
  tagline: "out-mash your opponent",
  category: "motor",
  difficulty: "extreme",
  multiplayer: true,
  players: 2,
  scoreMode: "max",
  formatScore: function (v) { return v + " taps"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h6"/><path d="M16 12h6"/><path d="M5 9l-3 3 3 3"/><path d="M19 9l3 3-3 3"/><path d="M9 12h6"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;

    /* ---- config ---- */
    var GOAL = 100;          // knot wins at <= -GOAL (P1) or >= +GOAL (P2)
    var STEP = 2;            // knot travel per tap
    var HALF_PX = 0;         // half the track travel in px (measured after mount)

    /* ---- state ---- */
    var pos = 0;             // -GOAL..+GOAL, 0 = center
    var phase = "idle";      // idle | countdown | mash | done
    var p1 = 0, p2 = 0;      // tap counts this round
    var p1Win = 0, p2Win = 0; // taps inside the live (tps) window
    var timers = new Set();  // every countdown timeout id
    var tpsTimer = null;     // tap-per-second interval id

    function later(fn, ms) {
      var id = setTimeout(function () { timers.delete(id); fn(); }, ms);
      timers.add(id);
      return id;
    }
    function clearTimers() {
      timers.forEach(function (id) { clearTimeout(id); });
      timers.clear();
    }

    /* ---- layout ---- */
    var wrap = el("div", "tow-wrap");

    var players = el("div", "tow-players");
    var leftSide = el("div", "tow-side tow-left");
    leftSide.appendChild(el("div", "tow-name", "Player 1"));
    leftSide.appendChild(el("div", "tow-key", "F"));
    var p1Taps = el("div", "tow-taps", "0 taps");
    leftSide.appendChild(p1Taps);
    var rightSide = el("div", "tow-side tow-right");
    rightSide.appendChild(el("div", "tow-name", "Player 2"));
    rightSide.appendChild(el("div", "tow-key", "J"));
    var p2Taps = el("div", "tow-taps", "0 taps");
    rightSide.appendChild(p2Taps);
    players.appendChild(leftSide);
    players.appendChild(rightSide);

    var count = el("div", "tow-count", "");

    var track = el("div", "tow-track");
    var fillLeft = el("div", "tow-fill tow-fill-left");
    var fillRight = el("div", "tow-fill tow-fill-right");
    var center = el("div", "tow-center");
    var knot = el("div", "tow-knot");
    track.appendChild(fillLeft);
    track.appendChild(fillRight);
    track.appendChild(center);
    track.appendChild(knot);

    var hint = el("div", "tow-hint", "Player 1: mash F · Player 2: mash J");

    var overlay = el("div", "g-overlay");

    wrap.appendChild(players);
    wrap.appendChild(count);
    wrap.appendChild(track);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    /* ---- rendering ---- */
    function measure() {
      // distance (px) from center to a track edge, minus a knot half-width
      HALF_PX = (track.clientWidth / 2) - 15;
      if (HALF_PX < 0) HALF_PX = 0;
    }
    function renderKnot() {
      var t = pos / GOAL;                 // -1..+1
      knot.style.transform = "translateX(" + (t * HALF_PX) + "px)";
      // rope fills: the side being pulled toward shrinks as the knot crosses
      var leftScale = 1 + t;              // t=-1 → 0, t=0 → 1, t=+1 → 2
      var rightScale = 1 - t;
      fillLeft.style.transform = "scaleX(" + leftScale + ")";
      fillRight.style.transform = "scaleX(" + rightScale + ")";
    }
    function renderTaps() {
      p1Taps.innerHTML = p1 + ' taps <span class="tow-tps">(' + p1Win + '/s)</span>';
      p2Taps.innerHTML = p2 + ' taps <span class="tow-tps">(' + p2Win + '/s)</span>';
    }

    /* ---- tap-per-second meter: sample the windowed counters once a second ---- */
    function startTps() {
      stopTps();
      tpsTimer = setInterval(function () {
        if (phase !== "mash") return;
        renderTaps();
        p1Win = 0;
        p2Win = 0;
      }, 1000);
    }
    function stopTps() {
      if (tpsTimer !== null) { clearInterval(tpsTimer); tpsTimer = null; }
    }

    /* ---- input: ONE document handler, added on mount, removed on teardown ---- */
    function onKey(e) {
      if (phase !== "mash") return;       // ignore before MASH! and after a win
      var k = (e.key || "").toLowerCase();
      if (k === "f") {
        e.preventDefault();
        p1++; p1Win++;
        pos -= STEP;
        renderKnot();
        if (pos <= -GOAL) { pos = -GOAL; renderKnot(); win(1); }
      } else if (k === "j") {
        e.preventDefault();
        p2++; p2Win++;
        pos += STEP;
        renderKnot();
        if (pos >= GOAL) { pos = GOAL; renderKnot(); win(2); }
      }
    }
    document.addEventListener("keydown", onKey);

    /* ---- round lifecycle ---- */
    function resetBoard() {
      clearTimers();
      stopTps();
      pos = 0; p1 = 0; p2 = 0; p1Win = 0; p2Win = 0;
      measure();
      renderKnot();
      renderTaps();
    }

    function startCountdown() {
      resetBoard();
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      phase = "countdown";
      var steps = ["3", "2", "1", "MASH!"];
      count.textContent = "";
      // schedule each label; the last one flips into the mash phase
      for (var i = 0; i < steps.length; i++) {
        (function (label, idx) {
          later(function () {
            count.textContent = label;
            if (idx === steps.length - 1) {
              phase = "mash";
              startTps();
              // clear the "MASH!" banner shortly after so the track is clean
              later(function () { if (phase === "mash") count.textContent = ""; }, 600);
            }
          }, idx * 800);
        })(steps[i], i);
      }
    }

    function win(player) {
      if (phase !== "mash") return;
      phase = "done";
      clearTimers();
      stopTps();
      renderTaps();                       // flush final tps window to the labels
      var winnerTaps = player === 1 ? p1 : p2;
      var best = ctx.submitScore(winnerTaps);
      count.textContent = "";
      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">Player ' + player + ' wins! 🏆</div>' +
          '<div class="g-sub">' + (best ? "new best! · " : "") +
            winnerTaps + ' taps · ' + p1 + ' vs ' + p2 +
          '</div>' +
          '<button class="g-btn">rematch</button>' +
        '</div>'
      );
    }

    function showOverlay(html) {
      overlay.innerHTML = html;
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", startCountdown);
      overlay.classList.add("show");
    }

    /* ---- initial idle state ---- */
    measure();
    renderKnot();
    renderTaps();
    showOverlay(
      '<div class="g-result">' +
        '<div class="g-sub" style="margin-bottom:.4rem">two players, one keyboard · P1 mashes F, P2 mashes J · first to pull the knot to their side wins</div>' +
        '<button class="g-btn">start</button>' +
      '</div>'
    );

    /* ---- teardown: stop input + every timer so nothing fires after unmount ---- */
    return function () {
      phase = "done";
      clearTimers();                      // every countdown timeout
      stopTps();                          // the tap-per-second interval
      document.removeEventListener("keydown", onKey); // the lone keydown handler
    };
  }
});
