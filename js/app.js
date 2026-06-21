/* ============================================================
   app.js — hub renderer + hash router + theme wiring
   Loads last (after all games have registered).
   ============================================================ */
(function () {
  "use strict";
  var Themes = window.NerdboxThemes;
  var view = document.getElementById("view");
  var teardown = null;
  var currentGameId = null;

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
    { id: "motor", name: "motor" },
    { id: "memory", name: "memory" },
    { id: "attention", name: "attention" },
    { id: "perception", name: "perception" },
    { id: "hearing", name: "hearing" },
    { id: "reasoning", name: "reasoning" },
    { id: "language", name: "language" },
    { id: "dev", name: "dev brain" }
  ];
  function catOf(g) { return NERDBOX.facultyOf(g); }

  function clearGame() {
    NERDBOX.stopTime();
    currentGameId = null;
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
    var ds = (g.name + " " + g.tagline).toLowerCase().replace(/"/g, "");
    return '<a class="card" href="' + href + '"' + attrs +
      ' data-search="' + ds + '" data-fac="' + catOf(g) + '" data-hard="' + (g.difficulty === "hard" ? "1" : "0") + '" data-extreme="' + (g.difficulty === "extreme" ? "1" : "0") + '" data-test="' + (g.test ? "1" : "0") + '">' +
      '<div class="card-icon">' + (g.icon || "") + "</div>" +
      '<div class="card-body">' +
        '<div class="card-name">' + g.name + "</div>" +
        '<div class="card-tag">' + g.tagline + "</div>" +
      "</div>" +
      '<div class="card-foot"><span class="card-best">' + sub + "</span>" +
        '<span class="card-badges">' +
          (g.test ? '<span class="card-test">🧪 test</span>' : "") +
          (g.difficulty ? '<span class="card-diff card-diff-' + g.difficulty + '">' + g.difficulty + "</span>" : "") +
        "</span>" +
      "</div>" +
      "</a>";
  }

  function renderHub() {
    clearGame();
    document.body.classList.remove("in-game");
    var html = (window.NERDBOX_DASH ? NERDBOX_DASH.dailyCardHtml() : "");
    html += '<div class="hub-toolbar">' +
      '<input id="hub-search" class="hub-search" type="search" placeholder="search games…" autocomplete="off" aria-label="search games" />' +
      '<div class="hub-filters">' +
        '<button class="hub-chip active" data-fac="all">all</button>' +
        CATEGORIES.map(function (c) { return '<button class="hub-chip" data-fac="' + c.id + '">' + c.name + "</button>"; }).join("") +
      "</div>" +
      '<div class="hub-tools">' +
        '<a class="hub-chip hub-test" href="#/test">🧠 brain test</a>' +
        '<button class="hub-chip" id="test-toggle">🧪 tests</button>' +
        '<button class="hub-chip" id="hard-toggle">🔥 hard</button>' +
        '<button class="hub-chip" id="extreme-toggle">☠️ extreme</button>' +
        '<button class="hub-chip" id="random-btn">🎲 surprise me</button>' +
      "</div>" +
    "</div>";
    html += '<div id="hub-sections">';
    CATEGORIES.forEach(function (cat) {
      var inCat = NERDBOX.games.filter(function (g) { return catOf(g) === cat.id; });
      if (!inCat.length) return;
      html += '<section class="hub-section" data-fac="' + cat.id + '"><h2 class="hub-cat">' + cat.name + "</h2>" +
        '<div class="hub-grid">' + inCat.map(cardHtml).join("") + "</div></section>";
    });
    var other = NERDBOX.games.filter(function (g) {
      return CATEGORIES.map(function (c) { return c.id; }).indexOf(catOf(g)) < 0;
    });
    if (other.length) {
      html += '<section class="hub-section" data-fac="other"><h2 class="hub-cat">more</h2>' +
        '<div class="hub-grid">' + other.map(cardHtml).join("") + "</div></section>";
    }
    html += "</div>";
    html += '<div class="hub-empty" id="hub-empty" hidden>no games match — try another search.</div>';
    view.innerHTML = html;
    wireHubToolbar();
  }

  function wireHubToolbar() {
    var search = "", fac = "all", hardOnly = false, extremeOnly = false, testOnly = false;
    var searchEl = document.getElementById("hub-search");
    var emptyEl = document.getElementById("hub-empty");
    function apply() {
      var anyVisible = false;
      view.querySelectorAll(".hub-section").forEach(function (sec) {
        var secVisible = false;
        sec.querySelectorAll(".card").forEach(function (c) {
          var okS = !search || (c.getAttribute("data-search") || "").indexOf(search) >= 0;
          var okF = fac === "all" || c.getAttribute("data-fac") === fac;
          var okH = !hardOnly || c.getAttribute("data-hard") === "1";
          var okE = !extremeOnly || c.getAttribute("data-extreme") === "1";
          var okT = !testOnly || c.getAttribute("data-test") === "1";
          var show = okS && okF && okH && okE && okT;
          c.style.display = show ? "" : "none";
          if (show) { secVisible = true; anyVisible = true; }
        });
        sec.style.display = secVisible ? "" : "none";
      });
      if (emptyEl) emptyEl.hidden = anyVisible;
    }
    if (searchEl) searchEl.addEventListener("input", function () { search = searchEl.value.trim().toLowerCase(); apply(); });
    view.querySelectorAll(".hub-filters .hub-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        view.querySelectorAll(".hub-filters .hub-chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        fac = chip.getAttribute("data-fac");
        apply();
      });
    });
    var hardBtn = document.getElementById("hard-toggle");
    if (hardBtn) hardBtn.addEventListener("click", function () { hardOnly = !hardOnly; hardBtn.classList.toggle("active", hardOnly); apply(); });
    var extremeBtn = document.getElementById("extreme-toggle");
    if (extremeBtn) extremeBtn.addEventListener("click", function () { extremeOnly = !extremeOnly; extremeBtn.classList.toggle("active", extremeOnly); apply(); });
    var testBtn = document.getElementById("test-toggle");
    if (testBtn) testBtn.addEventListener("click", function () { testOnly = !testOnly; testBtn.classList.toggle("active", testOnly); apply(); });
    var rnd = document.getElementById("random-btn");
    if (rnd) rnd.addEventListener("click", function () {
      var visible = [].slice.call(view.querySelectorAll(".card")).filter(function (c) { return c.style.display !== "none" && (c.getAttribute("href") || "").indexOf("#/") === 0; });
      if (!visible.length) return;
      location.hash = visible[Math.floor(Math.random() * visible.length)].getAttribute("href").replace(/^#/, "");
    });
  }

  function renderStats() {
    clearGame();
    document.body.classList.remove("in-game");
    if (window.NERDBOX_DASH) NERDBOX_DASH.renderProfile(view);
  }

  function renderBattery() {
    clearGame();
    document.body.classList.remove("in-game");
    if (window.NERDBOX_DASH) teardown = NERDBOX_DASH.startBattery(view);
  }

  function renderAchievements() {
    clearGame();
    document.body.classList.remove("in-game");
    if (window.NERDBOX_ACH) NERDBOX_ACH.renderPage(view);
  }

  function updateStreakChip() {
    var el = document.getElementById("streak-chip");
    if (!el) return;
    var s = NERDBOX.getStreak();
    el.hidden = s <= 0;
    if (s > 0) el.textContent = "🔥 " + s;
  }

  /* ---------- game screen ---------- */
  function openGame(id) {
    var g = NERDBOX.get(id);
    if (!g || g.external) { location.hash = "/"; return; }
    clearGame();
    NERDBOX.recordPlay();
    updateStreakChip();
    document.body.classList.add("in-game");
    currentGameId = id;
    NERDBOX.startTime(id);

    var head = document.createElement("div");
    head.className = "game-head";
    var best = NERDBOX.getBest(id);
    head.innerHTML =
      '<a class="back" href="#/">&lsaquo; all games</a>' +
      '<div class="game-title">' + g.name + "</div>" +
      '<div class="game-meta">' +
        '<div class="game-best" id="game-best">best&nbsp;<b>' + (best === null ? "—" : g.formatScore(best)) + "</b></div>" +
        '<div class="game-time">⏱ ' + NERDBOX.util.fmtTime(NERDBOX.getGamePlaytime(id)) + "</div>" +
      "</div>";

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
    else if (h === "stats") renderStats();
    else if (h === "test") renderBattery();
    else if (h === "achievements") renderAchievements();
    else openGame(h);
    window.scrollTo(0, 0);
  }

  function init() {
    initTheme();
    if (window.NERDBOX_DASH) NERDBOX_DASH.initDaily();
    updateStreakChip();
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) NERDBOX.stopTime();
      else if (currentGameId && document.body.classList.contains("in-game")) NERDBOX.startTime(currentGameId);
    });
    window.addEventListener("beforeunload", function () { NERDBOX.stopTime(); });
    window.addEventListener("hashchange", route);
    route();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
