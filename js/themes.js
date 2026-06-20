/* themes.js — theme registry + apply/persist. Colours live in css/style.css. */
(function () {
  "use strict";
  var THEMES = [
    { id: "serika_dark",  name: "serika dark" },
    { id: "dracula",      name: "dracula" },
    { id: "nord",         name: "nord" },
    { id: "gruvbox_dark", name: "gruvbox" },
    { id: "tokyo_night",  name: "tokyo night" },
    { id: "matrix",       name: "matrix" },
    { id: "serika_light", name: "serika light" }
  ];
  var KEY = "nerdbox-theme";
  var DEFAULT = "serika_dark";

  function isValid(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return true;
    return false;
  }
  function apply(id) {
    if (!isValid(id)) id = DEFAULT;
    document.documentElement.setAttribute("data-theme", id);
    try { localStorage.setItem(KEY, id); } catch (e) {}
    return id;
  }
  function load() {
    var s; try { s = localStorage.getItem(KEY); } catch (e) { s = null; }
    return isValid(s) ? s : DEFAULT;
  }
  function color(v) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#888";
  }
  window.NerdboxThemes = { list: THEMES, apply: apply, load: load, color: color, DEFAULT: DEFAULT };
})();
