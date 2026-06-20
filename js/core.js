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
      return true;
    }
    return false;
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
    }
  };

  return {
    games: games,
    register: register,
    get: get,
    getBest: getBest,
    setBest: setBest,
    util: util
  };
})();
