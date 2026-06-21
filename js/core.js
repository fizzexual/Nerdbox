/* ============================================================
   core.js — the Nerdbox game registry + best-score storage
   Each game file calls NERDBOX.register({...}). app.js reads the
   registry to build the hub and route to games.
   ============================================================ */
window.NERDBOX = (function () {
  "use strict";
  var games = [];

  function register(game) {
    // game: { id, name, tagline, category, scoreMode:'max'|'min',
    //         formatScore(v)->string, icon (svg string), mount(root, ctx)->teardown,
    //         external? , url? }
    games.push(game);
  }
  function get(id) {
    for (var i = 0; i < games.length; i++) if (games[i].id === id) return games[i];
    return null;
  }

  function bestKey(id) { return "nerdbox-best-" + id; }
  function getBest(id) {
    try {
      var v = localStorage.getItem(bestKey(id));
      return v === null ? null : Number(v);
    } catch (e) { return null; }
  }
  function setBest(id, value) {
    var g = get(id);
    if (!g || typeof value !== "number" || !isFinite(value)) return false;
    var cur = getBest(id);
    var better = cur === null || (g.scoreMode === "min" ? value < cur : value > cur);
    if (better) {
      try { localStorage.setItem(bestKey(id), String(value)); } catch (e) {}
    }
    emitScore(id, value, better);
    return better;
  }

  // inject a game's CSS once (keeps each game file self-contained)
  function injectStyle(id, css) {
    var sid = "nb-style-" + id;
    if (document.getElementById(sid)) return;
    var s = document.createElement("style");
    s.id = sid;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // small shared helpers for games
  var util = {
    el: function (tag, cls, html) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html != null) e.innerHTML = html;
      return e;
    },
    rand: function (n) { return Math.floor(Math.random() * n); },
    shuffle: function (arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },
    fmtTime: function (ms) {
      var s = Math.floor((ms || 0) / 1000);
      if (s < 60) return s + "s";
      var m = Math.floor(s / 60);
      if (m < 60) return m + "m";
      var h = Math.floor(m / 60); m = m % 60;
      if (h < 24) return h + "h" + (m ? " " + m + "m" : "");
      var d = Math.floor(h / 24); h = h % 24;
      return d + "d" + (h ? " " + h + "h" : "");
    }
  };

  /* ---------- faculties (presentation grouping, shared with app + dashboard) ---------- */
  var CAT_OVERRIDE = {
    guesslang: "dev", regex: "dev", shortcut: "dev", git: "dev", query: "dev",
    cssduel: "dev", connections: "dev", codemonkey: "dev",
    colormatch: "perception", hexle: "perception",
    devle: "language", logicgate: "reasoning", lightsout: "reasoning"
  };
  function facultyOf(g) { return (g && (CAT_OVERRIDE[g.id] || g.category)) || "other"; }

  /* ---------- score events ---------- */
  var scoreListeners = [];
  function onScore(cb) { scoreListeners.push(cb); }
  function emitScore(id, value, isBest) {
    for (var i = 0; i < scoreListeners.length; i++) {
      try { scoreListeners[i](id, value, isBest); } catch (e) {}
    }
  }

  /* ---------- play streak + aggregate stats ---------- */
  var PLAY_KEY = "nerdbox-play";
  function dayStr(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function loadPlay() { try { return JSON.parse(localStorage.getItem(PLAY_KEY)) || {}; } catch (e) { return {}; } }
  function recordPlay() {
    try {
      var p = loadPlay();
      var today = dayStr(new Date());
      var yest = dayStr(new Date(Date.now() - 86400000));
      if (p.last !== today) {
        p.streak = (p.last === yest) ? (p.streak || 0) + 1 : 1;
        p.last = today;
      }
      p.plays = (p.plays || 0) + 1;
      localStorage.setItem(PLAY_KEY, JSON.stringify(p));
    } catch (e) {}
  }
  function getStreak() {
    var p = loadPlay();
    var today = dayStr(new Date()), yest = dayStr(new Date(Date.now() - 86400000));
    return (p.last === today || p.last === yest) ? (p.streak || 0) : 0;
  }
  function getPlays() { return loadPlay().plays || 0; }

  /* ---------- playtime (time spent inside games) ---------- */
  var TIME_KEY = "nerdbox-time";
  var ptStart = 0, ptId = null;
  function loadTime() { try { return JSON.parse(localStorage.getItem(TIME_KEY)) || { total: 0, games: {} }; } catch (e) { return { total: 0, games: {} }; } }
  function startTime(id) { stopTime(); ptId = id; ptStart = Date.now(); }
  function stopTime() {
    if (ptStart && ptId) {
      var dt = Date.now() - ptStart;
      if (dt > 0 && dt < 21600000) { // ignore >6h spans (tab left open / AFK)
        var t = loadTime();
        if (!t.games) t.games = {};
        t.total = (t.total || 0) + dt;
        t.games[ptId] = (t.games[ptId] || 0) + dt;
        try { localStorage.setItem(TIME_KEY, JSON.stringify(t)); } catch (e) {}
      }
    }
    ptStart = 0; ptId = null;
  }
  function getPlaytime() { return loadTime().total || 0; }
  function getGamePlaytime(id) { var g = loadTime().games || {}; return g[id] || 0; }

  function getAllBests() {
    var out = [];
    for (var i = 0; i < games.length; i++) {
      if (games[i].external) continue;
      out.push({ id: games[i].id, best: getBest(games[i].id) });
    }
    return out;
  }
  function clearAllData() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && (k.indexOf("nerdbox-best-") === 0 || k === PLAY_KEY || k === TIME_KEY || k.indexOf("nerdbox-daily") === 0 || k === "nerdbox-ach" || k === "nerdbox-pbcount")) keys.push(k);
      }
      keys.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
  }

  return {
    games: games,
    register: register,
    get: get,
    getBest: getBest,
    setBest: setBest,
    injectStyle: injectStyle,
    util: util,
    facultyOf: facultyOf,
    onScore: onScore,
    recordPlay: recordPlay,
    getStreak: getStreak,
    getPlays: getPlays,
    startTime: startTime,
    stopTime: stopTime,
    getPlaytime: getPlaytime,
    getGamePlaytime: getGamePlaytime,
    getAllBests: getAllBests,
    clearAllData: clearAllData
  };
})();
