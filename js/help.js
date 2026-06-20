/* ============================================================
   help.js — how-to-play (description + worked example) per game.
   app.js renders NERDBOX_HELP[id] above each game.
   `how` and `example` are trusted HTML (authored here).
   ============================================================ */
window.NERDBOX_HELP = {
  /* ---- reflexes ---- */
  reaction: {
    how: "Wait for the screen to turn green, then click as fast as you can. Click too early and it resets.",
    example: "It flashes <b>red</b>… hold… <b>green</b> → click the instant it's green."
  },
  aim: {
    how: "Click the targets the moment they appear. Pop all 30 — your score is the average time per target (lower is better).",
    example: "A circle pops up bottom-left → snap to it and click, then the next appears."
  },
  timeperception: {
    how: "Click to start an invisible clock, then click again to stop it at the target time — with no timer to watch.",
    example: "Target <b>5.0s</b> → click start, count it out in your head, click stop. Closest wins."
  },

  /* ---- memory ---- */
  memory: {
    how: "A number flashes, then disappears — type it back. One more digit every round.",
    example: "Shown briefly: <code>4 8 1 5</code> → type <code>4815</code>."
  },
  sequence: {
    how: "Watch the tiles light up in order, then repeat the pattern by clicking them. It grows by one each round.",
    example: "Tiles flash top-left → bottom-right → click those two, in that order."
  },
  chimp: {
    how: "Numbers appear on the grid, then hide. Click the tiles in order: 1, 2, 3… More numbers each round.",
    example: "You see <code>1 2 3 4</code>, they vanish → click where 1 was, then 2, 3, 4."
  },
  nback: {
    how: "Letters appear one at a time. Press MATCH whenever the current letter is the same as the one <b>2 letters ago</b>.",
    example: "<code>K … R … K</code> → that second <b>K</b> matches the one 2 back → press MATCH."
  },
  visualmemory: {
    how: "Some tiles flash, then go blank. Click exactly the tiles that lit up. Three lives; the board grows each level.",
    example: "Three tiles flash for a second → reclick those three from memory."
  },
  verbalmemory: {
    how: "One word at a time — say whether you've <b>SEEN</b> it already this run, or it's <b>NEW</b>. Three lives.",
    example: "First time you see <code>orbit</code> → NEW. If <code>orbit</code> shows up again later → SEEN."
  },

  /* ---- attention ---- */
  stroop: {
    how: "Click the button matching the <b>ink colour</b> of the word — ignore what the word actually says.",
    example: "The word <span style='color:#e64b4b'>GREEN</span> printed in red → answer <b>red</b>."
  },
  trailmaking: {
    how: "Click the scattered nodes in alternating order — 1, A, 2, B, 3, C… — as fast as you can.",
    example: "Find <code>1 → A → 2 → B → 3 → C</code> … to the last node. Fastest time wins."
  },
  gonogo: {
    how: "Tap the pad when you see <b>green</b> (go). Do <b>not</b> tap on <b>red</b> (no-go) — freeze your finger.",
    example: "Green circle appears → tap fast. Red circle appears → hold still, don't tap."
  },

  /* ---- reasoning ---- */
  numseq: {
    how: "Figure out the pattern and type the next number in the sequence.",
    example: "<code>2, 4, 8, 16, ?</code> → the rule is ×2, so type <code>32</code>."
  },
  rotation: {
    how: "Is the right-hand shape the left one just <b>rotated</b>, or has it been <b>mirrored</b> (flipped)?",
    example: "Same shape turned 90° → <b>Same</b>. A mirror-image of it → <b>Mirrored</b>."
  },
  mathsprint: {
    how: "Solve as many arithmetic problems as you can in 60 seconds. Type the answer and hit enter.",
    example: "<code>7 × 8 =</code> → type <code>56</code>, enter, next one appears."
  },
  logicgate: {
    how: "Read the truth table, then pick the logic gate that produces that exact output column.",
    example: "Output <code>0, 0, 0, 1</code> (only true when both inputs are 1) → <b>AND</b>."
  },
  lightsout: {
    how: "Click a cell to toggle it <i>and</i> its four neighbours. Goal: turn every light off.",
    example: "Click a lit cell → it and the cells above/below/left/right all flip on or off."
  },

  /* ---- perception ---- */
  colormatch: {
    how: "Every tile is the same colour except one. Click the odd shade out — it gets subtler each round.",
    example: "A grid of teal squares, one a touch greener → click that one."
  },
  hexle: {
    how: "Guess the target colour's R, G, B values. After each guess you get warmer/colder hints per channel.",
    example: "Guess <code>120, 200, 80</code> → R <b>▲</b> (go higher), G <b>✓</b>, B <b>▼</b> (go lower)."
  },
  estimate: {
    how: "A burst of dots flashes for a split second, then vanishes — estimate how many there were.",
    example: "A cluster flashes → you guess about <code>24</code>. Within ~15% counts as correct."
  },

  /* ---- language ---- */
  devle: {
    how: "Wordle, but every answer is a 5-letter dev word. Green = right spot, amber = wrong spot, grey = not in the word.",
    example: "Guess <code>async</code> → each letter colours by how it matches the hidden word. Six tries."
  },
  anagram: {
    how: "Unscramble the jumbled letters back into the word. Solve as many as you can in 60 seconds.",
    example: "<code>t c a c h</code> → <code>catch</code>."
  },

  /* ---- dev brain ---- */
  guesslang: {
    how: "A code snippet flashes — pick which programming language it is before the timer runs out.",
    example: "<code>def greet(): pass</code> → answer <b>Python</b>."
  },
  regex: {
    how: "Type a regular expression that matches <b>every</b> green string and rejects <b>every</b> red one.",
    example: "match: <code>cat, car</code> · reject: <code>dog</code> → <code>^ca</code> clears the level."
  },
  shortcut: {
    how: "An action flashes — press its real keyboard shortcut as fast as you can (VS Code bindings).",
    example: "<code>comment line</code> → press <b>Ctrl + /</b>."
  },
  git: {
    how: "Read the scenario and type the correct git command. Multiple valid forms are accepted.",
    example: "<code>stage all changes</code> → <code>git add .</code>"
  },
  query: {
    how: "Write a SQL query that returns the answer to the question. It runs against the table in your browser.",
    example: "<code>users older than 30</code> → <code>SELECT name FROM users WHERE age &gt; 30</code>"
  },
  cssduel: {
    how: "Use the sliders and colour swatches to recreate the target shape as closely as you can.",
    example: "Target is a wide, rounded, tilted box → match its width, height, radius, rotation & colour."
  },
  connections: {
    how: "Sort the 16 terms into 4 hidden groups of 4. Select four, then submit. Four mistakes and you're out.",
    example: "<code>map · filter · reduce · slice</code> → the group “JS array methods”."
  },

  /* ---- hard tier ---- */
  dualnback: {
    how: "Two streams at once: a tile lights up in the grid <b>and</b> a letter shows. Hit POSITION if the tile is in the same cell as 2 trials ago; hit LETTER if the letter matches 2 trials ago. Either, both, or neither can match.",
    example: "Tile was top-left two trials ago and it's top-left again now → press <b>POSITION</b>."
  },
  schulte: {
    how: "Find and click the numbers in order — 1, 2, 3 … — as fast as you can. Clear a grid and it grows bigger.",
    example: "A 5×5 of jumbled 1–25 → click 1, then 2, then 3… up to 25, then it becomes 6×6."
  },
  matrix: {
    how: "The 3×3 grid of shapes follows a hidden rule. Pick the tile that correctly completes the bottom-right cell.",
    example: "If each row adds one more shape (1, 2, 3…) → choose the option that continues the count."
  },
  mastermind: {
    how: "Crack the hidden 4-colour code by deduction. After each guess: ● = right colour <i>and</i> spot, ○ = right colour, wrong spot. 10 tries.",
    example: "Feedback ●●○ → two pegs are exactly right, and one more colour is right but in the wrong place."
  },
  reversespan: {
    how: "A number flashes, then hides — type it <b>backwards</b>. One more digit every round.",
    example: "Shown <code>3 7 1</code> → type <code>173</code>."
  },
  make24: {
    how: "Use all four numbers, each exactly once, with + − × ÷ and parentheses to make exactly 24.",
    example: "<code>3, 3, 8, 4</code> → <code>(3 + 3) × (8 − 4)</code> = 24."
  },
  cryptogram: {
    how: "Every letter has been swapped for another. Work out the substitution and decode the phrase — one letter is given free.",
    example: "If <code>X</code> always stands for <code>E</code>, type E under every X and keep deducing."
  },
  hanoi: {
    how: "Move the whole stack to the right peg, one disk at a time — and never place a bigger disk on a smaller one.",
    example: "Click a peg to lift its top disk, click another peg to drop it. Each extra disk doubles the work."
  },

  /* ---- wave 1: hearing, motor, social, spatial ---- */
  pitchmatch: {
    how: "A target tone plays — slide to match its pitch, then submit. (Headphones help.)",
    example: "Hear the target, drag the slider until your tone sounds the same, hit submit."
  },
  soundreaction: {
    how: "Click the instant you <b>hear</b> the beep — there's no visual cue, just sound.",
    example: "Silence… <b>beep!</b> → click as fast as you can."
  },
  rhythmecho: {
    how: "Listen to a rhythm, then tap it back with the same timing. It grows each round.",
    example: "Hear <code>tap·tap—tap</code> → reproduce that spacing on the pad."
  },
  steadyhand: {
    how: "Guide your cursor from start to end without touching the corridor walls.",
    example: "Ease through the winding path — one touch of a wall and you restart."
  },
  pursuit: {
    how: "Keep your cursor glued to the moving dot for 15 seconds — score is your % on target.",
    example: "The dot wanders around; stay on it (it glows green while you are)."
  },
  taptempo: {
    how: "Tap a perfectly even beat at any speed. Your score is how consistent the spacing is.",
    example: "Tap… tap… tap… keep every gap identical for 12 taps."
  },
  intercept: {
    how: "A dot moves, then vanishes mid-flight. Click where it <b>will</b> be — lead it.",
    example: "It disappears still moving right → click ahead of where it vanished."
  },
  rat: {
    how: "Find the single word that links all three (a compound or strong association).",
    example: "<code>cottage · swiss · cake</code> → <b>cheese</b>."
  },
  reademotion: {
    how: "Read the face and pick the emotion it's showing.",
    example: "Raised brows + wide eyes + open mouth → <b>surprised</b>."
  },
  maze: {
    how: "Navigate from the top-left to the exit with the arrow keys. Mazes grow each level.",
    example: "Use <code>← ↑ → ↓</code> to reach the bottom-right exit, fast."
  },
  angle: {
    how: "Estimate the line's angle in degrees — 0° points right, 90° up, 180° left.",
    example: "A ray pointing up-left → about <code>135</code>°."
  },
  bisect: {
    how: "Click the exact midpoint of the line — no measuring.",
    example: "A line stretches across the stage → click dead centre."
  },
  symmetry: {
    how: "Is the pattern left-right mirror-symmetric? Decide fast, for 60 seconds.",
    example: "The left half mirrors the right → <b>symmetric</b>."
  },
  numberline: {
    how: "Click where the target number belongs on the line.",
    example: "Line 0–100, target <code>70</code> → click about 70% along."
  },
  visualsearch: {
    how: "Find the one item that's different from all the rest, and click it.",
    example: "Lots of <code>L</code>s, one <code>T</code> → click the T."
  },
  changeblind: {
    how: "Two grids flicker with a blank between — click the one cell that keeps changing.",
    example: "Flash… blank… flash → one square swaps colour each time; spot it."
  }
};
