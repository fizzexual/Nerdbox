/* Guess the Language — a code snippet flashes; name the language before time runs out. */
NERDBOX.register({
  id: "guesslang",
  name: "Guess the Language",
  tagline: "name the language in 60 seconds",
  category: "knowledge",
  scoreMode: "max",
  formatScore: function (v) { return v + " pts"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9l-3 3 3 3"/><path d="M16 9l3 3-3 3"/><path d="M13 5l-2 14"/></svg>',
  mount: function (root, ctx) {
    var LANGS = {
      python: "Python", javascript: "JavaScript", typescript: "TypeScript",
      html: "HTML", css: "CSS", sql: "SQL", rust: "Rust", go: "Go",
      java: "Java", cpp: "C++", ruby: "Ruby", bash: "Bash", php: "PHP"
    };
    var SNIPPETS = [
      ["python", "def greet(name):\n    return f\"Hello, {name}!\""],
      ["python", "nums = [x * x for x in range(10) if x % 2 == 0]"],
      ["javascript", "const sum = (a, b) => a + b;\nconsole.log(sum(2, 3));"],
      ["javascript", "arr.filter(x => x > 0).map(x => x * 2);"],
      ["typescript", "function id<T>(x: T): T {\n  return x;\n}"],
      ["typescript", "interface User { id: number; name: string; }"],
      ["html", "<ul>\n  <li>One</li>\n  <li>Two</li>\n</ul>"],
      ["css", ".btn:hover {\n  color: #fff;\n  border-radius: 8px;\n}"],
      ["sql", "SELECT name, age\nFROM users\nWHERE age > 18;"],
      ["rust", "fn main() {\n    let v = vec![1, 2, 3];\n    println!(\"{:?}\", v);\n}"],
      ["go", "package main\n\nfunc main() {\n    fmt.Println(\"hello\")\n}"],
      ["java", "public class Main {\n    public static void main(String[] a) {}\n}"],
      ["cpp", "#include <iostream>\nint main() { std::cout << \"hi\"; }"],
      ["ruby", "3.times do |i|\n  puts i\nend"],
      ["bash", "for f in *.txt; do\n  echo \"$f\"\ndone"],
      ["php", "<?php\necho \"Hello, \" . $name;\n?>"]
    ];
    var TIME = 60;

    var status = ctx.util.el("div", "g-status", "");
    var stage = ctx.util.el("div", "gl-stage");
    root.appendChild(status); root.appendChild(stage);
    var score = 0, timeLeft = TIME, ticker = null, cur = null, locked = false;

    function start() {
      score = 0; timeLeft = TIME; locked = false;
      clearInterval(ticker);
      ticker = setInterval(function () {
        timeLeft--;
        updateStatus();
        if (timeLeft <= 0) finish();
      }, 1000);
      next();
    }
    function updateStatus() { status.innerHTML = '<span class="gl-score">' + score + ' pts</span><span class="gl-time">' + Math.max(0, timeLeft) + "s</span>"; }
    function next() {
      locked = false;
      cur = SNIPPETS[ctx.util.rand(SNIPPETS.length)];
      var answer = cur[0];
      var others = Object.keys(LANGS).filter(function (k) { return k !== answer; });
      var opts = ctx.util.shuffle(others).slice(0, 3).concat([answer]);
      opts = ctx.util.shuffle(opts);
      updateStatus();
      stage.innerHTML = '<pre class="gl-code"></pre><div class="gl-options"></div>';
      stage.querySelector(".gl-code").textContent = cur[1];
      var box = stage.querySelector(".gl-options");
      opts.forEach(function (k) {
        var b = ctx.util.el("button", "g-btn gl-opt", LANGS[k]);
        b.dataset.k = k;
        b.addEventListener("click", function () { choose(b, k); });
        box.appendChild(b);
      });
    }
    function choose(btn, k) {
      if (locked) return;
      locked = true;
      var answer = cur[0];
      var opts = stage.querySelectorAll(".gl-opt");
      opts.forEach(function (o) {
        if (o.dataset.k === answer) o.classList.add("correct");
        else if (o === btn) o.classList.add("wrong");
        o.disabled = true;
      });
      if (k === answer) { score++; updateStatus(); }
      setTimeout(function () { if (timeLeft > 0) next(); }, 650);
    }
    function finish() {
      clearInterval(ticker);
      var best = ctx.submitScore(score);
      status.textContent = "time!";
      stage.innerHTML = '<div class="g-result"><div class="g-big">' + score + '</div><div class="g-sub">points' + (best ? " · new best!" : "") + '</div><button class="g-btn">play again</button></div>';
      stage.querySelector(".g-btn").addEventListener("click", start);
    }

    status.textContent = "guess the language from a snippet";
    stage.innerHTML = '<button class="g-btn">start</button>';
    stage.querySelector(".g-btn").addEventListener("click", start);
    return function () { clearInterval(ticker); };
  }
});
