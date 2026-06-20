/* Git Gauntlet — a scenario appears; type the right git command before the 60s clock runs out. */
NERDBOX.injectStyle("git", "\
.git-wrap { width: 100%; max-width: 540px; margin: 0 auto; position: relative; }\
.git-prompt { font-family: \"JetBrains Mono\", monospace; font-size: 1.25rem; line-height: 1.4; color: var(--text); text-align: center; min-height: 2.8em; display: flex; align-items: center; justify-content: center; margin-bottom: 1.4rem; transition: color 0.12s; }\
.git-prompt .git-task { color: var(--accent); }\
.git-form { display: flex; gap: 0.6rem; align-items: stretch; }\
.git-input { flex: 1; font-family: \"JetBrains Mono\", monospace; font-size: 1.05rem; color: var(--text); background: var(--bg-alt); border: 2px solid var(--sub-alt); border-radius: 10px; padding: 0.7rem 0.9rem; transition: border-color 0.12s, box-shadow 0.12s; }\
.git-input::placeholder { color: var(--sub); }\
.git-input:focus { outline: none; border-color: var(--accent); }\
.git-form.git-ok .git-input { border-color: var(--go); box-shadow: 0 0 0 3px color-mix(in srgb, var(--go) 28%, transparent); }\
.git-form.git-bad .git-input { border-color: var(--error); box-shadow: 0 0 0 3px color-mix(in srgb, var(--error) 28%, transparent); }\
.git-go { flex: 0 0 auto; }\
.git-feedback { font-family: \"JetBrains Mono\", monospace; font-size: 0.9rem; text-align: center; margin-top: 0.9rem; min-height: 1.4em; color: var(--sub); }\
.git-feedback.git-ok { color: var(--go); }\
.git-feedback.git-bad { color: var(--error); }\
.git-feedback b { color: var(--text); font-weight: 500; }\
.git-time { color: var(--accent); }\
.git-warn { color: var(--error); }\
");

