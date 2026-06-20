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

| Game | Category | Test your… |
| --- | --- | --- |
| **Reaction Time** | reflex | how fast you click when it turns green |
| **Aim Trainer** | reflex | speed + precision popping targets |
| **Sequence Memory** | memory | recalling a growing pattern (Simon) |
| **Chimp Test** | memory | remembering numbers' positions |
| **Number Memory** | memory | how many digits you can hold |
| **Guess the Language** | knowledge | spotting a language from a snippet |
| **Color Match** | knowledge | finding the odd shade out |

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
├── css/style.css        # design system + every game's UI
└── js/
    ├── themes.js        # theme registry
    ├── core.js          # game registry + best-score storage
    ├── app.js           # hub + hash router + theme wiring
    └── games/
        ├── reaction.js   aim.js        sequence.js
        ├── chimp.js      memory.js     guesslang.js
        └── colormatch.js links.js
```

### Adding a game

Drop a new file in `js/games/`, add a `<script>` tag in `index.html`, and register it:

```js
NERDBOX.register({
  id: "mygame",
  name: "My Game",
  tagline: "what it tests",
  category: "reflex",        // reflex | memory | knowledge
  scoreMode: "max",          // "max" (higher better) or "min" (lower better, e.g. ms)
  formatScore: function (v) { return v + " pts"; },
  icon: "<svg>…</svg>",
  mount: function (root, ctx) {
    // build your UI inside `root`. call ctx.submitScore(n) to record a score.
    return function teardown() { /* clear timers/listeners */ };
  }
});
```

The hub, best-score tracking, theming, and routing are all handled for you.

## Deployment

Served from the repo root on **GitHub Pages** — no build. To host your own fork:
**Settings → Pages → Source → Deploy from a branch → `main` · `/ (root)`.**

## Sibling project

🐒 [**Codemonkey**](https://github.com/fizzexual/Codemonkey) — Monkeytype, but for code. (Also in the box.)

## License

[MIT](LICENSE) © fizzexual
