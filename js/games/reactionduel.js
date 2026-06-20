/* Reaction Duel — 2-player local hotseat. Left = P1 (F), Right = P2 (J).
   Each round both halves show "wait…"; after a random 1500–4000ms delay
   they flip to "GO!" and a timer starts. First valid key wins the round.
   Pressing before GO = false start (instant round loss). Best of 5;
   first to 3 round-wins takes the match. Score (min) = fastest legal
   reaction time recorded across both players during the match. */
NERDBOX.injectStyle("reactionduel", `
.rd-wrap {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
}
.rd-tally {
  font-family: "JetBrains Mono", monospace;
  text-align: center;
  font-size: clamp(1.1rem, 4vw, 1.5rem);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--text);
}
.rd-tally .rd-p1 { color: var(--accent); }
.rd-tally .rd-p2 { color: var(--caret); }
.rd-tally .rd-dash { color: var(--sub); margin: 0 0.6rem; }
.rd-arena {
  display: flex;
  gap: 0.8rem;
  width: 100%;
}
.rd-half {
  flex: 1 1 0;
  min-width: 0;
  min-height: 280px;
  height: min(48vh, 360px);
  border-radius: 18px;
  border: 2px solid var(--sub-alt);
  background: var(--bg-alt);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  text-align: center;
  user-select: none;
  -webkit-user-select: none;
  transition: background 0.1s ease, border-color 0.1s ease, color 0.1s ease;
}
.rd-half.rd-wait { background: var(--bg-alt); border-color: var(--error); }
.rd-half.rd-go { background: var(--accent); border-color: var(--accent); color: var(--bg); }
.rd-half.rd-win { background: var(--bg-alt); border-color: var(--accent); }
.rd-half.rd-lose { background: var(--bg-alt); border-color: var(--error); }
.rd-label {
  font-family: "JetBrains Mono", monospace;
  font-size: 0.85rem;
  letter-spacing: 0.06em;
  color: var(--sub);
}
.rd-half.rd-go .rd-label { color: var(--bg); }
.rd-key {
  display: inline-block;
  min-width: 1.6em;
  padding: 0.05em 0.35em;
  border-radius: 6px;
  border: 1px solid currentColor;
  font-weight: 700;
}
.rd-main {
  font-family: "JetBrains Mono", monospace;
  font-weight: 700;
  font-size: clamp(1.5rem, 7vw, 2.6rem);
  letter-spacing: 0.04em;
  line-height: 1.1;
}
.rd-sub {
  font-family: "JetBrains Mono", monospace;
  font-size: clamp(0.85rem, 3vw, 1.05rem);
  color: var(--sub);
}
.rd-half.rd-go .rd-sub { color: var(--bg); }
.rd-controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  min-height: 2.6rem;
}
.rd-controls .g-sub { text-align: center; }
`);

