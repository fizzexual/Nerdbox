/* ============================================================
   dashboard.js — brain profile (radar), faculty scoring,
   play streak display, and the daily challenge.
   Exposes window.NERDBOX_DASH.
   ============================================================ */
window.NERDBOX_DASH = (function () {
  "use strict";

  // the value that counts as a "great" (100%) score, per game
  var TARGETS = {
    reaction: 250, aim: 400, timeperception: 200,
    memory: 9, sequence: 12, chimp: 12, nback: 85, visualmemory: 12, verbalmemory: 40,
    stroop: 40, trailmaking: 25, gonogo: 90,
    numseq: 15, rotation: 30, mathsprint: 30, logicgate: 15, lightsout: 10,
    colormatch: 15, hexle: 10, estimate: 12,
    devle: 8, anagram: 15,
    guesslang: 20, regex: 7, shortcut: 25, git: 20, query: 5, cssduel: 95, connections: 5,
    dualnback: 80, schulte: 8, matrix: 12, mastermind: 5, reversespan: 8, make24: 10, cryptogram: 5, hanoi: 7
  };

  var FACULTIES = [
    { id: "reflex", name: "reflexes" },
    { id: "memory", name: "memory" },
    { id: "attention", name: "attention" },
    { id: "reasoning", name: "reasoning" },
    { id: "perception", name: "perception" },
    { id: "language", name: "language" },
    { id: "dev", name: "dev" }
  ];

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function normalize(id, best) {
    if (best == null) return 0;
    var g = NERDBOX.get(id), t = TARGETS[id];
    if (!g || !t) return 0;
    var v = g.scoreMode === "min" ? (best <= 0 ? 100 : 100 * t / best) : 100 * best / t;
    return Math.max(0, Math.min(100, Math.round(v)));
  }

  function facultyScores() {
    var byFac = {};
    FACULTIES.forEach(function (f) { byFac[f.id] = { sum: 0, count: 0, total: 0, games: [] }; });
    NERDBOX.games.forEach(function (g) {
      if (g.external) return;
      var fac = NERDBOX.facultyOf(g);
      if (!byFac[fac]) return;
      var best = NERDBOX.getBest(g.id);
      byFac[fac].total++;
      byFac[fac].games.push({ id: g.id, name: g.name, best: best, fmt: best == null ? "—" : g.formatScore(best), hard: g.difficulty === "hard" });
      if (best != null) { byFac[fac].sum += normalize(g.id, best); byFac[fac].count++; }
    });
    return FACULTIES.map(function (f) {
      var b = byFac[f.id];
      return { id: f.id, name: f.name, score: b.count ? Math.round(b.sum / b.count) : 0, played: b.count, total: b.total, games: b.games };
    });
  }

  /* ---------- radar ---------- */
  function radarSvg(scores) {
    var n = scores.length, cx = 170, cy = 150, R = 100;
    function pt(i, r) { var a = (-90 + i * 360 / n) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
    var svg = '<svg viewBox="0 0 340 300" class="radar" role="img" aria-label="brain profile radar">';
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var pts = [];
      for (var i = 0; i < n; i++) { var p = pt(i, R * f); pts.push(p[0].toFixed(1) + "," + p[1].toFixed(1)); }
      svg += '<polygon class="radar-grid" points="' + pts.join(" ") + '"/>';
    });
    for (var i = 0; i < n; i++) {
      var p = pt(i, R);
      svg += '<line class="radar-axis" x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '"/>';
      var lp = pt(i, R + 22);
      svg += '<text class="radar-label" x="' + lp[0].toFixed(1) + '" y="' + lp[1].toFixed(1) + '" text-anchor="middle" dominant-baseline="middle">' + scores[i].name + "</text>";
    }
    var d = [];
    for (var j = 0; j < n; j++) { var s = Math.max(0, Math.min(100, scores[j].score || 0)); var q = pt(j, R * s / 100); d.push(q[0].toFixed(1) + "," + q[1].toFixed(1)); }
    svg += '<polygon class="radar-data" points="' + d.join(" ") + '"/>';
    for (var k = 0; k < n; k++) { var s2 = Math.max(0, Math.min(100, scores[k].score || 0)); var r2 = pt(k, R * s2 / 100); svg += '<circle class="radar-dot" cx="' + r2[0].toFixed(1) + '" cy="' + r2[1].toFixed(1) + '" r="3"/>'; }
    svg += "</svg>";
    return svg;
  }

  /* ---------- profile page ---------- */
  function renderProfile(container) {
    var scores = facultyScores();
    var bests = NERDBOX.getAllBests();
    var tried = bests.filter(function (b) { return b.best != null; }).length;
    var totalGames = bests.length;
    var overall = (function () {
      var played = scores.filter(function (s) { return s.played > 0; });
      if (!played.length) return 0;
      return Math.round(played.reduce(function (a, s) { return a + s.score; }, 0) / played.length);
    })();

    var html = '<div class="profile">';
    html += '<div class="profile-head"><a class="back" href="#/">&lsaquo; all games</a><h1>your brain profile</h1><span></span></div>';
    html += '<div class="profile-stats">' +
      stat("🔥 " + NERDBOX.getStreak(), "day streak") +
      stat(NERDBOX.getPlays(), "games played") +
      stat(tried + "/" + totalGames, "games tried") +
      stat(overall + "%", "overall") +
      "</div>";

    html += '<div class="profile-radar">' + radarSvg(scores) + "</div>";

    html += '<div class="profile-faculties">';
    scores.forEach(function (s) {
      html += '<div class="fac-block"><div class="fac-head"><span class="fac-name">' + s.name +
        '</span><span class="fac-score">' + (s.played ? s.score + "%" : "—") + '</span></div>' +
        '<div class="fac-bar"><span style="width:' + s.score + '%"></span></div>' +
        '<div class="fac-games">';
      s.games.forEach(function (g) {
        html += '<a class="fac-game" href="#/' + g.id + '"><span class="fg-name">' + esc(g.name) + (g.hard ? ' <i class="fg-hard">hard</i>' : "") +
          '</span><span class="fg-best">' + esc(g.fmt) + "</span></a>";
      });
      html += "</div></div>";
    });
    html += "</div>";

    html += '<div class="profile-foot"><button class="text-danger" id="clear-data">clear all my data</button></div>';
    html += "</div>";

    container.innerHTML = html;
    var clr = container.querySelector("#clear-data");
    if (clr) clr.addEventListener("click", function () {
      if (window.confirm("Clear all your best scores, streak and stats? This can't be undone.")) {
        NERDBOX.clearAllData();
        renderProfile(container);
      }
    });
  }
  function stat(big, label) {
    return '<div class="pstat"><div class="pstat-big">' + big + '</div><div class="pstat-label">' + label + "</div></div>";
  }

  /* ---------- daily challenge ---------- */
  var DAILY_KEY = "nerdbox-daily";
  function todayKey() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function dailyGameId() {
    var d = new Date();
    var seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    var list = NERDBOX.games.filter(function (g) { return !g.external; });
    return list[seed % list.length].id;
  }
  function dailyResult() {
    try { var r = JSON.parse(localStorage.getItem(DAILY_KEY)); if (r && r.date === todayKey() && r.id === dailyGameId()) return r; } catch (e) {}
    return null;
  }
  function initDaily() {
    NERDBOX.onScore(function (id, value) {
      if (id !== dailyGameId()) return;
      var g = NERDBOX.get(id), cur = dailyResult();
      var better = !cur || (g.scoreMode === "min" ? value < cur.score : value > cur.score);
      if (better) { try { localStorage.setItem(DAILY_KEY, JSON.stringify({ date: todayKey(), id: id, score: value })); } catch (e) {} }
    });
  }
  function dailyCardHtml() {
    var g = NERDBOX.get(dailyGameId());
    if (!g) return "";
    var r = dailyResult();
    var right = r
      ? '<a class="daily-go" href="#/' + g.id + '">today: ' + esc(g.formatScore(r.score)) + '</a>' +
        '<button class="daily-share" onclick="NERDBOX_DASH.shareDaily(this)">share</button>'
      : '<a class="daily-go" href="#/' + g.id + '">play →</a>';
    return '<div class="daily-card">' +
      '<a class="daily-left" href="#/' + g.id + '"><span class="daily-label">🗓️ daily challenge</span>' +
      '<span class="daily-name">' + esc(g.name) + "</span>" +
      '<span class="daily-tag">' + esc(g.tagline) + "</span></a>" +
      '<div class="daily-right">' + right + "</div></div>";
  }
  function shareDaily(btn) {
    var g = NERDBOX.get(dailyGameId()), r = dailyResult();
    if (!g || !r) return;
    var text = "Nerdbox daily 🧠 " + g.name + ": " + g.formatScore(r.score) + "\nfizzexual.github.io/Nerdbox";
    try {
      navigator.clipboard.writeText(text).then(function () { flashShare(btn, "copied!"); }, function () { flashShare(btn, "copy failed"); });
    } catch (e) { flashShare(btn, "copy failed"); }
  }
  function flashShare(btn, msg) {
    if (!btn) return;
    var old = btn.textContent; btn.textContent = msg;
    setTimeout(function () { btn.textContent = old; }, 1400);
  }

  return {
    renderProfile: renderProfile,
    dailyCardHtml: dailyCardHtml,
    dailyGameId: dailyGameId,
    initDaily: initDaily,
    shareDaily: shareDaily
  };
})();
