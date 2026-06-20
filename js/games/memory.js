/* Number Memory — a number flashes, then you type it back. One more digit each round. */
NERDBOX.register({
  id: "memory",
  name: "Number Memory",
  tagline: "memorize the number, then type it",
  category: "memory",
  scoreMode: "max",
  formatScore: function (v) { return v + " digits"; },
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9l3-2v10"/><path d="M12 9a2 2 0 1 1 3.4 1.4L12 17h5"/></svg>',
  mount: function (root, ctx) {
    var digits = 1, num = "", timer = null;
    var status = ctx.util.el("div", "g-status", "");
    var stage = ctx.util.el("div", "nm-stage");
    root.appendChild(status); root.appendChild(stage);

    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

    function start() { digits = 1; round(); }
    function round() {
      num = "";
      for (var i = 0; i < digits; i++) num += ctx.util.rand(10);
      status.textContent = "memorize";
      stage.innerHTML = '<div class="nm-number">' + num + '</div><div class="nm-bar"><span></span></div>';
      var bar = stage.querySelector(".nm-bar span");
      var showMs = 900 + digits * 300;
      bar.style.width = "100%";
      void bar.offsetWidth;
      bar.style.transition = "width " + showMs + "ms linear";
      bar.style.width = "0%";
      timer = setTimeout(ask, showMs);
    }
    function ask() {
      status.textContent = "what was the number?";
      stage.innerHTML = '<input class="nm-input" inputmode="numeric" autocomplete="off" spellcheck="false" aria-label="the number" />' +
        '<button class="g-btn nm-submit">submit</button>';
      var input = stage.querySelector(".nm-input");
      var btn = stage.querySelector(".nm-submit");
      input.focus();
      function submit() { check(input.value.replace(/\s/g, "")); }
      btn.addEventListener("click", submit);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } });
    }
    function check(val) {
      if (val === num) {
        ctx.submitScore(digits);
        digits++;
        status.textContent = "correct!";
        timer = setTimeout(round, 650);
      } else {
        gameOver(val);
      }
    }
    function gameOver(val) {
      status.textContent = "game over";
      stage.innerHTML = '<div class="g-result"><div class="g-big">' + (digits - 1) + '</div>' +
        '<div class="g-sub">digits remembered</div>' +
        '<div class="nm-answer">it was <b>' + num + "</b>" + (val ? " · you typed " + esc(val) : "") + "</div>" +
        '<button class="g-btn">play again</button></div>';
      stage.querySelector(".g-btn").addEventListener("click", start);
    }

    status.textContent = "ready?";
    stage.innerHTML = '<button class="g-btn">start</button>';
    stage.querySelector(".g-btn").addEventListener("click", start);
    return function () { clearTimeout(timer); };
  }
});
