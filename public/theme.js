// TEMA (dropdown: #themeSel). Persistă în localStorage.
(function themeInit(){
  const sel = document.getElementById('themeSel');
  const saved = localStorage.getItem('theme') || document.body.getAttribute('data-theme') || 'dark';
  document.body.setAttribute('data-theme', saved);
  if (sel) sel.value = saved;

  function applyTheme(value){
    document.body.setAttribute('data-theme', value);
    localStorage.setItem('theme', value);
  }
  if (sel){
    sel.addEventListener('change', () => applyTheme(sel.value));
  }
})();

// Afișează "Gratis familie" doar când metoda = gratis (din pagina Taxe)
(function gratisToggle(){
  function run(){
    const metoda = document.getElementById('metodaSelect');
    const wrap = document.getElementById('gratisWrap');
    if (!metoda || !wrap) return;
    const v = metoda.value;
    wrap.classList.toggle('hidden', v !== 'gratis');
  }
  document.addEventListener('change', (e)=>{
    if (e.target && e.target.id === 'metodaSelect') run();
  });
  // în caz că browserul reține ultima stare
  window.addEventListener('DOMContentLoaded', run);
})();

// Asigură clickabilitatea butoanelor dacă apar overlay-uri accidentale
(function ensureButtonsClickable(){
  try{
    const btns = document.querySelectorAll('button, .btn, .gold-btn');
    btns.forEach(b => {
      if (!b.style.position) b.style.position = 'relative';
      if (!b.style.zIndex)   b.style.zIndex   = '2';
      b.style.pointerEvents = 'auto';
    });
  }catch(e){}
})();
