/* Stroop Duel — 2-player local hotseat go/no-go.
   A colour WORD is printed in an INK colour (classic Stroop: they usually
   mismatch). Each player owns ONE ink: P1 (key F) = RED, P2 (key J) = BLUE.
   Slap your key ONLY when the INK is your colour. Green/yellow ink = no-go for
   both. Correct slap +1. Wrong slap −1 (floor 0) and +1 to the opponent.
   First to 10 wins. Only F and J matter. */
NERDBOX.injectStyle("stroopduel", `
.sd-wrap { display: flex; flex-direction: column; align-items: center; gap: 1.2rem; width: 100%; max-width: 620px; margin: 0 auto; position: relative; }
.sd-board { display: flex; align-items: stretch; gap: 0; width: 100%; min-height: 280px; height: min(50vh, 360px); border-radius: 18px; overflow: hidden; border: 2px solid var(--sub-alt); background: var(--bg-alt); }
.sd-side { flex: 1 1 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.8rem; padding: 1rem; text-align: center; transition: background 0.12s ease; }
.sd-side.sd-right { background: rgba(76,175,114,0.16); }
.sd-side.sd-wrong { background: rgba(226,72,61,0.16); }
.sd-key { font-family: "JetBrains Mono", monospace; font-weight: 700; font-size: clamp(1.4rem, 6vw, 2rem); letter-spacing: 0.08em; color: var(--text); }
.sd-key small { display: block; font-size: 0.62em; font-weight: 600; letter-spacing: 0.04em; color: var(--sub); margin-top: 0.2rem; }
.sd-swatch { width: clamp(54px, 16vw, 86px); height: clamp(54px, 16vw, 86px); border-radius: 14px; box-shadow: 0 0 0 3px var(--bg-alt), 0 0 0 5px rgba(0,0,0,0.2); }
.sd-pscore { font-family: "JetBrains Mono", monospace; font-weight: 700; font-size: clamp(2.2rem, 9vw, 3.4rem); line-height: 1; color: var(--text); }
.sd-center { flex: 0 0 4px; align-self: stretch; background: var(--sub-alt); }
.sd-stage { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 2; display: flex; align-items: center; justify-content: center; min-width: 50%; padding: 0.5rem 1.2rem; border-radius: 14px; background: var(--bg); box-shadow: 0 0 0 2px var(--sub-alt), 0 6px 26px rgba(0,0,0,0.35); pointer-events: none; }
.sd-word { font-family: "JetBrains Mono", monospace; font-weight: 700; font-size: clamp(2.2rem, 10vw, 4rem); letter-spacing: 0.04em; line-height: 1; user-select: none; }
.sd-scoreboard { font-family: "JetBrains Mono", monospace; font-weight: 700; font-size: 1rem; letter-spacing: 0.06em; color: var(--sub); display: flex; gap: 1.4rem; }
.sd-scoreboard b { color: var(--accent); }
.sd-hint { font-family: "JetBrains Mono", monospace; color: var(--sub); font-size: 0.84rem; text-align: center; line-height: 1.5; }
.sd-hint b { color: var(--text); font-weight: 700; }
`);