NERDBOX.register({
  id: "reactionduel",
  name: "Reaction Duel",
  tagline: "two players — first to react wins",
  category: "reflex",
  difficulty: "extreme",
  multiplayer: true,
  players: 2,
  scoreMode: "min",
  formatScore: function (v) { return v + " ms"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L4 12l7 7"/><path d="M13 5l7 7-7 7"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;

    /* ---- config ---- */
    var DELAY_MIN = 1500;     // random wait before GO, ms
    var DELAY_MAX = 4000;
    var NEXT_DELAY = 1500;    // auto-advance countdown between rounds, ms
    var WIN_ROUNDS = 3;       // first to 3 round-wins takes the match (best of 5)

    /* ---- timers (all cleared on round end / finish / teardown) ---- */
    var goTimer = null;       // pending wait -> GO
    var nextTimer = null;     // between-round auto-advance tick

    /* ---- state ---- */
    var phase = "idle";       // idle | wait | go | decided | over
    var startT = 0;           // performance.now at GO
    var p1Wins = 0, p2Wins = 0;
    var bestMs = null;        // fastest legal reaction across the match
    var countdown = 0;        // seconds left on auto-advance

    /* ---- layout ---- */
    var wrap = el("div", "rd-wrap");
    var tally = el("div", "rd-tally");
    var arena = el("div", "rd-arena");
    var left = el("div", "rd-half");
    var right = el("div", "rd-half");
    arena.appendChild(left);
    arena.appendChild(right);
    var controls = el("div", "rd-controls");
    wrap.appendChild(tally);
    wrap.appendChild(arena);
    wrap.appendChild(controls);
    root.appendChild(wrap);

    function clearTimers() {
      if (goTimer !== null) { clearTimeout(goTimer); goTimer = null; }
      if (nextTimer !== null) { clearTimeout(nextTimer); nextTimer = null; }
    }

    function renderTally() {
      tally.innerHTML =
        '<span class="rd-p1">P1 ' + p1Wins + '</span>' +
        '<span class="rd-dash">—</span>' +
        '<span class="rd-p2">' + p2Wins + ' P2</span>';
    }

    function paint(half, who, key, cls, main, sub) {
      half.className = "rd-half" + (cls ? " " + cls : "");
      half.innerHTML =
        '<div class="rd-label">' + who + ' &nbsp;·&nbsp; <span class="rd-key">' + key + '</span></div>' +
        '<div class="rd-main">' + main + '</div>' +
        '<div class="rd-sub">' + sub + '</div>';
    }
    function paintLeft(cls, main, sub) { paint(left, "Player 1", "F", cls, main, sub); }
    function paintRight(cls, main, sub) { paint(right, "Player 2", "J", cls, main, sub); }

    function setControls(html) {
      controls.innerHTML = html;
      var btn = controls.querySelector("button");
      return btn;
    }

    /* Arm a fresh round: both halves wait, then flip to GO after a random delay. */
    function startRound() {
      clearTimers();
      phase = "wait";
      renderTally();
      paintLeft("rd-wait", "wait…", "don't press yet");
      paintRight("rd-wait", "wait…", "don't press yet");
      setControls('<div class="g-sub">first to react wins · false start loses</div>');
      var delay = DELAY_MIN + ctx.util.rand(DELAY_MAX - DELAY_MIN + 1);
      goTimer = setTimeout(function () {
        goTimer = null;
        if (phase !== "wait") return; // guard: stale (decided/torn down)
        phase = "go";
        startT = performance.now();
        paintLeft("rd-go", "GO!", "press F");
        paintRight("rd-go", "GO!", "press J");
      }, delay);
    }

    /* End a round. winner = 1 or 2. ms = reaction time of winner (or null for
       a false start). early = true when the loser jumped the gun. */
    function decideRound(winner, ms, early) {
      if (phase === "decided" || phase === "over") return;
      phase = "decided";
      if (goTimer !== null) { clearTimeout(goTimer); goTimer = null; } // cancel pending GO

      if (ms !== null && (bestMs === null || ms < bestMs)) bestMs = ms;

      if (winner === 1) p1Wins++; else p2Wins++;

      var winText = ms !== null ? ms + " ms" : "winner";
      if (winner === 1) {
        paintLeft("rd-win", "won!", winText);
        paintRight("rd-lose", early ? "too early!" : "too slow", early ? "false start" : "—");
      } else {
        paintRight("rd-win", "won!", winText);
        paintLeft("rd-lose", early ? "too early!" : "too slow", early ? "false start" : "—");
      }
      renderTally();

      if (p1Wins >= WIN_ROUNDS || p2Wins >= WIN_ROUNDS) {
        finish();
      } else {
        scheduleNext();
      }
    }

    /* Between rounds: visible countdown, then auto-advance. Bounded recursion via
       a single re-armed timer that stops when countdown hits 0. */
    function scheduleNext() {
      countdown = Math.ceil(NEXT_DELAY / 1000);
      var btn = setControls(
        '<div class="g-sub">next round in <b>' + countdown + '</b>…</div>' +
        '<button class="g-btn">next round →</button>'
      );
      if (btn) btn.addEventListener("click", startRound);
      tick();
    }
    function tick() {
      if (nextTimer !== null) { clearTimeout(nextTimer); nextTimer = null; }
      nextTimer = setTimeout(function () {
        nextTimer = null;
        if (phase !== "decided") return; // guard: advanced manually / torn down
        countdown--;
        if (countdown <= 0) { startRound(); return; }
        var label = controls.querySelector(".g-sub");
        if (label) label.innerHTML = "next round in <b>" + countdown + "</b>…";
        tick();
      }, 1000);
    }

    function finish() {
      clearTimers();
      phase = "over";
      var winner = p1Wins > p2Wins ? 1 : 2;
      var best = ctx.submitScore(bestMs !== null ? bestMs : 0);
      var bestLine = bestMs !== null
        ? (best ? "new device best! · " : "") + "fastest: " + bestMs + " ms"
        : "no legal reactions recorded";
      var btn = setControls(
        '<div class="g-result">' +
          '<div class="g-big">Player ' + winner + ' wins! 🏆</div>' +
          '<div class="g-sub">' + bestLine + '</div>' +
          '<button class="g-btn">rematch</button>' +
        '</div>'
      );
      if (btn) btn.addEventListener("click", rematch);
    }

    function rematch() {
      clearTimers();
      p1Wins = 0;
      p2Wins = 0;
      bestMs = null;
      startRound();
    }

    /* Single document-level key handler for both players. */
    function onKey(e) {
      var k = e.key;
      if (k !== "f" && k !== "F" && k !== "j" && k !== "J") return; // only F / J
      var player = (k === "f" || k === "F") ? 1 : 2;

      if (phase === "wait") {
        // false start: this player jumped the gun -> other player wins the round
        e.preventDefault();
        decideRound(player === 1 ? 2 : 1, null, true);
      } else if (phase === "go") {
        e.preventDefault();
        var ms = Math.round(performance.now() - startT);
        decideRound(player, ms, false);
      }
      // idle / decided / over: ignore (guards against double-handling)
    }
    document.addEventListener("keydown", onKey);

    /* ---- initial idle state ---- */
    renderTally();
    paintLeft("", "Player 1", "key F");
    paintRight("", "Player 2", "key J");
    var startBtn = setControls(
      '<div class="g-sub">best of 5 · P1 presses <b>F</b>, P2 presses <b>J</b></div>' +
      '<button class="g-btn">start match</button>'
    );
    if (startBtn) startBtn.addEventListener("click", startRound);

    /* ---- teardown: cancel the pending GO timeout + between-round timers and
       detach the keydown listener so nothing fires after unmount. ---- */
    return function () {
      phase = "over";
      clearTimers();
      document.removeEventListener("keydown", onKey);
    };
  }
});
