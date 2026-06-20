<div align="center">

<img src="https://fizzexual.github.io/Nerdbox/og-image.svg" alt="nerdbox — a playground of skill games for nerds" width="100%" />

# 🤓 nerdbox

**A playground of tiny skill-test games.** Reaction, memory, aim, dev trivia — jump in,
mess around, and see how good you actually are. No sign-up, no backend, no nonsense.

### [▶ Play it live](https://fizzexual.github.io/Nerdbox/)

[![live demo](https://img.shields.io/badge/live-demo-e2b714?style=flat-square)](https://fizzexual.github.io/Nerdbox/)
![no build step](https://img.shields.io/badge/build-none-4b4d50?style=flat-square)
![vanilla js](https://img.shields.io/badge/vanilla-JS-f7df1e?style=flat-square&labelColor=323437)
![dependencies](https://img.shields.io/badge/dependencies-0-88c0d0?style=flat-square)
[![license: MIT](https://img.shields.io/badge/license-MIT-bd93f9?style=flat-square)](LICENSE)

<br>

⭐ **If you enjoy it, a star helps a lot** — I'm a student, and it genuinely makes a difference.

</div>

---

## The games

**⚡ Reflex**
| Game | Test your… |
| --- | --- |
| **Reaction Time** | how fast you click when it turns green |
| **Aim Trainer** | speed + precision popping 30 targets |

**🧠 Memory**
| Game | Test your… |
| --- | --- |
| **Sequence Memory** | recalling a growing pattern (Simon) |
| **Chimp Test** | remembering numbers' positions |
| **Number Memory** | how many digits you can hold |

**📚 Knowledge**
| Game | Test your… |
| --- | --- |
| **Guess the Language** | naming a language from a snippet |
| **Regex Rumble** | writing a regex that matches the greens, rejects the reds |
| **Shortcut Sensei** | firing the right keyboard shortcut, fast |
| **Git Gauntlet** | typing the correct git command for a scenario |
| **Query Quick** | writing SQL to answer a question (runs in-browser) |
| **CSS Duel** | recreating a target shape with sliders |
| **Color Match** | finding the odd shade out |

**🧩 Puzzles**
| Game | Test your… |
| --- | --- |
| **Hexle** | guessing a hex color from warmer/colder hints |
| **Devle** | Wordle, but with 5-letter dev words |
| **Dev Connections** | grouping 16 dev terms into 4 hidden sets |
| **Gate Match** | naming the logic gate behind a truth table |
| **Lights Out** | turning off every light on the grid |

That's **17 games** (plus a link to the sibling project, [Codemonkey](https://fizzexual.github.io/Codemonkey/)).
Every game tracks your **personal best** locally (in `localStorage`, private to your device),
and the whole thing themes itself — 7 palettes, remembered between visits.

## Run it locally

It's a static site — nothing to install or build.

```bash
git clone https://github.com/fizzexual/Nerdbox.git
cd Nerdbox
python -m http.server 8000   # then visit http://localhost:8000
# …or just open index.html
```

## How it's built

Vanilla HTML/CSS/JS, no framework, no build step. The hub is a tiny single-page app with
hash routing; **each game is a self-contained file** that registers itself with the core:

```
Nerdbox/
├── index.html
├── css/style.css        # design system + the core games' UI
└── js/
    ├── themes.js        # theme registry
    ├── core.js          # game registry + best-score storage + injectStyle()
    ├── app.js           # hub + hash router + theme wiring
    └── games/           # one file per game, each self-registering
        ├── reaction.js   aim.js         sequence.js   chimp.js
        ├── memory.js     guesslang.js   colormatch.js regex.js
        ├── shortcut.js   git.js         query.js      cssduel.js
        ├── hexle.js      devle.js       connections.js
        ├── logicgate.js  lightsout.js   links.js
```

### Adding a game

Drop a new file in `js/games/`, add a `<script>` tag in `index.html`, and register it:

```js
// optional: keep the game self-contained by injecting its own CSS
NERDBOX.injectStyle("mygame", `.mygame-tile { background: var(--accent); }`);

NERDBOX.register({
  id: "mygame",
  name: "My Game",
  tagline: "what it tests",
  category: "reflex",        // reflex | memory | knowledge | puzzle
  scoreMode: "max",          // "max" (higher better) or "min" (lower better, e.g. ms)
  formatScore: function (v) { return v + " pts"; },
  icon: "<svg>…</svg>",
  mount: function (root, ctx) {
    // build your UI inside `root`. call ctx.submitScore(n) to record a score.
    return function teardown() { /* clear timers/listeners */ };
  }
});
```

The hub, best-score tracking, theming, and routing are all handled for you. `ctx` gives you
`util.el/rand/shuffle`, `submitScore(n)`, and `themeColor(var)`.

## Deployment

Served from the repo root on **GitHub Pages** — no build. To host your own fork:
**Settings → Pages → Source → Deploy from a branch → `main` · `/ (root)`.**

## Sibling project

🐒 [**Codemonkey**](https://github.com/fizzexual/Codemonkey) — Monkeytype, but for code. (Also in the box.)

## License

[MIT](LICENSE) © fizzexual