NERDBOX.register({
  id: "stroopduel",
  name: "Stroop Duel",
  tagline: "slap only when the ink is yours",
  category: "attention",
  difficulty: "extreme",
  multiplayer: true,
  players: 2,
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M5 8l-2 2 2 2"/><path d="M19 8l2 2-2 2"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el, rand = ctx.util.rand;

    /* ---- config ---- */
    var WIN = 10;            // first to this many points wins
    var STIM_MS = 1100;      // window before a stimulus auto-advances
    var FEEDBACK_MS = 260;   // green/red side flash after a resolution
    var RB_RATE = 0.55;      // ~55% of stimuli are red or blue (the "go" inks)

    /* Fixed game ink colours — independent of theme so both are identifiable. */
    var INKS = [
      { id: "red",    label: "RED",    hex: "#e2483d" },
      { id: "blue",   label: "BLUE",   hex: "#3d7de2" },
      { id: "green",  label: "GREEN",  hex: "#46c46a" },
      { id: "yellow", label: "YELLOW", hex: "#e2b41e" }
    ];
    function byId(id) {
      for (var i = 0; i < INKS.length; i++) if (INKS[i].id === id) return INKS[i];
      return INKS[0];
    }

    /* ---- timers (every active id tracked, cleared on finish/teardown) ---- */
    var stimTimer = null;    // stimulus window -> auto-advance (no correct press)
    var feedbackTimer = null;// clears the side flash + shows next stimulus

    /* ---- state ---- */
    var running = false;
    var s1 = 0, s2 = 0;      // player scores
    var inkId = null;        // current INK colour id (the thing that matters)
    var accepting = false;   // keys only count while a stimulus is live
    var resolved = false;    // guards one resolution per stimulus
    // bumped each stimulus; every timer callback checks it so a stale timer
    // (after teardown/restart) can never mutate state.
    var token = 0;

    /* ---- layout ---- */
    var wrap = el("div", "sd-wrap");
    var scoreboard = el("div", "sd-scoreboard");
    var board = el("div", "sd-board");

    var side1 = el("div", "sd-side");
    var key1 = el("div", "sd-key");
    key1.innerHTML = 'F<small>Player 1</small>';
    var sw1 = el("div", "sd-swatch");
    sw1.style.background = byId("red").hex;
    var ps1 = el("div", "sd-pscore", "0");
    side1.appendChild(key1); side1.appendChild(sw1); side1.appendChild(ps1);

    var divider = el("div", "sd-center");

    var side2 = el("div", "sd-side");
    var key2 = el("div", "sd-key");
    key2.innerHTML = 'J<small>Player 2</small>';
    var sw2 = el("div", "sd-swatch");
    sw2.style.background = byId("blue").hex;
    var ps2 = el("div", "sd-pscore", "0");
    side2.appendChild(key2); side2.appendChild(sw2); side2.appendChild(ps2);

    var stage = el("div", "sd-stage");
    var word = el("div", "sd-word");
    stage.appendChild(word);

    board.appendChild(side1);
    board.appendChild(divider);
    board.appendChild(side2);
    board.appendChild(stage);

    var hint = el("div", "sd-hint",
      'slap your key only when the <b>INK</b> is your colour &nbsp;·&nbsp; green &amp; yellow = no-go');
    var overlay = el("div", "g-overlay");

    wrap.appendChild(scoreboard);
    wrap.appendChild(board);
    wrap.appendChild(hint);
    wrap.appendChild(overlay);
    root.appendChild(wrap);

    function clearTimers() {
      if (stimTimer !== null) { clearTimeout(stimTimer); stimTimer = null; }
      if (feedbackTimer !== null) { clearTimeout(feedbackTimer); feedbackTimer = null; }
    }

    function renderScores() {
      ps1.textContent = String(s1);
      ps2.textContent = String(s2);
      scoreboard.innerHTML =
        '<span>P1: <b>' + s1 + '</b></span>' +
        '<span>P2: <b>' + s2 + '</b></span>';
    }

    function flash(side, cls) {
      side.classList.remove("sd-right", "sd-wrong");
      void side.offsetWidth; // reflow so re-adding re-triggers the transition
      side.classList.add(cls);
    }

    function nextStimulus() {
      if (!running) return;
      token++;
      var myToken = token;
      resolved = false;
      accepting = true;

      // pick the INK: ~55% red/blue (go inks), rest green/yellow (no-go)
      var ink;
      if (Math.random() < RB_RATE) {
        ink = rand(2) === 0 ? byId("red") : byId("blue");
      } else {
        ink = rand(2) === 0 ? byId("green") : byId("yellow");
      }
      // pick the WORD: usually a DIFFERENT colour than the ink (~80% mismatch)
      var w;
      if (rand(5) === 0) {
        w = ink; // occasional congruent stimulus
      } else {
        var others = INKS.filter(function (c) { return c.id !== ink.id; });
        w = others[rand(others.length)];
      }
      inkId = ink.id;
      word.textContent = w.label;
      word.style.color = ink.hex;

      if (stimTimer !== null) { clearTimeout(stimTimer); }
      stimTimer = setTimeout(function () {
        stimTimer = null;
        if (!running || myToken !== token) return; // stale guard
        // window elapsed with no correct press: no points, advance.
        resolved = true;
        accepting = false;
        nextStimulus();
      }, STIM_MS);
    }

    // player = 1 or 2; their owned ink id ("red" for P1, "blue" for P2)
    function press(player, ownId) {
      if (!running || !accepting || resolved) return;
      resolved = true;            // exactly one resolution per stimulus
      accepting = false;
      if (stimTimer !== null) { clearTimeout(stimTimer); stimTimer = null; }
      var myToken = token;

      var side = player === 1 ? side1 : side2;
      var oppIsP1 = player === 2; // for awarding the opponent

      if (inkId === ownId) {
        // correct slap on your own ink
        if (player === 1) s1++; else s2++;
        flash(side, "sd-right");
      } else {
        // wrong slap (no-go ink, or the other player's colour):
        // −1 to presser (floor 0) AND +1 to opponent
        if (player === 1) {
          if (s1 > 0) s1--;
          s2++;
        } else {
          if (s2 > 0) s2--;
          s1++;
        }
        flash(side, "sd-wrong");
        if (oppIsP1) flash(side1, "sd-right"); else flash(side2, "sd-right");
      }
      renderScores();

      if (s1 >= WIN || s2 >= WIN) { finishWin(myToken); return; }

      if (feedbackTimer !== null) { clearTimeout(feedbackTimer); }
      feedbackTimer = setTimeout(function () {
        feedbackTimer = null;
        if (!running || myToken !== token) return; // stale guard
        side1.classList.remove("sd-right", "sd-wrong");
        side2.classList.remove("sd-right", "sd-wrong");
        nextStimulus();
      }, FEEDBACK_MS);
    }

    function onKey(e) {
      if (!running) return;
      var k = e.key;
      if (k === "f" || k === "F") { e.preventDefault(); press(1, "red"); }
      else if (k === "j" || k === "J") { e.preventDefault(); press(2, "blue"); }
    }

    function start() {
      clearTimers();
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      running = true;
      s1 = 0; s2 = 0;
      resolved = false;
      accepting = false;
      side1.classList.remove("sd-right", "sd-wrong");
      side2.classList.remove("sd-right", "sd-wrong");
      renderScores();
      nextStimulus();
    }

    function finishWin(myToken) {
      if (!running || myToken !== token) return;
      running = false;
      accepting = false;
      clearTimers();
      side1.classList.remove("sd-right", "sd-wrong");
      side2.classList.remove("sd-right", "sd-wrong");
      word.textContent = "—";
      word.style.color = "var(--sub)";

      var winner = s1 >= WIN ? 1 : 2;
      var best = Math.max(s1, s2);
      ctx.submitScore(best); // per-device record = highest score either player hit
      renderScores();

      showOverlay(
        '<div class="g-result">' +
          '<div class="g-big">Player ' + winner + ' wins! 🏆</div>' +
          '<div class="g-sub">final &nbsp;·&nbsp; P1 ' + s1 + ' &nbsp;–&nbsp; P2 ' + s2 + '</div>' +
          '<button class="g-btn">rematch</button>' +
        '</div>'
      );
    }

    function showOverlay(html) {
      overlay.innerHTML = html;
      var btn = overlay.querySelector("button");
      if (btn) btn.addEventListener("click", start);
      overlay.classList.add("show");
    }

    document.addEventListener("keydown", onKey);

    /* ---- initial idle state ---- */
    word.textContent = "DUEL";
    word.style.color = "var(--accent)";
    renderScores();
    showOverlay(
      '<div class="g-result">' +
        '<div class="g-sub" style="margin-bottom:.5rem">first to ' + WIN +
          ' &nbsp;·&nbsp; <b>F</b> = red &nbsp;·&nbsp; <b>J</b> = blue &nbsp;·&nbsp; slap on YOUR ink</div>' +
        '<button class="g-btn">start</button>' +
      '</div>'
    );

    /* ---- teardown: stop the round, clear EVERY timer, drop the keydown ---- */
    return function () {
      running = false;
      accepting = false;
      resolved = true;
      token++;            // invalidate any callback still holding an old token
      clearTimers();
      document.removeEventListener("keydown", onKey);
    };
  }
});
