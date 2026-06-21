/* ============================================================
   achievements.js — Nerdbox achievements + keyboard shortcuts
   Self-contained module (vanilla ES5, no framework, no build).
   Exposes window.NERDBOX_ACH. Self-wires on load.

   Depends on window.NERDBOX (loaded before this file). Optionally
   uses window.NERDBOX_FX (guarded). Adds nothing to other files.
   ============================================================ */
window.NERDBOX_ACH = (function () {
  "use strict";

  /* ---------- storage keys ---------- */
  var UNLOCK_KEY = "nerdbox-ach";
  var PB_KEY = "nerdbox-pbcount";

  /* ---------- small helpers ---------- */
  function el(tag, cls, html) {
    if (window.NERDBOX && NERDBOX.util && NERDBOX.util.el) return NERDBOX.util.el(tag, cls, html);
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fx(type) {
    if (window.NERDBOX_FX && typeof NERDBOX_FX.play === "function") {
      try { NERDBOX_FX.play(type); } catch (e) {}
    }
  }
  function fxConfetti() {
    if (window.NERDBOX_FX && typeof NERDBOX_FX.confetti === "function") {
      try { NERDBOX_FX.confetti(); } catch (e) {}
    }
  }

  /* ---------- personal-best counter ---------- */
  function getPbCount() {
    try {
      var v = parseInt(localStorage.getItem(PB_KEY), 10);
      return isFinite(v) && v > 0 ? v : 0;
    } catch (e) { return 0; }
  }
  function incPbCount() {
    try { localStorage.setItem(PB_KEY, String(getPbCount() + 1)); } catch (e) {}
  }

  /* ---------- unlocked-id persistence ---------- */
  function getUnlocked() {
    try {
      var a = JSON.parse(localStorage.getItem(UNLOCK_KEY));
      return Object.prototype.toString.call(a) === "[object Array]" ? a : [];
    } catch (e) { return []; }
  }
  function isUnlocked(id) {
    var a = getUnlocked();
    for (var i = 0; i < a.length; i++) if (a[i] === id) return true;
    return false;
  }
  function markUnlocked(id) {
    try {
      var a = getUnlocked();
      a.push(id);
      localStorage.setItem(UNLOCK_KEY, JSON.stringify(a));
    } catch (e) {}
  }

  /* ---------- stats snapshot built fresh each evaluation ---------- */
  function buildStats() {
    var s = {
      plays: 0, streak: 0, tried: 0, total: 0,
      faculties: {}, facultyCount: 0, pbCount: getPbCount(), _bestMap: {}
    };
    if (!window.NERDBOX) return s;

    s.plays = NERDBOX.getPlays();
    s.streak = NERDBOX.getStreak();
    s.playtime = NERDBOX.getPlaytime ? NERDBOX.getPlaytime() : 0;

    // total = number of non-external registered games
    var games = NERDBOX.games || [];
    var i;
    for (i = 0; i < games.length; i++) {
      if (!games[i].external) s.total++;
    }

    // bests + tried + faculties touched
    var bests = NERDBOX.getAllBests() || []; // already excludes external games
    for (i = 0; i < bests.length; i++) {
      var b = bests[i];
      s._bestMap[b.id] = b.best;
      if (b.best != null) {
        s.tried++;
        var g = NERDBOX.get(b.id);
        if (g && !g.external) {
          var fac = NERDBOX.facultyOf(g);
          if (fac && !s.faculties[fac]) { s.faculties[fac] = true; s.facultyCount++; }
        }
      }
    }
    return s;
  }
  function best(id) {
    if (!window.NERDBOX) return null;
    var v = NERDBOX.getBest(id);
    return v;
  }
  // does ANY non-external game matching predicate have a best score?
  function anyTried(pred) {
    if (!window.NERDBOX) return false;
    var games = NERDBOX.games || [];
    for (var i = 0; i < games.length; i++) {
      var g = games[i];
      if (g.external) continue;
      if (pred(g) && NERDBOX.getBest(g.id) != null) return true;
    }
    return false;
  }

  /* ---------- the achievement list (~15) ---------- */
  // each: { id, name, desc, icon, check(s) -> bool }
  var ACHIEVEMENTS = [
    { id: "firstplay", name: "Hello, World", icon: "👋",
      desc: "Play your very first game.",
      check: function (s) { return s.plays >= 1; } },
    { id: "tried10", name: "Sampler Platter", icon: "🍱",
      desc: "Try 10 different games.",
      check: function (s) { return s.tried >= 10; } },
    { id: "tried30", name: "Connoisseur", icon: "🎯",
      desc: "Try 30 different games.",
      check: function (s) { return s.tried >= 30; } },
    { id: "triedall", name: "Completionist", icon: "🗺️",
      desc: "Try every game in the box.",
      check: function (s) { return s.total > 0 && s.tried >= s.total; } },
    { id: "allfaculties", name: "Well-Rounded", icon: "🧠",
      desc: "Play a game in (almost) every faculty.",
      check: function (s) { return s.facultyCount >= 8; } },
    { id: "streak3", name: "Warming Up", icon: "🔥",
      desc: "Keep a 3-day play streak.",
      check: function (s) { return s.streak >= 3; } },
    { id: "streak7", name: "On Fire", icon: "🔥",
      desc: "Keep a 7-day play streak.",
      check: function (s) { return s.streak >= 7; } },
    { id: "firstpb", name: "New Record", icon: "🥉",
      desc: "Set your first personal best.",
      check: function (s) { return s.pbCount >= 1; } },
    { id: "pb10", name: "Record Breaker", icon: "🏅",
      desc: "Set 10 personal bests.",
      check: function (s) { return s.pbCount >= 10; } },
    { id: "plays50", name: "Regular", icon: "🎮",
      desc: "Play 50 games in total.",
      check: function (s) { return s.plays >= 50; } },
    { id: "plays100", name: "Addicted", icon: "💯",
      desc: "Play 100 games in total.",
      check: function (s) { return s.plays >= 100; } },
    { id: "time30", name: "Time Well Spent", icon: "⏱️",
      desc: "Spend 30 minutes in the box.",
      check: function (s) { return s.playtime >= 1800000; } },
    { id: "time5h", name: "No Off Switch", icon: "⏳",
      desc: "Spend 5 hours in the box, total.",
      check: function (s) { return s.playtime >= 18000000; } },
    { id: "fastreflex", name: "Lightning Reflexes", icon: "⚡",
      desc: "Score 250 ms or faster on Reaction Time.",
      check: function () { var b = best("reaction"); return b != null && b <= 250; } },
    { id: "bigmemory", name: "Total Recall", icon: "🧮",
      desc: "Reach 9+ digits on Number Memory.",
      check: function () { var b = best("memory"); return b != null && b >= 9; } },
    { id: "extreme", name: "Daredevil", icon: "☠️",
      desc: "Post a score on an extreme-tier game.",
      check: function () { return anyTried(function (g) { return g.difficulty === "extreme"; }); } },
    { id: "cogtest", name: "Lab Rat", icon: "🧪",
      desc: "Complete a cognitive test.",
      check: function () { return anyTried(function (g) { return g.test === true; }); } }
  ];

  function getById(id) {
    for (var i = 0; i < ACHIEVEMENTS.length; i++) if (ACHIEVEMENTS[i].id === id) return ACHIEVEMENTS[i];
    return null;
  }

  /* ---------- toast notifications ---------- */
  var TOAST_WRAP_ID = "ach-toast-wrap";
  function toastWrap() {
    var w = document.getElementById(TOAST_WRAP_ID);
    if (!w) {
      w = el("div", "ach-toast-wrap");
      w.id = TOAST_WRAP_ID;
      document.body.appendChild(w);
    }
    return w;
  }
  function showToast(ach) {
    var wrap = toastWrap();
    var t = el("div", "ach-toast",
      '<span class="ach-toast-icon">' + esc(ach.icon) + '</span>' +
      '<span class="ach-toast-body">' +
        '<span class="ach-toast-label">Achievement unlocked</span>' +
        '<span class="ach-toast-name">' + esc(ach.name) + '</span>' +
      '</span>');
    wrap.appendChild(t);
    // animate in next frame
    if (window.requestAnimationFrame) {
      requestAnimationFrame(function () { t.classList.add("ach-toast-in"); });
    } else {
      t.classList.add("ach-toast-in");
    }
    var removeTimer = null;
    function remove() {
      if (removeTimer) { clearTimeout(removeTimer); removeTimer = null; }
      if (t._timer) { clearTimeout(t._timer); t._timer = null; }
      t.classList.remove("ach-toast-in");
      t.classList.add("ach-toast-out");
      removeTimer = setTimeout(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
        removeTimer = null;
      }, 400);
    }
    // auto-dismiss after ~3.5s; store timer so it can be cleared on removal
    t._timer = setTimeout(remove, 3500);
    // click to dismiss early (also clears the timer)
    t.addEventListener("click", remove);
  }

  /* ---------- evaluate: unlock newly-earned achievements ---------- */
  var evaluating = false;
  function evaluate() {
    if (evaluating) return;          // re-entrancy guard
    evaluating = true;
    try {
      var s = buildStats();
      var i;
      for (i = 0; i < ACHIEVEMENTS.length; i++) {
        var a = ACHIEVEMENTS[i];
        if (isUnlocked(a.id)) continue;
        var ok = false;
        try { ok = !!a.check(s); } catch (e) { ok = false; }
        if (ok) {
          markUnlocked(a.id);
          showToast(a);
          fx("unlock");
          fxConfetti();
        }
      }
    } finally {
      evaluating = false;
    }
  }

  /* ---------- trophy-case page ---------- */
  function renderPage(container) {
    if (!container) return;
    evaluate(); // make sure state is current before drawing
    var unlocked = getUnlocked();
    var total = ACHIEVEMENTS.length;
    var got = 0, i;
    for (i = 0; i < ACHIEVEMENTS.length; i++) if (isUnlocked(ACHIEVEMENTS[i].id)) got++;

    var html = '<div class="ach-page">';
    html += '<div class="ach-head">' +
      '<a class="back" href="#/">&lsaquo; all games</a>' +
      '<h1>trophy case</h1>' +
      '<span class="ach-count">' + got + ' / ' + total + ' unlocked</span>' +
      '</div>';

    html += '<div class="ach-grid">';
    for (i = 0; i < ACHIEVEMENTS.length; i++) {
      var a = ACHIEVEMENTS[i];
      var on = isUnlocked(a.id);
      html += '<div class="ach-card' + (on ? " ach-on" : " ach-off") + '">' +
        '<div class="ach-card-icon">' + (on ? esc(a.icon) : "🔒") + '</div>' +
        '<div class="ach-card-body">' +
          '<div class="ach-card-name">' + esc(a.name) + '</div>' +
          '<div class="ach-card-desc">' + esc(a.desc) + '</div>' +
        '</div>' +
        (on ? '<div class="ach-card-tick">✓</div>' : '') +
        '</div>';
    }
    html += '</div></div>';

    container.innerHTML = html;
  }

  /* ---------- shortcuts cheatsheet overlay ---------- */
  var SHORTCUTS = [
    { keys: "/", desc: "focus search" },
    { keys: "r", desc: "surprise me (random game)" },
    { keys: "t", desc: "brain test" },
    { keys: "p", desc: "your brain profile" },
    { keys: "a", desc: "achievements" },
    { keys: "?", desc: "toggle this cheatsheet" },
    { keys: "Esc", desc: "close cheatsheet / dialogs" }
  ];
  var CHEAT_ID = "ach-cheat";
  function cheatEl() { return document.getElementById(CHEAT_ID); }
  function isCheatOpen() {
    var c = cheatEl();
    return !!c && c.classList.contains("ach-cheat-open");
  }
  function buildCheat() {
    var c = cheatEl();
    if (c) return c;
    c = el("div", "ach-cheat");
    c.id = CHEAT_ID;
    var rows = "";
    for (var i = 0; i < SHORTCUTS.length; i++) {
      rows += '<tr><td class="ach-key"><kbd>' + esc(SHORTCUTS[i].keys) + '</kbd></td>' +
        '<td class="ach-key-desc">' + esc(SHORTCUTS[i].desc) + '</td></tr>';
    }
    c.innerHTML =
      '<div class="ach-cheat-backdrop"></div>' +
      '<div class="ach-cheat-modal" role="dialog" aria-modal="true" aria-label="keyboard shortcuts">' +
        '<div class="ach-cheat-head"><span>keyboard shortcuts</span>' +
          '<button class="ach-cheat-x" type="button" aria-label="close">✕</button></div>' +
        '<table class="ach-cheat-table">' + rows + '</table>' +
        '<div class="ach-cheat-foot">press <kbd>?</kbd> any time · <kbd>Esc</kbd> to close</div>' +
      '</div>';
    document.body.appendChild(c);
    // backdrop + close button dismiss
    var bd = c.querySelector(".ach-cheat-backdrop");
    if (bd) bd.addEventListener("click", closeCheat);
    var x = c.querySelector(".ach-cheat-x");
    if (x) x.addEventListener("click", closeCheat);
    return c;
  }
  function openCheat() {
    var c = buildCheat();
    c.classList.add("ach-cheat-open");
  }
  function closeCheat() {
    var c = cheatEl();
    if (c) c.classList.remove("ach-cheat-open");
  }
  function toggleCheat() {
    if (isCheatOpen()) closeCheat(); else openCheat();
  }

  /* ---------- CSS ---------- */
  function injectCss() {
    if (!window.NERDBOX || !NERDBOX.injectStyle) return;
    NERDBOX.injectStyle("ach",
      /* toast stack */
      ".ach-toast-wrap{position:fixed;top:14px;right:14px;z-index:9000;display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:min(340px,90vw)}" +
      ".ach-toast{pointer-events:auto;cursor:pointer;display:flex;align-items:center;gap:.7rem;" +
        "background:var(--bg-alt);color:var(--text);border:1px solid color-mix(in srgb,var(--accent) 45%,transparent);" +
        "border-radius:12px;padding:.7rem .9rem;box-shadow:0 10px 30px rgba(0,0,0,.35);" +
        "opacity:0;transform:translateX(24px);transition:opacity .3s ease,transform .3s ease}" +
      ".ach-toast-in{opacity:1;transform:translateX(0)}" +
      ".ach-toast-out{opacity:0;transform:translateX(24px)}" +
      ".ach-toast-icon{font-size:1.5rem;line-height:1;flex-shrink:0}" +
      ".ach-toast-body{display:flex;flex-direction:column;min-width:0}" +
      ".ach-toast-label{font-size:.62rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--accent)}" +
      ".ach-toast-name{font-size:.95rem;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +

      /* trophy-case page */
      ".ach-page{max-width:900px;margin:0 auto}" +
      ".ach-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1.4rem;flex-wrap:wrap}" +
      ".ach-head h1{color:var(--text);font-size:1.5rem;font-weight:500}" +
      ".ach-count{font-family:'JetBrains Mono',monospace;color:var(--accent);font-size:.9rem;white-space:nowrap}" +
      ".ach-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:.9rem}" +
      ".ach-card{position:relative;display:flex;align-items:flex-start;gap:.8rem;background:var(--bg-alt);" +
        "border:1px solid color-mix(in srgb,var(--text) 5%,transparent);border-radius:12px;padding:1rem 1.1rem;transition:transform .12s,border-color .12s}" +
      ".ach-card.ach-on{border-color:color-mix(in srgb,var(--accent) 45%,transparent)}" +
      ".ach-card.ach-on:hover{transform:translateY(-2px);border-color:var(--accent)}" +
      ".ach-card.ach-off{opacity:.55;filter:grayscale(1)}" +
      ".ach-card-icon{font-size:1.9rem;line-height:1;flex-shrink:0}" +
      ".ach-card-body{min-width:0}" +
      ".ach-card-name{font-size:.98rem;font-weight:500;color:var(--text);margin-bottom:.2rem}" +
      ".ach-card.ach-on .ach-card-name{color:var(--accent)}" +
      ".ach-card-desc{font-size:.8rem;color:var(--sub);line-height:1.35}" +
      ".ach-card-tick{position:absolute;top:.6rem;right:.7rem;color:var(--accent);font-weight:700;font-size:.9rem}" +

      /* cheatsheet overlay */
      ".ach-cheat{position:fixed;inset:0;z-index:9500;display:none}" +
      ".ach-cheat.ach-cheat-open{display:block}" +
      ".ach-cheat-backdrop{position:absolute;inset:0;background:color-mix(in srgb,var(--bg) 72%,transparent);backdrop-filter:blur(2px)}" +
      ".ach-cheat-modal{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(420px,92vw);" +
        "background:var(--bg-alt);border:1px solid var(--sub-alt);border-radius:14px;padding:1.2rem 1.3rem;box-shadow:0 20px 60px rgba(0,0,0,.45)}" +
      ".ach-cheat-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.9rem;" +
        "font-size:1.05rem;font-weight:500;color:var(--text)}" +
      ".ach-cheat-x{background:transparent;border:none;color:var(--sub);font-size:1rem;cursor:pointer;line-height:1;padding:.2rem}" +
      ".ach-cheat-x:hover{color:var(--accent)}" +
      ".ach-cheat-table{width:100%;border-collapse:collapse}" +
      ".ach-cheat-table td{padding:.4rem .2rem;font-size:.88rem;color:var(--text);border-bottom:1px solid color-mix(in srgb,var(--text) 6%,transparent)}" +
      ".ach-cheat-table tr:last-child td{border-bottom:none}" +
      ".ach-key{width:64px}" +
      ".ach-key-desc{color:var(--sub)}" +
      ".ach-cheat kbd{font-family:'JetBrains Mono',monospace;font-size:.8rem;background:var(--bg);color:var(--accent);" +
        "border:1px solid var(--sub-alt);border-radius:6px;padding:.12rem .45rem;min-width:1.2rem;display:inline-block;text-align:center}" +
      ".ach-cheat-foot{margin-top:1rem;font-size:.72rem;color:var(--sub);text-align:center}"
    );
  }

  /* ---------- nav button injection ---------- */
  function injectNavButton() {
    var nav = document.querySelector(".top-nav");
    if (!nav) return;
    if (nav.querySelector(".ach-nav-btn")) return; // guard double-inject
    var btn = el("a", "icon-btn ach-nav-btn");
    btn.setAttribute("href", "#/achievements");
    btn.setAttribute("title", "achievements");
    btn.setAttribute("aria-label", "achievements");
    btn.innerHTML = "🏆";
    var anchor = document.getElementById("theme-select");
    if (anchor && anchor.parentNode === nav) {
      nav.insertBefore(btn, anchor);
    } else {
      nav.appendChild(btn);
    }
  }

  /* ---------- keyboard shortcuts ---------- */
  function onKeydown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Escape closes the cheatsheet even from anywhere (but not inside inputs typing)
    var tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : "";
    var typing = (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA");

    if (e.key === "Escape") {
      if (isCheatOpen()) { closeCheat(); e.preventDefault(); }
      return;
    }

    // all other shortcuts only when not in a game and not typing in a field
    if (document.body.classList.contains("in-game")) return;
    if (typing) return;

    var k = e.key;
    if (k === "/") {
      var search = document.getElementById("hub-search");
      if (search) { search.focus(); e.preventDefault(); }
    } else if (k === "r" || k === "R") {
      var rnd = document.getElementById("random-btn");
      if (rnd) { rnd.click(); }
    } else if (k === "t" || k === "T") {
      location.hash = "#/test";
    } else if (k === "p" || k === "P") {
      location.hash = "#/stats";
    } else if (k === "a" || k === "A") {
      location.hash = "#/achievements";
    } else if (k === "?") {
      // "?" is shift+"/" on most layouts
      toggleCheat();
      e.preventDefault();
    }
  }

  /* ---------- self-wire (guard against double-init) ---------- */
  var inited = false;
  function init() {
    if (inited) return;
    inited = true;

    injectCss();
    injectNavButton();

    if (window.NERDBOX && NERDBOX.onScore) {
      NERDBOX.onScore(function (id, value, isBest) {
        if (isBest) incPbCount();
        evaluate();
      });
    }

    window.addEventListener("hashchange", evaluate);
    document.addEventListener("keydown", onKeydown);

    // initial pass so play/streak unlocks register on load
    evaluate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* ---------- public API ---------- */
  return {
    achievements: ACHIEVEMENTS,
    evaluate: evaluate,
    renderPage: renderPage,
    getUnlocked: getUnlocked,
    getPbCount: getPbCount,
    toggleCheatsheet: toggleCheat,
    openCheatsheet: openCheat,
    closeCheatsheet: closeCheat
  };
})();
