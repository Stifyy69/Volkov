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

  let initial = "dark";
  try { initial = localStorage.getItem(KEY) || "dark"; } catch {}
  applyTheme(initial);

  if (sel) {
    sel.addEventListener("change", (e) => applyTheme(e.target.value));
  }
})();
