// ========== Helpers ==========
const api = (path, opts = {}) =>
  fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
      ...(localStorage.token ? { Authorization: "Bearer " + localStorage.token } : {})
    }
  });

const $  = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const money = (n=0) => `${(n||0).toLocaleString("ro-RO")} $`;

function setTabs(active) {
  $$(".tabbtn").forEach(b => b.dataset.active = (b.dataset.tab === active));
  $$(".tab").forEach(sec => sec.id === `tab-${active}` ? sec.classList.remove("hidden") : sec.classList.add("hidden"));
}

// ========== Auth ==========
async function hydrateMe() {
  try {
    const r = await api("/auth/me");
    if (!r.ok) throw 0;
    const me = await r.json();
    $("#whoami").textContent = `${me.username} [${me.role}]`;
    // Admin tab only for ADMIN
    const adminBtn = $$(".tabbtn").find(b => b.dataset.tab === "admin");
    if (adminBtn) adminBtn.classList.toggle("hidden", me.role !== "ADMIN");
    $("#auth").classList.add("hidden");
    setTabs("taxe");
    loadTaxe();
    loadDrill();
  } catch {
    $("#auth").classList.remove("hidden");
    setTabs("taxe");
  }
}

$("#logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("token");
  location.reload();
});

$("#loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const r = await api("/auth/login", { method: "POST", body: JSON.stringify({ username: f.username.value, password: f.password.value })});
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Login eșuat");
  localStorage.token = j.token;
  hydrateMe();
});

$("#registerForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {
    inviteCode: f.inviteCode.value,
    username:   f.username.value,
    nickname:   f.nickname.value,
    password:   f.password.value,
    cnp:        f.cnp.value
  };
  const r = await api("/auth/register", { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Register eșuat");
  localStorage.token = j.token;
  hydrateMe();
});

// ========== Tabs ==========
$$(".tabbtn").forEach(b => {
  b.addEventListener("click", async () => {
    setTabs(b.dataset.tab);
    if (b.dataset.tab === "taxe")      { loadTaxe(); loadDrill(); }
    if (b.dataset.tab === "dashboard") loadDashboard();
    if (b.dataset.tab === "admin")     { fillWeekSelect(); loadAdmin(); }
  });
});

// ========== Taxe ==========
const metodaSelect = $("#metodaSelect");
const gratisWrap    = $("#gratisWrap");

metodaSelect?.addEventListener("change", () => {
  const isGratis = metodaSelect.value === "gratis";
  gratisWrap.classList.toggle("hidden", !isGratis);
});

