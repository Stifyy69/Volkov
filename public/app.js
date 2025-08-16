const $status = document.getElementById('status');
const $form = document.getElementById('taxe-form');
const $log = document.getElementById('log');
const $result = document.getElementById('result');
const $resultBody = document.getElementById('result-body');
const $reset = document.getElementById('reset');

const log = (m) => {
  const line = `[${new Date().toLocaleTimeString()}] ${m}`;
  $log.textContent = `${line}\n${$log.textContent}`;
};

async function ping() {
  try {
    const r = await fetch('/health');
    const j = await r.json();
    $status.textContent = j.ok ? 'online' : 'offline';
  } catch {
    $status.textContent = 'offline';
  }
}

function onlyDigits(s){return /^\d+$/.test(s)}
function validateCNP(cnp){
  if(!cnp || cnp.length!==13 || !onlyDigits(cnp)) return false;
  const ctrl = '279146358279';
  let sum = 0;
  for(let i=0;i<12;i++){ sum += Number(cnp[i]) * Number(ctrl[i]); }
  const mod = sum % 11;
  const check = mod === 10 ? 1 : mod;
  return check === Number(cnp[12]);
}

$form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData($form);
  const data = Object.fromEntries(fd.entries());

  if(!validateCNP(data.cnp)){
    log('CNP invalid');
    alert('CNP invalid (13 cifre + cifră de control).');
    return;
  }

  const payload = {
    cnp: data.cnp.trim(),
    nume: (data.nume||'').trim(),
    suma: Number(data.suma),
    tip_suma: data.tip_suma,
    actiune: data.actiune,
    procent: data.procent ? Number(data.procent) : null,
    observatii: (data.observatii||'').trim()
  };

  try{
    const r = await fetch('/taxe/calculeaza', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    if(!r.ok) throw new Error(j.message || `Eroare ${r.status}`);
    log(`${payload.actiune} → OK (${j.total_net ?? j.total_brut ?? 'calcul'})`);
    $resultBody.innerHTML = `
      <div><strong>Acțiune</strong>: ${payload.actiune}</div>
      <div><strong>CNP</strong>: ${payload.cnp}</div>
      <div><strong>Nume</strong>: ${payload.nume || '-'}</div>
      <div><strong>Sumă input</strong>: ${payload.suma} (${payload.tip_suma})</div>
      ${j.tax ? `<div><strong>Taxă</strong>: ${j.tax}</div>`:''}
      ${j.total_net ? `<div><strong>Total net</strong>: ${j.total_net}</div>`:''}
      ${j.total_brut ? `<div><strong>Total brut</strong>: ${j.total_brut}</div>`:''}
    `;
    $result.hidden = false;
  }catch(err){
    log(`${payload.actiune} → EROARE: ${err.message}`);
    alert(err.message);
  }
});

$reset.addEventListener('click', ()=>{
  $form.reset();
  $result.hidden = true;
});

ping(); setInterval(ping, 8000);

