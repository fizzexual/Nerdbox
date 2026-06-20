/* Paired Associates — Cambridge PAL. Boxes sit at fixed spots around the screen.
   Each STAGE hides K distinct glyphs inside K of the boxes (K = stage: 1, 2, 3, …).
   Presentation: the boxes open one at a time (~1.2s) revealing what's inside —
   memorise which glyph went in which box. Recall: each glyph is shown ONE AT A TIME
   in the centre; click the box where it was hidden. Correct → continue; wrong →
   error, re-present the locations once, retry the recall for this stage (up to 2
   retries). Still failing → the run ends. Metric = highest stage completed.
   scoreMode "max" = highest stage. Self-contained: one injectStyle + one register. */
NERDBOX.injectStyle("pal", `
.pal-wrap { position: relative; width: 100%; max-width: 460px; margin: 0 auto; }
.pal-board {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  max-height: 460px;
}
.pal-box {
  position: absolute;
  width: 26%;
  aspect-ratio: 1 / 1;
  transform: translate(-50%, -50%);
  border: 2px solid var(--sub-alt);
  border-radius: 12px;
  background: var(--bg-alt);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.08s ease;
}
.pal-box svg { width: 64%; height: 64%; display: block; opacity: 0; transition: opacity 0.18s ease; }
.pal-box.open { border-color: var(--accent); box-shadow: 0 0 18px color-mix(in srgb, var(--accent) 45%, transparent); }
.pal-box.open svg { opacity: 1; }
.pal-board.pickable .pal-box { cursor: pointer; }
.pal-board.pickable .pal-box:hover { transform: translate(-50%, -50%) scale(1.05); }
.pal-box.good { border-color: var(--go); box-shadow: 0 0 18px color-mix(in srgb, var(--go) 50%, transparent); }
.pal-box.good svg { opacity: 1; }
.pal-box.bad { border-color: var(--error); box-shadow: 0 0 18px color-mix(in srgb, var(--error) 55%, transparent); }
.pal-cue {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 24%;
  aspect-ratio: 1 / 1;
  transform: translate(-50%, -50%);
  display: none;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  pointer-events: none;
  z-index: 2;
}
.pal-cue.show { display: flex; }
.pal-cue svg { width: 70%; height: 70%; color: var(--caret); }
.pal-glyph { fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.pal-bar {
  display: flex;
  gap: 1.6rem;
  justify-content: center;
  font-family: "JetBrains Mono", monospace;
  color: var(--sub);
  font-size: 0.95rem;
  margin-bottom: 1rem;
  min-height: 1.4em;
}
.pal-bar b { color: var(--text); font-weight: 500; }
.pal-bar .pal-msg { color: var(--accent); }
.pal-bar .pal-err { color: var(--error); }
`);

