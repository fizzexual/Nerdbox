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
  }
};