$("#taxeForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const cnp = (f.cnp.value||"").trim();
  if (!/^\d{1,6}$/.test(cnp)) return alert("CNP invalid (max 6).");

  const body = { cnp, metoda: f.metoda.value };
  if (f.metoda.value === "gratis") body.gratisFamilie = f.gratisFamilie.value;

  const r = await api("/taxe", { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Eroare la taxă");
  f.reset(); metodaSelect.dispatchEvent(new Event("change"));
  loadTaxe();
});

async function loadTaxe() {
  const r = await api("/taxe");
  if (!r.ok) return;
  const data = await r.json();
  const tbody = $("#taxeTable tbody");
  tbody.innerHTML = "";
  (data || []).forEach(row => {
    // Format: CNP | 40.000$ curat | Timp
    let suma = "";
    if (row.tip === "Bani curați")       suma = "40.000$ curat";
    else if (row.tip === "Bani murdari") suma = "60.000$ murdar";
    else if (row.tip === "Oțel")         suma = "15 buc oțel";
    else if (row.tip === "Praf de pușcă")suma = "25 buc praf";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="font-mono">${row.cnp}</td><td>${suma}</td><td>${row.remaining||""}</td>`;
    tbody.appendChild(tr);
  });
}

// refresh live
setInterval(() => {
  if (!$("#tab-taxe").classList.contains("hidden")) { loadTaxe(); loadDrill(); }
}, 20000);

// ========== Burghiu ==========
$("#drillForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const cnp = (f.cnp.value||"").trim();
  if (!/^\d{1,6}$/.test(cnp)) return alert("CNP invalid (max 6).");

  const components = [
    { key:"cadru",    val: Number(f.cadru.value||0) },
    { key:"teava",    val: Number(f.teava.value||0) },
    { key:"mecanism", val: Number(f.mecanism.value||0) },
    { key:"fixare",   val: Number(f.fixare.value||0) },
  ].filter(p => p.val > 0);

  if (components.length === 0) return alert("Introdu minim o cantitate > 0.");

  for (const p of components) {
    const body = {
      cnp,
      part: p.key,
      quantity: p.val,
      family: f.family.value || null,
      cashType: "DIRTY" // doar bani murdari
    };
    const r = await api("/drill", { method: "POST", body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return alert(j.error || `Eroare la ${p.key}`);
  }

  f.reset();
  loadDrill();
});

async function loadDrill() {
  const r = await api("/drill");
  if (!r.ok) return;
  const list = await r.json();
  const tbody = $("#drillTable tbody");
  tbody.innerHTML = "";
  (list || []).forEach(j => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="font-mono">${j.cnp}</td>
      <td>${j.family||"-"}</td>
      <td>${j.cadru}</td>
      <td>${j.teava}</td>
      <td>${j.mecanism}</td>
      <td>${j.fixare}</td>
      <td>Bani murdari</td>
      <td>${money(j.costTotal || 0)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ========== Dashboard ==========
let chartFamilies, chartWeekly;

async function loadDashboard() {
  try {
    // 1) totaluri taxe curat / murdar din /taxe (active)
    const rT = await api("/taxe");
    if (rT.ok) {
      const taxe = await rT.json();
      let clean = 0, dirty = 0;
      (taxe||[]).forEach(t => {
        if (t.tip === "Bani curați") clean += 40000;
        if (t.tip === "Bani murdari") dirty += 60000;
      });
      $("#statTaxClean").textContent = money(clean);
      $("#statTaxDirty").textContent = money(dirty);
    }

    // 2) total burghiu (bani murdari) din /drill
    const rD = await api("/drill");
    if (rD.ok) {
      const jobs = await rD.json();
      const drillTotal = (jobs||[]).reduce((s,j)=> s + (j.costTotal||0), 0);
      $("#statDrillDirty").textContent = money(drillTotal);

      // grafice simple
      // families chart: bucăți pe familie
      const famMap = new Map();
      jobs.forEach(j=>{
        const k = j.family || "(fără)";
        famMap.set(k, (famMap.get(k)||0) + j.cadru + j.teava + j.mecanism + j.fixare);
      });
      drawFamilies([...famMap.keys()], [...famMap.values()]);
    }

    // weekly chart: dacă backend expune /stats/operator (opțional)
    try {
      const rS = await api("/stats/operator");
      if (rS.ok) {
        const s = await rS.json();
        const labels = (s.weekly||[]).map(w => `W${w.week}`);
        const data   = (s.weekly||[]).map(w => w.total);
        drawWeekly(labels, data);
      }
    } catch {}
  } catch (e) {}
}

function drawFamilies(labels, data) {
  const ctx = $("#chartFamilies").getContext("2d");
  if (chartFamilies) chartFamilies.destroy();
  chartFamilies = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Bucăți", data }] },
    options: { responsive: true, plugins: { legend: { display:false } } }
  });
}

function drawWeekly(labels, data) {
  const ctx = $("#chartWeekly").getContext("2d");
  if (chartWeekly) chartWeekly.destroy();
  chartWeekly = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "Bani murdari", data, tension: 0.35 }] },
    options: { responsive: true, plugins: { legend: { display:false } } }
  });
}

// ========== Admin ==========
let adminRows = [];
function isoWeeksBack(n=20){
  const res = [];
  const now = new Date();
  for (let i=0;i<n;i++){
    const d = new Date(now);
    d.setDate(d.getDate() - i*7);
    const {year, week} = isoYearWeek(d);
    const key = `${year}-W${String(week).padStart(2,"0")}`;
    if (!res.find(x=>x.key===key)) res.push({key, year, week});
  }
  return res;
}
function isoYearWeek(d){
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((date - yearStart)/86400000)+1)/7);
  return { year: date.getUTCFullYear(), week: weekNo };
}
function fillWeekSelect(){
  const sel = $("#weekSelect");
  if (!sel || sel.options.length) return;
  isoWeeksBack(30).forEach(({key,year,week})=>{
    const opt = document.createElement("option");
    opt.value = JSON.stringify({year,week});
    opt.textContent = key;
    sel.appendChild(opt);
  });
}

$("#weekSelect")?.addEventListener("change", () => loadAdmin());

$("#searchInput")?.addEventListener("input", (e) => {
  const q = (e.target.value||"").toLowerCase();
  const filtered = adminRows.filter(r =>
    r.user.toLowerCase().includes(q) ||
    (r.cnp||"").toLowerCase().includes(q)
  );
  renderAdmin(filtered);
});

async function loadAdmin() {
  const sel = $("#weekSelect");
  let url = "/admin/stats";
  try {
    if (sel && sel.value) {
      const {year, week} = JSON.parse(sel.value);
      // dacă backend-ul are suport, va filtra pe săptămână:
      url = `/admin/stats?year=${year}&week=${week}`;
    }
  } catch {}

  const r = await api(url);
  const tbody = $("#admTable tbody");
  if (r.status === 403) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-slate-400">Doar ADMIN are acces.</td></tr>`;
    return;
  }
  const list = await r.json();

  // dacă backend-ul returnează sume, le folosim; altfel cădem pe 0
  adminRows = (list||[]).map(u => ({
    user: u.username,
    cnp:  u.cnp || "",
    taxe: u.taxeAmount ?? 0,        // așteptat din backend (total $ taxe)
    drill: u.drillAmount ?? 0,      // așteptat din backend (total $ burghiu murdar)
    total: (u.taxeAmount ?? 0) + (u.drillAmount ?? 0)
  }));

  renderAdmin(adminRows);
}

function renderAdmin(rows) {
  const tbody = $("#admTable tbody");
  tbody.innerHTML = "";
  if (!rows.length){
    tbody.innerHTML = `<tr><td colspan="4" class="text-slate-400">Fără date.</td></tr>`;
    return;
  }
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.user}</td><td>${money(r.taxe)}</td><td>${money(r.drill)}</td><td>${money(r.total)}</td>`;
    tbody.appendChild(tr);
  });
}

// ========== Init ==========
hydrateMe();
setTabs("taxe");
