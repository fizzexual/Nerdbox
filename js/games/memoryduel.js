/* Memory Duel — local 2-player concentration. Flip pairs; most pairs wins. */
NERDBOX.register({
  id: "memoryduel",
  name: "Memory Duel",
  tagline: "concentration — most pairs wins",
  category: "memory",
  difficulty: "extreme",
  multiplayer: true,
  players: 2,
  scoreMode: "min",
  formatScore: function (v) { return v + " flips"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="11" height="15" rx="1.5"/><path d="M17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9"/></svg>',
  mount: function (root, ctx) {
    NERDBOX.injectStyle("memoryduel", [
      ".md-wrap{display:flex;flex-direction:column;align-items:center;gap:14px}",
      ".md-board{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;width:min(360px,86vw)}",
      ".md-card{aspect-ratio:1;border:2px solid var(--sub);border-radius:10px;background:var(--bg-alt);color:transparent;font-size:clamp(20px,7vw,34px);font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s,border-color .2s,background .3s,color .2s;user-select:none}",
      ".md-card:hover:not(.md-up):not(.md-done){border-color:var(--text);transform:translateY(-2px)}",
      ".md-card.md-up{color:var(--text);border-color:var(--text);background:var(--bg)}",
      ".md-card.md-done{cursor:default;opacity:.85}",
      ".md-card.md-p1{color:var(--accent);border-color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,var(--bg-alt))}",
      ".md-card.md-p2{color:var(--caret);border-color:var(--caret);background:color-mix(in srgb,var(--caret) 14%,var(--bg-alt))}",
      ".md-card.md-lock{cursor:default}",
      ".md-score{display:flex;gap:18px;font-weight:700;font-size:15px}",
      ".md-tag{display:flex;align-items:center;gap:6px;color:var(--sub);transition:color .2s}",
      ".md-tag .md-dot{width:10px;height:10px;border-radius:50%}",
      ".md-p1c{color:var(--accent)} .md-p1c .md-dot{background:var(--accent)}",
      ".md-p2c{color:var(--caret)} .md-p2c .md-dot{background:var(--caret)}",
      ".md-tag.md-active{color:var(--text)}"
    ].join(""));

    var GLYPHS = ["★", "♦", "✦", "▲", "●", "♣", "✚", "◆"];
    var PAIRS = GLYPHS.length;            // 8 pairs -> 16 cards
    var cards = [];                        // card DOM elements
    var deck = [];                         // symbol index per card position
    var turn = 1;                          // current player (1 or 2)
    var p1 = 0, p2 = 0;                    // pair counts
    var flips = 0;                         // total reveals
    var first = -1;                        // index of first revealed card this turn
    var locked = false;                    // true while two cards are being evaluated
    var found = 0;                         // pairs matched so far
    var flipTimer = null;                  // handle for the flip-back/score timeout
    var over = false;

    var status = ctx.util.el("div", "g-status", "");
    var score = ctx.util.el("div", "md-score");
    var tag1 = ctx.util.el("div", "md-tag md-p1c");
    var tag2 = ctx.util.el("div", "md-tag md-p2c");
    score.appendChild(tag1); score.appendChild(tag2);
    var board = ctx.util.el("div", "md-board");
    var result = ctx.util.el("div", "g-result");
    result.style.display = "none";
    var wrap = ctx.util.el("div", "md-wrap");
    wrap.appendChild(score); wrap.appendChild(board); wrap.appendChild(result);
    root.appendChild(status); root.appendChild(wrap);

    function clearFlip() { if (flipTimer) { clearTimeout(flipTimer); flipTimer = null; } }

    function updateScore() {
      tag1.innerHTML = '<span class="md-dot"></span>P1: ' + p1;
      tag2.innerHTML = '<span class="md-dot"></span>P2: ' + p2;
      tag1.classList.toggle("md-active", turn === 1 && !over);
      tag2.classList.toggle("md-active", turn === 2 && !over);
    }
    function setTurnStatus() {
      status.textContent = "Player " + turn + "'s turn";
      updateScore();
    }

    function build() {
      clearFlip();
      over = false; locked = false; first = -1;
      turn = 1; p1 = 0; p2 = 0; flips = 0; found = 0;
      result.style.display = "none";
      board.innerHTML = "";
      cards = [];
      // two of each symbol index, shuffled into positions
      var bag = [];
      for (var s = 0; s < PAIRS; s++) { bag.push(s); bag.push(s); }
      deck = ctx.util.shuffle(bag);
      for (var i = 0; i < deck.length; i++) {
        var card = ctx.util.el("button", "md-card");
        card.textContent = GLYPHS[deck[i]];
        card.dataset.i = i;
        card.addEventListener("click", onCard);
        board.appendChild(card);
        cards.push(card);
      }
      setTurnStatus();
    }

    function onCard() {
      if (over || locked) return;
      var i = Number(this.dataset.i);
      var card = cards[i];
      if (card.classList.contains("md-up") || card.classList.contains("md-done")) return;

      card.classList.add("md-up");
      flips++;

      if (first === -1) {
        first = i;                         // first of the pair revealed; await second
        return;
      }
      if (i === first) return;             // guard: same card can't be the second pick

      // second card revealed -> evaluate; lock out further clicks until resolved
      locked = true;
      var a = first, b = i;
      first = -1;

      if (deck[a] === deck[b]) {
        flipTimer = setTimeout(function () {
          flipTimer = null;
          var cls = turn === 1 ? "md-p1" : "md-p2";
          cards[a].classList.remove("md-up"); cards[b].classList.remove("md-up");
          cards[a].classList.add("md-done", cls);
          cards[b].classList.add("md-done", cls);
          if (turn === 1) { p1++; } else { p2++; }
          found++;
          locked = false;
          if (found >= PAIRS) { finish(); }
          else { setTurnStatus(); }        // same player goes again
        }, 500);
      } else {
        flipTimer = setTimeout(function () {
          flipTimer = null;
          cards[a].classList.remove("md-up");
          cards[b].classList.remove("md-up");
          turn = turn === 1 ? 2 : 1;        // pass turn
          locked = false;
          setTurnStatus();
        }, 800);
      }
    }

    function finish() {
      over = true; locked = true;
      clearFlip();
      ctx.submitScore(flips);
      var headline, sub;
      if (p1 > p2) { headline = "Player 1 wins! 🏆"; }
      else if (p2 > p1) { headline = "Player 2 wins! 🏆"; }
      else { headline = "It's a draw!"; }
      sub = "P1: " + p1 + "  •  P2: " + p2 + "  •  " + flips + " flips";
      status.textContent = "game over";
      updateScore();
      result.style.display = "";
      result.innerHTML = '<div class="g-big">' + headline + '</div><div class="g-sub">' + sub + '</div>';
      var btn = ctx.util.el("button", "g-btn", "rematch");
      btn.addEventListener("click", build);
      result.appendChild(btn);
    }

    build();

    return function () {
      clearFlip();
      over = true;
      locked = true;
    };
  }
});
