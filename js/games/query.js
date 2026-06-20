/* Query Quick — read a tiny table, write a SQL SELECT that returns the asked-for rows.
   A minimal hand-written interpreter (no sql.js, no libs, no network) evaluates a
   small subset: SELECT <cols> FROM <table> [WHERE ...] [ORDER BY ...] [LIMIT n]. */
NERDBOX.injectStyle("query", `
  .query-wrap { width: 100%; max-width: 640px; margin: 0 auto; position: relative; }
  .query-ask { font-size: 1.05rem; color: var(--text); margin-bottom: 0.9rem; line-height: 1.5; }
  .query-ask b { color: var(--accent); font-weight: 500; }
  .query-count { font-family: "JetBrains Mono", monospace; color: var(--sub); font-size: 0.8rem; }
  .query-table { width: 100%; border-collapse: collapse; font-family: "JetBrains Mono", monospace; font-size: 0.86rem; margin-bottom: 1.1rem; background: var(--bg-alt); border-radius: 10px; overflow: hidden; }
  .query-table th, .query-table td { padding: 0.5rem 0.85rem; text-align: left; border-bottom: 1px solid color-mix(in srgb, var(--text) 6%, transparent); }
  .query-table th { color: var(--accent); font-weight: 500; background: color-mix(in srgb, var(--text) 4%, transparent); }
  .query-table td { color: var(--text); }
  .query-table tr:last-child td { border-bottom: none; }
  .query-input { width: 100%; box-sizing: border-box; resize: vertical; min-height: 78px; background: var(--bg-alt); color: var(--text); border: 1px solid var(--sub-alt); border-radius: 10px; padding: 0.7rem 0.9rem; font-family: "JetBrains Mono", monospace; font-size: 0.95rem; line-height: 1.5; }
  .query-input:focus { outline: none; border-color: var(--accent); }
  .query-row { display: flex; gap: 0.7rem; align-items: center; margin-top: 0.9rem; flex-wrap: wrap; }
  .query-msg { font-family: "JetBrains Mono", monospace; font-size: 0.88rem; min-height: 1.3em; }
  .query-msg.ok { color: var(--go); }
  .query-msg.bad { color: var(--error); }
  .query-msg.warn { color: var(--accent); }
`);

