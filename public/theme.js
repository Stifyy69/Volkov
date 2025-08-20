// public/theme.js
(function () {
  const KEY = "ui.theme";
  const sel = document.getElementById("themeSel");
  const body = document.body;

  function applyTheme(t) {
    const theme = t || "dark";
    body.setAttribute("data-theme", theme);
    try { localStorage.setItem(KEY, theme); } catch {}
    if (sel && sel.value !== theme) sel.value = theme;
  }

  // la load – citește ce e în localStorage sau "dark"
  let initial = "dark";
  try { initial = localStorage.getItem(KEY) || "dark"; } catch {}
  applyTheme(initial);

  // pe schimbare în select
  if (sel) {
    sel.addEventListener("change", (e) => applyTheme(e.target.value));
  }
})();
