/* ============================================================
   app.js — hub renderer + hash router + theme wiring
   Loads last (after all games have registered).
   ============================================================ */
(function () {
  "use strict";
  var Themes = window.NerdboxThemes;
  var view = document.getElementById("view");
  var teardown = null;

  /* ---------- theme ---------- */
  function initTheme() {
    var sel = document.getElementById("theme-select");
    Themes.list.forEach(function (t) {
      var o = document.createElement("option");
      o.value = t.id; o.textContent = t.name;
      sel.appendChild(o);
    });
    var theme = Themes.load();
    Themes.apply(theme);
    sel.value = theme;
    sel.addEventListener("change", function (e) { Themes.apply(e.target.value); e.target.blur(); });
  }

  /* ---------- hub ---------- */
  var CATEGORIES = [
    { id: "reflex", name: "reflexes" },
    { id: "memory", name: "memory" },
    { id: "attention", name: "attention" },
    { id: "reasoning", name: "reasoning" },
    { id: "perception", name: "perception" },
    { id: "language", name: "language" },
    { id: "dev", name: "dev brain" }
  ];
  // presentation-layer grouping into brain faculties (overrides a game's own category)
  var CAT_OVERRIDE = {
    guesslang: "dev", regex: "dev", shortcut: "dev", git: "dev", query: "dev",
    cssduel: "dev", connections: "dev", codemonkey: "dev",
    colormatch: "perception", hexle: "perception",
    devle: "language", logicgate: "reasoning", lightsout: "reasoning"
  };
  function catOf(g) { return CAT_OVERRIDE[g.id] || g.category; }

  function clearGame() {
    if (teardown) { try { teardown(); } catch (e) {} teardown = null; }
    view.innerHTML = "";
  }

  function cardHtml(g) {
    var sub, href, attrs = "";
    if (g.external) {
      sub = "open ↗"; href = g.url; attrs = ' target="_blank" rel="noopener"';
    } else {
      var best = NERDBOX.getBest(g.id);
      sub = "best: " + (best === null ? "—" : g.formatScore(best));
      href = "#/" + g.id;
    }
    return '<a class="card" href="' + href + '"' + attrs + '>' +
      '<div class="card-icon">' + (g.icon || "") + "</div>" +
      '<div class="card-body">' +
        '<div class="card-name">' + g.name + "</div>" +
        '<div class="card-tag">' + g.tagline + "</div>" +
      "</div>" +
      '<div class="card-foot"><span class="card-best">' + sub + "</span>" +
        (g.difficulty ? '<span class="card-diff card-diff-' + g.difficulty + '">' + g.difficulty + "</span>" : "") +
      "</div>" +
      "</a>";
  }

  function renderHub() {
    clearGame();
    document.body.classList.remove("in-game");
    var html = '<div class="hub-intro"><h1>pick your poison</h1>' +
      '<p>tiny games to test your reflexes, memory, and dev brain. beat your best.</p></div>';
    CATEGORIES.forEach(function (cat) {
      var inCat = NERDBOX.games.filter(function (g) { return catOf(g) === cat.id; });
      if (!inCat.length) return;
      html += '<section class="hub-section"><h2 class="hub-cat">' + cat.name + "</h2>" +
        '<div class="hub-grid">' + inCat.map(cardHtml).join("") + "</div></section>";
    });
    var other = NERDBOX.games.filter(function (g) {
      return CATEGORIES.map(function (c) { return c.id; }).indexOf(catOf(g)) < 0;
    });
    if (other.length) {
      html += '<section class="hub-section"><h2 class="hub-cat">more</h2>' +
        '<div class="hub-grid">' + other.map(cardHtml).join("") + "</div></section>";
    }
    view.innerHTML = html;
  }

  /* ---------- game screen ---------- */
  function openGame(id) {
    var g = NERDBOX.get(id);
    if (!g || g.external) { location.hash = "/"; return; }
    clearGame();
    document.body.classList.add("in-game");

    var head = document.createElement("div");
    head.className = "game-head";
    var best = NERDBOX.getBest(id);
    head.innerHTML =
      '<a class="back" href="#/">&lsaquo; all games</a>' +
      '<div class="game-title">' + g.name + "</div>" +
      '<div class="game-best" id="game-best">best&nbsp;<b>' + (best === null ? "—" : g.formatScore(best)) + "</b></div>";

    var root = document.createElement("div");
    root.className = "game-root";

    view.appendChild(head);

    var help = window.NERDBOX_HELP && window.NERDBOX_HELP[id];
    if (help) {
      var helpEl = document.createElement("div");
      helpEl.className = "game-help";
      helpEl.innerHTML =
        '<div class="help-how"><span class="help-label">how to play</span>' + help.how + "</div>" +
        (help.example ? '<div class="help-eg"><span class="help-label eg">example</span>' + help.example + "</div>" : "");
      view.appendChild(helpEl);
    }

    view.appendChild(root);

    var ctx = {
      util: NERDBOX.util,
      themeColor: Themes.color,
      submitScore: function (v) {
        var isBest = NERDBOX.setBest(id, v);
        var el = document.getElementById("game-best");
        if (el) {
          var b = NERDBOX.getBest(id);
          el.innerHTML = "best&nbsp;<b>" + (b === null ? "—" : g.formatScore(b)) + "</b>";
          if (isBest) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
        }
        return isBest;
      }
    };
    teardown = g.mount(root, ctx) || null;
  }

  /* ---------- router ---------- */
  function route() {
    var h = (location.hash || "").replace(/^#\/?/, "");
    if (!h) renderHub();
    else openGame(h);
    window.scrollTo(0, 0);
  }

  function init() {
    initTheme();
    window.addEventListener("hashchange", route);
    route();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