NERDBOX.register({
  id: "query",
  name: "Query Quick",
  tagline: "write the SQL to get the answer",
  category: "knowledge",
  scoreMode: "max",
  formatScore: function (v) { return v + " solved"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/></svg>',

  mount: function (root, ctx) {
    var el = ctx.util.el;

    /* ---- fixed in-memory table ---- */
    var TABLE = "users";
    var COLS = ["id", "name", "age", "city"];
    var ROWS = [
      { id: 1, name: "Ada",   age: 36, city: "London" },
      { id: 2, name: "Liam",  age: 22, city: "Paris" },
      { id: 3, name: "Noor",  age: 41, city: "Cairo" },
      { id: 4, name: "Sora",  age: 28, city: "Paris" },
      { id: 5, name: "Kai",   age: 31, city: "Berlin" },
      { id: 6, name: "Mira",  age: 25, city: "London" }
    ];

    /* ===========================================================
       Tiny SQL interpreter.
       Grammar (keywords case-insensitive):
         SELECT <cols> FROM <table> [WHERE <cond>] [ORDER BY <col> [ASC|DESC]] [LIMIT <n>]
         <cols> = "*" | col (, col)*
         <cond> = <pred> ((AND|OR) <pred>)*   evaluated left-to-right, no parens
         <pred> = col <op> <value>            op in = != < > <= >=
         <value> = number | 'single quoted string'
       Throws on anything unsupported; callers wrap in try/catch.
       =========================================================== */
    function parseValue(raw) {
      var t = raw.trim();
      var m = t.match(/^'((?:[^'])*)'$/);          // 'string'
      if (m) return { type: "str", value: m[1] };
      if (/^-?\d+(?:\.\d+)?$/.test(t)) return { type: "num", value: Number(t) };
      throw new Error("bad value: " + t);
    }

    function parsePred(seg) {
      // operator: try 2-char before 1-char so >= is not read as >
      var m = seg.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(!=|<=|>=|=|<|>)\s*(.+?)\s*$/);
      if (!m) throw new Error("bad predicate: " + seg);
      var col = m[1];
      if (COLS.indexOf(col) < 0) throw new Error("unknown column: " + col);
      return { col: col, op: m[2], val: parseValue(m[3]) };
    }

    function evalPred(row, p) {
      var cell = row[p.col];
      var v = p.val.value;
      // compare numbers numerically, strings as strings; mismatched types => not equal
      if (p.val.type === "num") {
        if (typeof cell !== "number") return p.op === "!=";
      } else {
        if (typeof cell !== "string") return p.op === "!=";
      }
      switch (p.op) {
        case "=":  return cell === v;
        case "!=": return cell !== v;
        case "<":  return cell < v;
        case ">":  return cell > v;
        case "<=": return cell <= v;
        case ">=": return cell >= v;
      }
      throw new Error("bad op");
    }

    function evalWhere(row, where) {
      // where = { preds:[...], ops:["and"|"or",...] }  left-to-right
      var acc = evalPred(row, where.preds[0]);
      for (var i = 0; i < where.ops.length; i++) {
        var next = evalPred(row, where.preds[i + 1]);
        acc = where.ops[i] === "and" ? (acc && next) : (acc || next);
      }
      return acc;
    }

    function parse(sql) {
      var q = String(sql).replace(/;+\s*$/, "").trim();
      if (!q) throw new Error("empty");

      // Anchor the high-level clauses by uppercased keywords, keeping original casing
      // of operands so quoted strings stay intact.
      var U = q.toUpperCase();
      var iSel = U.indexOf("SELECT");
      if (iSel !== 0) throw new Error("must start with SELECT");
      var iFrom = U.indexOf(" FROM ");
      if (iFrom < 0) throw new Error("missing FROM");

      var iWhere = U.indexOf(" WHERE ");
      var iOrder = U.indexOf(" ORDER BY ");
      var iLimit = U.indexOf(" LIMIT ");

      // bounds for FROM operand = up to the first of WHERE/ORDER/LIMIT that appears
      function firstAfter(from) {
        var cands = [iWhere, iOrder, iLimit].filter(function (x) { return x > from; });
        return cands.length ? Math.min.apply(null, cands) : q.length;
      }

      var colsRaw = q.slice(iSel + 6, iFrom).trim();
      var fromEnd = firstAfter(iFrom);
      var tableRaw = q.slice(iFrom + 6, fromEnd).trim();
      if (tableRaw.toLowerCase() !== TABLE) throw new Error("unknown table: " + tableRaw);

      // columns
      var cols;
      if (colsRaw === "*") {
        cols = COLS.slice();
      } else {
        cols = colsRaw.split(",").map(function (c) { return c.trim(); });
        cols.forEach(function (c) { if (COLS.indexOf(c) < 0) throw new Error("unknown column: " + c); });
        if (!cols.length) throw new Error("no columns");
      }

      // WHERE
      var where = null;
      if (iWhere >= 0) {
        var wEnd = (function () {
          var cands = [iOrder, iLimit].filter(function (x) { return x > iWhere; });
          return cands.length ? Math.min.apply(null, cands) : q.length;
        })();
        var wRaw = q.slice(iWhere + 7, wEnd).trim();
        // split on AND / OR keeping order of operators
        var parts = wRaw.split(/\s+(AND|OR)\s+/i);
        var preds = [], ops = [];
        for (var i = 0; i < parts.length; i++) {
          if (i % 2 === 0) preds.push(parsePred(parts[i]));
          else ops.push(parts[i].toLowerCase());
        }
        where = { preds: preds, ops: ops };
      }

      // ORDER BY
      var order = null;
      if (iOrder >= 0) {
        var oEnd = (iLimit > iOrder) ? iLimit : q.length;
        var oRaw = q.slice(iOrder + 10, oEnd).trim();
        var om = oRaw.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s+(ASC|DESC))?$/i);
        if (!om) throw new Error("bad ORDER BY");
        if (COLS.indexOf(om[1]) < 0) throw new Error("unknown column: " + om[1]);
        order = { col: om[1], dir: (om[2] || "ASC").toUpperCase() };
      }

      // LIMIT
      var limit = null;
      if (iLimit >= 0) {
        var lRaw = q.slice(iLimit + 7).trim();
        if (!/^\d+$/.test(lRaw)) throw new Error("bad LIMIT");
        limit = Number(lRaw);
      }

      return { cols: cols, where: where, order: order, limit: limit };
    }

    function run(sql) {
      var plan = parse(sql);
      var out = ROWS.filter(function (r) { return plan.where ? evalWhere(r, plan.where) : true; });
      if (plan.order) {
        var col = plan.order.col, sign = plan.order.dir === "DESC" ? -1 : 1;
        out = out.slice().sort(function (a, b) {
          var x = a[col], y = b[col];
          if (x < y) return -1 * sign;
          if (x > y) return 1 * sign;
          return 0;
        });
      }
      if (plan.limit != null) out = out.slice(0, plan.limit);
      // project selected columns, preserving column order
      var projected = out.map(function (r) {
        var o = {};
        plan.cols.forEach(function (c) { o[c] = r[c]; });
        return o;
      });
      return { rows: projected, cols: plan.cols, ordered: !!plan.order };
    }

    /* ---- result comparison ---- */
    function rowKey(r, cols) {
      return cols.map(function (c) { return c + "=" + String(r[c]); }).join("");
    }
    function sameSet(a, b, cols) {
      if (a.length !== b.length) return false;
      var ca = a.map(function (r) { return rowKey(r, cols); }).sort();
      var cb = b.map(function (r) { return rowKey(r, cols); }).sort();
      for (var i = 0; i < ca.length; i++) if (ca[i] !== cb[i]) return false;
      return true;
    }
    function sameSeq(a, b, cols) {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (rowKey(a[i], cols) !== rowKey(b[i], cols)) return false;
      return true;
    }

    /* ---- challenges (expected results computed by the intended query) ---- */
    var CHALLENGES = [
      {
        ask: "Select the <b>name</b> of users older than 30.",
        sql: "SELECT name FROM users WHERE age > 30",
        ordered: false
      },
      {
        ask: "Select <b>all columns</b> for users in <b>'Paris'</b>.",
        sql: "SELECT * FROM users WHERE city = 'Paris'",
        ordered: false
      },
      {
        ask: "Select <b>id</b> and <b>name</b> of the 2 youngest users, ordered by age.",
        sql: "SELECT id, name FROM users ORDER BY age ASC LIMIT 2",
        ordered: true
      },
      {
        ask: "Select the <b>name</b> of users aged between 25 and 35 (inclusive).",
        sql: "SELECT name FROM users WHERE age >= 25 AND age <= 35",
        ordered: false
      },
      {
        ask: "Select every <b>city</b>, ordered Z to A.",
        sql: "SELECT city FROM users ORDER BY city DESC",
        ordered: true
      }
    ];
    // precompute expected results from the intended queries
    CHALLENGES.forEach(function (c) {
      var r = run(c.sql);
      c.expected = r.rows;
      c.cols = r.cols;
    });

    /* ---- DOM ---- */
    var status = el("div", "g-status", "");
    var wrap = el("div", "query-wrap");
    root.appendChild(status);
    root.appendChild(wrap);

    var order = ctx.util.shuffle(CHALLENGES.map(function (_, i) { return i; }));
    var step = 0, solved = 0, finished = false;
    var textarea = null;

    function escapeText(s) {
      return String(s).replace(/[&<>"']/g, function (ch) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
      });
    }

    function tableHtml() {
      var h = '<table class="query-table"><thead><tr>';
      COLS.forEach(function (c) { h += "<th>" + escapeText(c) + "</th>"; });
      h += "</tr></thead><tbody>";
      ROWS.forEach(function (r) {
        h += "<tr>";
        COLS.forEach(function (c) { h += "<td>" + escapeText(r[c]) + "</td>"; });
        h += "</tr>";
      });
      h += "</tbody></table>";
      return h;
    }

    function updateStatus() {
      status.innerHTML = '<span class="query-count">' + (step + 1) + " / " + CHALLENGES.length +
        "</span><span class=\"query-count\">solved: " + solved + "</span>";
    }

    function render() {
      finished = false;
      updateStatus();
      var ch = CHALLENGES[order[step]];
      wrap.innerHTML =
        '<div class="query-ask">' + ch.ask + "</div>" +
        tableHtml() +
        '<textarea class="query-input" spellcheck="false" placeholder="SELECT ... FROM ' + TABLE + '"></textarea>' +
        '<div class="query-row">' +
          '<button class="g-btn">run query</button>' +
          '<span class="query-msg"></span>' +
        "</div>";
      textarea = wrap.querySelector(".query-input");
      var btn = wrap.querySelector(".g-btn");
      var msg = wrap.querySelector(".query-msg");
      btn.addEventListener("click", function () { submit(msg); });
      textarea.addEventListener("keydown", function (e) {
        // Ctrl/Cmd+Enter runs the query
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); submit(msg); }
      });
      textarea.focus();
    }

    function submit(msg) {
      if (finished) return;
      var ch = CHALLENGES[order[step]];
      var result;
      try {
        result = run(textarea.value);
      } catch (e) {
        msg.className = "query-msg warn";
        msg.textContent = "couldn't run that query";
        return;
      }
      var ok = ch.ordered
        ? sameSeq(result.rows, ch.expected, ch.cols)
        : sameSet(result.rows, ch.expected, ch.cols);

      if (ok) {
        solved++;
        msg.className = "query-msg ok";
        msg.textContent = "correct!";
        ctx.submitScore(solved);
        updateStatus();
        finished = true;
        if (step + 1 >= CHALLENGES.length) {
          setTimeout(allDone, 650);
        } else {
          setTimeout(function () { step++; render(); }, 650);
        }
      } else {
        msg.className = "query-msg bad";
        var n = result.rows.length;
        msg.textContent = "not quite — returned " + n + " row" + (n === 1 ? "" : "s");
      }
    }

    function allDone() {
      updateStatus();
      var best = ctx.submitScore(solved);
      wrap.innerHTML =
        '<div class="g-overlay show" style="position:static;background:none;backdrop-filter:none;padding:1.5rem 0;">' +
          '<div class="g-result">' +
            '<div class="g-big">' + solved + "</div>" +
            '<div class="g-sub">all solved!' + (best ? " · new best!" : "") + "</div>" +
            '<button class="g-btn">play again</button>' +
          "</div>" +
        "</div>";
      wrap.querySelector(".g-btn").addEventListener("click", function () {
        order = ctx.util.shuffle(CHALLENGES.map(function (_, i) { return i; }));
        step = 0; solved = 0;
        render();
      });
    }

    render();

    return function teardown() { /* no timers/listeners outside root to clean up */ };
  }
});