NERDBOX.register({
  id: "git",
  name: "Git Gauntlet",
  tagline: "type the right git command",
  category: "knowledge",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 8.5v7"/><path d="M18 11.5c0 3-2 4-5 4.5"/><path d="M8.2 7.2L15.8 8"/></svg>',
  mount: function (root, ctx) {
    var TIME = 60;
    var SCENARIOS = [
      ["stage all changes", ["git add .", "git add -a", "git add --all"]],
      ["commit with the message fix", ["git commit -m fix", "git commit -m \"fix\""]],
      ["create and switch to a branch called dev", ["git checkout -b dev", "git switch -c dev"]],
      ["show the commit history", ["git log"]],
      ["discard local changes to app.js", ["git checkout app.js", "git checkout -- app.js", "git restore app.js"]],
      ["see which files changed (status)", ["git status"]],
      ["push to origin main", ["git push origin main", "git push -u origin main"]],
      ["pull the latest changes", ["git pull"]],
      ["undo the last commit, keep the changes", ["git reset --soft head~1", "git reset --soft head^"]],
      ["list all branches", ["git branch", "git branch -a", "git branch --list"]],
      ["merge branch dev into the current one", ["git merge dev"]],
      ["stash your changes", ["git stash"]],
      ["show the diff of unstaged changes", ["git diff"]],
      ["initialize a new repository", ["git init"]]
    ];

    // normalize: trim, lowercase, collapse internal whitespace, strip surrounding quotes
    function normalize(s) {
      var t = String(s).trim().toLowerCase().replace(/\s+/g, " ");
      // strip a single pair of matching surrounding quotes
      if (t.length >= 2) {
        var f = t.charAt(0), l = t.charAt(t.length - 1);
        if ((f === '"' && l === '"') || (f === "'" && l === "'")) {
          t = t.slice(1, -1).trim();
        }
      }
      return t;
    }
    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    var status = ctx.util.el("div", "g-status", "");
    var wrap = ctx.util.el("div", "git-wrap");
    var prompt = ctx.util.el("div", "git-prompt");
    var form = ctx.util.el("form", "git-form");
    var input = ctx.util.el("input", "git-input");
    input.type = "text";
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("spellcheck", "false");
    input.placeholder = "git ...";
    var go = ctx.util.el("button", "g-btn git-go", "go");
    go.type = "submit";
    var feedback = ctx.util.el("div", "git-feedback");
    form.appendChild(input); form.appendChild(go);
    wrap.appendChild(prompt); wrap.appendChild(form); wrap.appendChild(feedback);

    var overlay = ctx.util.el("div", "g-overlay");
    wrap.appendChild(overlay);
    root.appendChild(status); root.appendChild(wrap);

    var score = 0, timeLeft = TIME, ticker = null, cur = null, flashT = null, running = false;

    function updateStatus() {
      status.innerHTML = '<span class="git-score">' + score + ' pts</span><span class="' +
        (timeLeft <= 5 ? "git-warn" : "git-time") + '">' + Math.max(0, timeLeft) + "s</span>";
    }
    function nextScenario() {
      cur = SCENARIOS[ctx.util.rand(SCENARIOS.length)];
      prompt.innerHTML = '<span class="git-task">' + esc(cur[0]) + "</span>";
      input.value = "";
      input.focus();
    }
    function flash(cls) {
      form.classList.remove("git-ok", "git-bad");
      // force reflow so consecutive flashes restart the transition
      void form.offsetWidth;
      form.classList.add(cls);
      clearTimeout(flashT);
      flashT = setTimeout(function () { form.classList.remove("git-ok", "git-bad"); }, 420);
    }
    function submit() {
      if (!running || !cur) return;
      var guess = normalize(input.value);
      if (!guess) { input.focus(); return; }
      var accepted = cur[1];
      var hit = false;
      for (var i = 0; i < accepted.length; i++) {
        if (normalize(accepted[i]) === guess) { hit = true; break; }
      }
      if (hit) {
        score++;
        updateStatus();
        feedback.className = "git-feedback git-ok";
        feedback.textContent = "correct!";
        flash("git-ok");
      } else {
        feedback.className = "git-feedback git-bad";
        feedback.innerHTML = "answer: <b>" + esc(accepted[0]) + "</b>";
        flash("git-bad");
      }
      nextScenario();
    }
    function tick() {
      timeLeft--;
      updateStatus();
      if (timeLeft <= 0) finish();
    }
    function start() {
      running = true;
      score = 0; timeLeft = TIME;
      overlay.classList.remove("show");
      feedback.className = "git-feedback";
      feedback.textContent = "";
      updateStatus();
      status.style.visibility = "";
      clearInterval(ticker);
      ticker = setInterval(tick, 1000);
      nextScenario();
    }
    function finish() {
      running = false;
      clearInterval(ticker);
      clearTimeout(flashT);
      form.classList.remove("git-ok", "git-bad");
      var best = ctx.submitScore(score);
      status.textContent = "time!";
      overlay.innerHTML = '<div class="g-result"><div class="g-big">' + score +
        '</div><div class="g-sub">commands' + (best ? " &middot; new best!" : "") +
        '</div><button class="g-btn">play again</button></div>';
      overlay.querySelector("button").addEventListener("click", start);
      overlay.classList.add("show");
    }

    form.addEventListener("submit", function (e) { e.preventDefault(); submit(); });

    status.textContent = "type the git command for each scenario";
    prompt.innerHTML = '<span class="git-task">60 seconds &middot; how many can you get?</span>';
    overlay.innerHTML = '<div class="g-result"><button class="g-btn">start</button></div>';
    overlay.querySelector("button").addEventListener("click", start);
    overlay.classList.add("show");

    return function () { clearInterval(ticker); clearTimeout(flashT); };
  }
});
