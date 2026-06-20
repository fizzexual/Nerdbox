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
    dualnback: 80, schulte: 8, matrix: 12, mastermind: 5, reversespan: 8, make24: 10, cryptogram: 5, hanoi: 7,
    pitchmatch: 10, soundreaction: 250, rhythmecho: 8, steadyhand: 8, pursuit: 80, taptempo: 90, intercept: 10,
    rat: 8, reademotion: 12, maze: 8, angle: 10, bisect: 10, symmetry: 30, numberline: 10, visualsearch: 15, changeblind: 10,
    numcompare: 40, oddeven: 45, snapcount: 15, moredots: 35, flanker: 40, ruleswitch: 30, letterhunt: 25, whack: 25,
    realword: 35, samediff: 35, tapcolor: 35, quickrecall: 9, sortit: 35, choicereact: 400,
    triplenback: 70, flashanzan: 10, mot: 7, rotate3d: 15, polyrhythm: 6, readingspan: 6
  };

  var FACULTIES = [
    { id: "reflex", name: "reflexes" },
    { id: "motor", name: "motor" },
    { id: "memory", name: "memory" },
    { id: "attention", name: "attention" },
    { id: "perception", name: "perception" },
    { id: "hearing", name: "hearing" },
    { id: "reasoning", name: "reasoning" },
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
      if (g.external || g.multiplayer) return;
      var fac = NERDBOX.facultyOf(g);
      if (!byFac[fac]) return;
      var best = NERDBOX.getBest(g.id);
      byFac[fac].total++;
      byFac[fac].games.push({ id: g.id, name: g.name, best: best, fmt: best == null ? "—" : g.formatScore(best), hard: g.difficulty === "hard", extreme: g.difficulty === "extreme" });
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
    html += '<div class="profile-head"><a class="back" href="#/">&lsaquo; all games</a><h1>your brain profile</h1><a class="profile-test" href="#/test">🧠 take the test</a></div>';
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
        html += '<a class="fac-game" href="#/' + g.id + '"><span class="fg-name">' + esc(g.name) + (g.hard ? ' <i class="fg-hard">hard</i>' : "") + (g.extreme ? ' <i class="fg-extreme">extreme</i>' : "") +
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
    var list = NERDBOX.games.filter(function (g) { return !g.external && !g.multiplayer; });
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

  /* ============================================================
     BRAIN TEST BATTERY — one game per faculty → profile + PNG card
     ============================================================ */
  // Pick one RANDOM eligible game per faculty, fresh each run. Eligible = solo
  // (not multiplayer), scored (has a TARGET), and not the brutal extreme tier —
  // so the brain score stays comparable and the test stays approachable.
  function buildBattery() {
    return FACULTIES.map(function (f) {
      var pool = NERDBOX.games.filter(function (g) {
        return !g.external && !g.multiplayer && g.difficulty !== "extreme" &&
          TARGETS[g.id] != null && NERDBOX.facultyOf(g) === f.id;
      });
      if (!pool.length) return null;
      return { fac: f.id, id: pool[NERDBOX.util.rand(pool.length)].id };
    }).filter(Boolean);
  }
  function facName(id) { for (var i = 0; i < FACULTIES.length; i++) if (FACULTIES[i].id === id) return FACULTIES[i].name; return id; }
  function color(v) { return (window.NerdboxThemes ? window.NerdboxThemes.color(v) : "#888"); }

  function startBattery(container) {
    var battery = buildBattery();
    var step = 0, results = [], captured = null, teardown = null;
    function cleanup() { if (teardown) { try { teardown(); } catch (e) {} teardown = null; } }

    function mountStep() {
      cleanup();
      if (step >= battery.length) { showResult(); return; }
      var b = battery[step], g = NERDBOX.get(b.id);
      captured = null;
      container.innerHTML =
        '<div class="battery">' +
          '<div class="battery-head"><a class="back" href="#/">✕ exit</a>' +
            '<div class="battery-prog">brain test &middot; ' + (step + 1) + " / " + battery.length +
            '<div class="battery-bar"><span style="width:' + (step / battery.length * 100) + '%"></span></div></div><span></span></div>' +
          '<div class="battery-gh"><span class="battery-fac">' + facName(b.fac) + '</span>' +
            '<span class="battery-name">' + esc(g.name) + '</span>' +
            '<span class="battery-hint">play a round, then hit “next”</span></div>' +
          '<div class="battery-root" id="battery-root"></div>' +
          '<div class="battery-foot"><button class="g-btn" id="battery-next">' +
            (step === battery.length - 1 ? "see results →" : "next →") + "</button></div>" +
        "</div>";
      var root = document.getElementById("battery-root");
      NERDBOX.recordPlay();
      teardown = g.mount(root, {
        util: NERDBOX.util,
        themeColor: color,
        submitScore: function (v) {
          captured = (captured == null) ? v : (g.scoreMode === "min" ? Math.min(captured, v) : Math.max(captured, v));
          return NERDBOX.setBest(g.id, v);
        }
      }) || null;
      document.getElementById("battery-next").addEventListener("click", function () {
        results.push({ fac: b.fac, score: captured == null ? null : normalize(b.id, captured) });
        step++; mountStep();
      });
    }

    function showResult() {
      cleanup();
      var byFac = {}; results.forEach(function (r) { byFac[r.fac] = r.score; });
      var radar = FACULTIES.map(function (f) { return { name: f.name, score: byFac[f.id] == null ? 0 : byFac[f.id] }; });
      var played = results.filter(function (r) { return r.score != null; });
      var overall = played.length ? Math.round(played.reduce(function (a, r) { return a + r.score; }, 0) / played.length) : 0;

      container.innerHTML =
        '<div class="battery-result">' +
          '<div class="battery-head"><a class="back" href="#/">✕ close</a><div class="battery-prog">your brain test</div><span></span></div>' +
          '<canvas id="result-canvas" class="result-canvas" width="1200" height="630"></canvas>' +
          '<div class="result-actions">' +
            '<button class="g-btn" id="dl-png">download png</button>' +
            '<button class="action-btn" id="share-png">share</button>' +
            '<a class="action-btn" href="#/test">retake</a>' +
          "</div>" +
        "</div>";
      var canvas = document.getElementById("result-canvas");
      function draw() { drawResultCard(canvas, radar, overall); }
      draw();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
      document.getElementById("dl-png").addEventListener("click", function () { downloadCanvas(canvas, "nerdbox-brain-test.png"); });
      document.getElementById("share-png").addEventListener("click", function () { sharePng(canvas, overall); });
    }
    mountStep();
    return cleanup;
  }

  /* ---------- PNG result card (drawn on canvas) ---------- */
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function dateStr() { try { return new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch (e) { return ""; } }
  function drawLogo(ctx, x, y, accent, bg) {
    var s = 42;
    ctx.fillStyle = accent; roundRect(ctx, x - s * 0.42, y - s * 0.4, s * 0.84, s * 0.78, s * 0.2); ctx.fill();
    ctx.strokeStyle = bg; ctx.lineWidth = s * 0.06; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(x - s * 0.16, y + s * 0.05, s * 0.13, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + s * 0.16, y + s * 0.05, s * 0.13, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - s * 0.03, y + s * 0.03); ctx.lineTo(x + s * 0.03, y + s * 0.03); ctx.stroke();
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(x - s * 0.16, y + s * 0.05, s * 0.04, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + s * 0.16, y + s * 0.05, s * 0.04, 0, Math.PI * 2); ctx.fill();
  }
  function drawRadarCanvas(ctx, scores, cx, cy, R, accent, sub, subAlt) {
    var n = scores.length;
    function pt(i, r) { var a = (-90 + i * 360 / n) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
    ctx.strokeStyle = subAlt; ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      ctx.beginPath();
      for (var i = 0; i < n; i++) { var p = pt(i, R * f); if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
      ctx.closePath(); ctx.stroke();
    });
    for (var i = 0; i < n; i++) { var p = pt(i, R); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p[0], p[1]); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (var j = 0; j < n; j++) { var s = Math.max(0, Math.min(100, scores[j].score)); var q = pt(j, R * s / 100); if (j === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); }
    ctx.closePath();
    ctx.fillStyle = accent; ctx.globalAlpha = 0.22; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (var k = 0; k < n; k++) {
      var s2 = Math.max(0, Math.min(100, scores[k].score)); var d = pt(k, R * s2 / 100);
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(d[0], d[1], 4, 0, Math.PI * 2); ctx.fill();
      var lp = pt(k, R + 26); ctx.fillStyle = sub; ctx.font = '500 17px "Lexend Deca", system-ui, sans-serif';
      ctx.fillText(scores[k].name, lp[0], lp[1]);
    }
    ctx.textAlign = "left";
  }
  function drawResultCard(canvas, scores, overall) {
    var W = 1200, H = 630, ctx = canvas.getContext("2d");
    var bg = color("--bg"), bgAlt = color("--bg-alt"), accent = color("--accent"), text = color("--text"), sub = color("--sub"), subAlt = color("--sub-alt");
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 6);

    // header
    drawLogo(ctx, 78, 62, accent, bg);
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.font = '700 38px "Lexend Deca", system-ui, sans-serif';
    ctx.fillStyle = text; ctx.fillText("nerd", 110, 64);
    var w1 = ctx.measureText("nerd").width; ctx.fillStyle = accent; ctx.fillText("box", 110 + w1, 64);
    var w2 = ctx.measureText("box").width; ctx.fillStyle = sub; ctx.font = '400 24px "Lexend Deca", system-ui, sans-serif';
    ctx.fillText("· brain test", 110 + w1 + w2 + 14, 66);
    ctx.textAlign = "right"; ctx.font = '400 22px "JetBrains Mono", monospace'; ctx.fillStyle = sub; ctx.fillText(dateStr(), W - 60, 64); ctx.textAlign = "left";

    // radar (left)
    drawRadarCanvas(ctx, scores, 335, 360, 168, accent, sub, subAlt);

    // right column
    var rx = 700;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = sub; ctx.font = '500 24px "Lexend Deca", system-ui, sans-serif'; ctx.fillText("BRAIN SCORE", rx, 162);
    ctx.fillStyle = accent; ctx.font = '700 132px "JetBrains Mono", monospace'; ctx.fillText(String(overall), rx, 286);
    var ow = ctx.measureText(String(overall)).width; ctx.fillStyle = sub; ctx.font = '400 40px "JetBrains Mono", monospace'; ctx.fillText("/100", rx + ow + 16, 286);

    ctx.textBaseline = "middle";
    var ly = 338, lh = 40;
    scores.forEach(function (s, i) {
      var y = ly + i * lh;
      ctx.fillStyle = text; ctx.font = '400 21px "Lexend Deca", system-ui, sans-serif'; ctx.fillText(s.name, rx, y);
      var bx = rx + 158, bw = 240;
      ctx.fillStyle = bgAlt; roundRect(ctx, bx, y - 6, bw, 12, 6); ctx.fill();
      ctx.fillStyle = accent; roundRect(ctx, bx, y - 6, bw * Math.max(0, Math.min(100, s.score)) / 100, 12, 6); ctx.fill();
      ctx.fillStyle = sub; ctx.font = '500 19px "JetBrains Mono", monospace'; ctx.textAlign = "right"; ctx.fillText(String(s.score), bx + bw + 46, y); ctx.textAlign = "left";
    });

    ctx.fillStyle = sub; ctx.font = '400 22px "JetBrains Mono", monospace'; ctx.fillText("fizzexual.github.io/Nerdbox", 60, H - 38);
  }
  function downloadCanvas(canvas, name) {
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a"); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, "image/png");
  }
  function sharePng(canvas, overall) {
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var text = "My Nerdbox brain score: " + overall + "/100 🧠";
      try {
        var file = new File([blob], "nerdbox-brain-test.png", { type: "image/png" });
        var data = { files: [file], title: "Nerdbox brain test", text: text + " fizzexual.github.io/Nerdbox" };
        if (navigator.canShare && navigator.canShare(data)) { navigator.share(data).catch(function () {}); return; }
      } catch (e) {}
      downloadCanvas(canvas, "nerdbox-brain-test.png");
    }, "image/png");
  }

  return {
    renderProfile: renderProfile,
    dailyCardHtml: dailyCardHtml,
    dailyGameId: dailyGameId,
    initDaily: initDaily,
    shareDaily: shareDaily,
    startBattery: startBattery
  };
})();