NERDBOX.register({
  id: "pal",
  name: "Paired Associates",
  tagline: "which box hid which pattern",
  category: "memory",
  test: true,
  scoreMode: "max",
  formatScore: function (v) { return "stage " + v; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="13" width="7" height="7" rx="1.5"/><path d="M17 4l1.6 3.4L22 8l-2.6 2.2.7 3.6L17 12l-3.1 1.8.7-3.6L12 8l3.4-.6z"/></svg>',
  mount: function (root, ctx) {
    var el = ctx.util.el;
    var shuffle = ctx.util.shuffle;

    /* ---- config ---- */
    var BOX_COUNT = 6;          // boxes arranged around the screen
    var OPEN_MS = 1200;         // how long each box stays open during presentation
    var GAP_MS = 220;           // pause between one box closing and the next opening
    var CUE_GAP_MS = 650;       // pause before showing the next recall cue
    var MAX_RETRIES = 2;        // retries of a stage after a wrong placement

    // Fixed box positions (percent of the square board), arranged around the edges.
    var SPOTS = [
      { x: 22, y: 20 }, { x: 78, y: 20 },
      { x: 14, y: 55 }, { x: 86, y: 55 },
      { x: 32, y: 86 }, { x: 68, y: 86 }
    ];

    // Abstract glyphs (inner SVG markup, drawn in a 0..40 viewBox). One per pattern.
    var GLYPHS = [
      '<polygon class="pal-glyph" points="20,4 36,32 4,32"/>',
      '<rect class="pal-glyph" x="7" y="7" width="26" height="26" rx="3"/>',
      '<circle class="pal-glyph" cx="20" cy="20" r="14"/>',
      '<polygon class="pal-glyph" points="20,4 36,20 20,36 4,20"/>',
      '<path class="pal-glyph" d="M20 4l4.7 10.3L36 16l-8 7.6L30 35l-10-5.6L10 35l2-11.4L4 16l11.3-1.7z"/>',
      '<path class="pal-glyph" d="M6 20a14 14 0 0 1 28 0 14 14 0 0 1-28 0M14 20h12M20 14v12"/>',
      '<path class="pal-glyph" d="M8 8h24v24h-24z M8 20h24 M20 8v24"/>',
      '<path class="pal-glyph" d="M20 4l16 28H4z M20 16v8"/>',
      '<path class="pal-glyph" d="M10 10l20 20 M30 10l-20 20"/>',
      '<polygon class="pal-glyph" points="20,5 33,14 28,30 12,30 7,14"/>'
    ];

    function glyphSvg(idx) {
      return '<svg viewBox="0 0 40 40" aria-hidden="true">' + GLYPHS[idx % GLYPHS.length] + '</svg>';
    }

    /* ---- state ---- */
    var stage = 1;            // current stage (= K patterns to place)
    var lastCleared = 0;      // highest stage fully completed (score floor)
    var pairs = [];           // [{ box: boxIndex, glyph: glyphIndex }] for this stage
    var cueOrder = [];        // order pairs are quizzed in (indices into `pairs`)
    var cuePos = 0;           // which cue we're on in the recall phase
    var retries = 0;          // wrong placements used so far this stage
    var pickable = false;     // recall phase accepting box clicks
    var finished = false;     // run over — ignore late input
    var chainTimer = null;    // THE single active timer handle (presentation chain / pauses)

    /* ---- layout ---- */
    var bar = el("div", "pal-bar");
    var wrap = el("div", "pal-wrap");
    var board = el("div", "pal-board");
    var cue = el("div", "pal-cue");
    var overlay = el("div", "g-overlay");

    var boxes = [];
    for (var i = 0; i < BOX_COUNT; i++) {
      var b = el("button", "pal-box");
      b.type = "button";
      b.dataset.box = i;
      b.style.left = SPOTS[i].x + "%";
      b.style.top = SPOTS[i].y + "%";
      b.setAttribute("aria-label", "box");
      b.appendChild(el("span", null, ""));  // glyph holder (kept simple; replaced per stage)
      b.addEventListener("click", onBoxClick);
      board.appendChild(b);
      boxes.push(b);
    }
    board.appendChild(cue);
    wrap.appendChild(board);
    wrap.appendChild(overlay);
    root.appendChild(bar);
    root.appendChild(wrap);

    /* ---- single tracked timer (so a mid-sequence unmount can cancel it) ---- */
    function clearChain() {
      if (chainTimer !== null) { clearTimeout(chainTimer); chainTimer = null; }
    }
    // schedule fn as THE active timer; it clears its own handle before running
    function after(ms, fn) {
      clearChain();
      chainTimer = setTimeout(function () { chainTimer = null; fn(); }, ms);
    }

    function setMsg(html) { bar.innerHTML = html; }
    function statusBar(extra) {
      setMsg(
        "<span>stage&nbsp;<b>" + stage + "</b></span>" +
        "<span>patterns&nbsp;<b>" + stage + "</b></span>" +
        (extra ? "<span class=\"pal-err\">" + extra + "</span>" : "")
      );
    }

    function clearBoxStates() {
      for (var i = 0; i < boxes.length; i++) {
        boxes[i].classList.remove("open", "good", "bad");
        var holder = boxes[i].firstChild;
        if (holder) holder.innerHTML = "";
      }
    }
    function setPickable(on) {
      pickable = on;
      if (on) board.classList.add("pickable");
      else board.classList.remove("pickable");
    }
    function hideCue() { cue.classList.remove("show"); cue.innerHTML = ""; }

    /* ---- build a stage: pick K boxes + K distinct glyphs ---- */
    function buildStage() {
      var k = Math.min(stage, BOX_COUNT);
      var boxPick = shuffle(rangeArr(BOX_COUNT)).slice(0, k);
      var glyphPick = shuffle(rangeArr(GLYPHS.length)).slice(0, k);
      pairs = [];
      for (var i = 0; i < k; i++) pairs.push({ box: boxPick[i], glyph: glyphPick[i] });
    }
    function rangeArr(n) {
      var a = [];
      for (var i = 0; i < n; i++) a.push(i);
      return a;
    }

    // build a fresh layout for the current stage, then present it (start / advance)
    function enterStage() {
      buildStage();
      presentStage();
    }

    /* ---- presentation: open the boxes one at a time, revealing contents.
       Re-presents the EXISTING layout, so a retry shows the same boxes again. ---- */
    function presentStage() {
      clearChain();
      setPickable(false);
      hideCue();
      clearBoxStates();
      statusBar();
      after(GAP_MS, function () { openSequence(0); });
    }

    // open box for SPOTS index `step`; an empty box just pulses, a paired box shows its glyph
    function openSequence(step) {
      if (step >= BOX_COUNT) { after(CUE_GAP_MS, beginRecall); return; }
      var boxIdx = step;
      var pair = pairForBox(boxIdx);
      var box = boxes[boxIdx];
      box.classList.add("open");
      if (pair) box.firstChild.innerHTML = glyphSvg(pair.glyph);
      after(OPEN_MS, function () {
        box.classList.remove("open");
        box.firstChild.innerHTML = "";
        after(GAP_MS, function () { openSequence(step + 1); });
      });
    }
    function pairForBox(boxIdx) {
      for (var i = 0; i < pairs.length; i++) if (pairs[i].box === boxIdx) return pairs[i];
      return null;
    }

    /* ---- recall: show each glyph in the centre, player clicks its box ---- */
    function beginRecall() {
      clearChain();
      clearBoxStates();
      cueOrder = shuffle(rangeArr(pairs.length));
      cuePos = 0;
      showCue();
    }

    function showCue() {
      if (cuePos >= cueOrder.length) { stageSolved(); return; }
      var pair = pairs[cueOrder[cuePos]];
      cue.innerHTML = glyphSvg(pair.glyph);
      cue.classList.add("show");
      setMsg(
        "<span>stage&nbsp;<b>" + stage + "</b></span>" +
        "<span class=\"pal-msg\">where was this? (" + (cuePos + 1) + "/" + cueOrder.length + ")</span>"
      );
      setPickable(true);
    }

    function onBoxClick() {
      if (finished || !pickable) return;
      var clicked = Number(this.dataset.box);
      var pair = pairs[cueOrder[cuePos]];
      setPickable(false);

      if (clicked === pair.box) {
        // correct placement: confirm, reveal the glyph in its box, advance
        this.classList.add("good");
        this.firstChild.innerHTML = glyphSvg(pair.glyph);
        hideCue();
        after(CUE_GAP_MS, function () {
          var box = boxes[pair.box];
          box.classList.remove("good");
          box.firstChild.innerHTML = "";
          cuePos++;
          showCue();
        });
      } else {
        // wrong placement: mark the error, then re-present the whole stage and retry
        this.classList.add("bad");
        retries++;
        hideCue();
        if (retries > MAX_RETRIES) {
          after(CUE_GAP_MS, gameOver);
        } else {
          setMsg(
            "<span>stage&nbsp;<b>" + stage + "</b></span>" +
            "<span class=\"pal-err\">not there — watch again (retry " + retries + "/" + MAX_RETRIES + ")</span>"
          );
          after(900, presentStage);
        }
      }
    }

    /* ---- stage complete: all K placed correctly ---- */
    function stageSolved() {
      clearChain();
      setPickable(false);
      hideCue();
      lastCleared = stage;
      setMsg(
        "<span>stage&nbsp;<b>" + stage + "</b></span>" +
        "<span class=\"pal-msg\">stage cleared ✓</span>"
      );
      after(900, function () {
        stage++;
        if (stage > BOX_COUNT) { winRun(); return; }  // ran out of boxes — perfect run
        retries = 0;
        enterStage();   // fresh layout for the new, larger stage
      });
    }

    /* ---- end states ---- */
    function endRun(big, sub) {
      finished = true;
      clearChain();
      setPickable(false);
      hideCue();
      clearBoxStates();
      ctx.submitScore(lastCleared);   // the ONE score submission: highest stage reached
      overlay.innerHTML =
        '<div class="g-result">' +
        '<div class="g-big">' + big + '</div>' +
        '<div class="g-sub">' + sub + '</div>' +
        '<button class="g-btn" type="button">retake</button>' +
        '</div>';
      overlay.querySelector("button").addEventListener("click", startTest);
      overlay.classList.add("show");
    }
    function gameOver() {
      endRun("stage " + lastCleared, "highest stage reached");
    }
    function winRun() {
      endRun("stage " + lastCleared, "perfect — every box used");
    }

    /* ---- run control ---- */
    function startTest() {
      finished = false;
      clearChain();
      overlay.classList.remove("show");
      overlay.innerHTML = "";
      stage = 1;
      lastCleared = 0;
      retries = 0;
      enterStage();
    }

    /* ---- idle preview behind the start overlay ---- */
    function showStart() {
      buildStage();
      // open the single stage-1 box as a still preview
      clearBoxStates();
      for (var i = 0; i < pairs.length; i++) {
        boxes[pairs[i].box].classList.add("open");
        boxes[pairs[i].box].firstChild.innerHTML = glyphSvg(pairs[i].glyph);
      }
      statusBar();
      overlay.innerHTML =
        '<div class="g-result">' +
        '<div class="g-sub">boxes open one by one, hiding patterns. then each pattern ' +
        'appears in the middle — click the box it was in. clear a stage and the next ' +
        'hides one more. two wrong tries on a stage ends the test.</div>' +
        '<button class="g-btn" type="button">start</button>' +
        '</div>';
      overlay.querySelector("button").addEventListener("click", startTest);
      overlay.classList.add("show");
    }

    showStart();

    /* ---- teardown: cancel the active box-opening / pause timer + drop every listener ---- */
    return function () {
      finished = true;
      clearChain();                                   // cancels the in-flight presentation/pause timer
      for (var i = 0; i < boxes.length; i++) {
        boxes[i].removeEventListener("click", onBoxClick);
      }
      var btn = overlay.querySelector("button");
      if (btn) btn.removeEventListener("click", startTest);
    };
  }
});
