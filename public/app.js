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

// ISO week utils (pentru Dashboard/Admin)
function isoYearWeek(d){
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((date - yearStart)/86400000)+1)/7);
  return { year: date.getUTCFullYear(), week: weekNo };
}
function isoWeeksBack(n=26){
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
function mondayOfISOWeek(year, week){
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const ISOweekStart = simple;
  if (dow <= 4) ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  else ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  return ISOweekStart;
}
function inISOWeek(d, year, week){
  const start = mondayOfISOWeek(year, week);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);
  return d >= start && d < end;
}
const dayNames = ["Lun","Mar","Mie","Joi","Vin","Sâm","Dum"];

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
    // populate week pickers
    fillWeekSelect($("#weekSelect"));
    fillWeekSelect($("#dashWeekPicker"));
    // initial loads
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
    if (b.dataset.tab === "admin")     loadAdmin();
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

// state
let taxeCache = [];

// search bar pentru Taxe active
$("#taxSearch")?.addEventListener("input", () => renderTaxe(taxeCache));

async function loadTaxe() {
  const r = await api("/taxe");
  if (!r.ok) return;
  taxeCache = await r.json();
  renderTaxe(taxeCache);
}
function renderTaxe(list) {
  const q = ($("#taxSearch")?.value || "").trim().toLowerCase();
  const tbody = $("#taxeTable tbody");
  tbody.innerHTML = "";
  (list||[])
    .filter(row => !q || String(row.cnp).toLowerCase().includes(q))
    .forEach(row => {
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

let drillCache = [];

async function loadDrill() {
  const r = await api("/drill");
  if (!r.ok) return;
  drillCache = await r.json();
  renderDrill(drillCache);
}
function renderDrill(list){
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

function fillWeekSelect(sel){
  if (!sel || sel.options.length) return;
  isoWeeksBack(30).forEach(({key,year,week})=>{
    const opt = document.createElement("option");
    opt.value = JSON.stringify({year,week});
    opt.textContent = key;
    sel.appendChild(opt);
  });
}

$("#dashWeekPicker")?.addEventListener("change", loadDashboard);

async function loadDashboard() {
  // 1) Sume taxe curat/murdar (din /taxe — active) + daily table
  const dashWeekSel = $("#dashWeekPicker");
  let selYear, selWeek;
  try { if (dashWeekSel?.value) ({year:selYear,week:selWeek} = JSON.parse(dashWeekSel.value)); } catch {}

  const rT = await api("/taxe");
  let clean = 0, dirty = 0;
  const daily = Array.from({length:7}, (_,i)=>({ day: dayNames[i], count:0, clean:0, dirty:0 }));

  if (rT.ok) {
    const taxe = await rT.json();
    taxe.forEach(t => {
      if (t.tip === "Bani curați") clean += 40000;
      if (t.tip === "Bani murdari") dirty += 60000;

      // ⚠️ Fallback pe "azi" – pentru corectitudine adaugă createdAt în /taxe din backend.
      const created = new Date(); // fallback
      if (selYear && selWeek && !inISOWeek(created, selYear, selWeek)) return;
      const wd = (created.getDay() + 6) % 7; // 0..6 (luni..duminica)
      const row = daily[wd];
      row.count += 1;
      if (t.tip === "Bani curați")   row.clean += 40000;
      if (t.tip === "Bani murdari")  row.dirty += 60000;
    });
  }
  $("#statTaxClean").textContent = money(clean);
  $("#statTaxDirty").textContent = money(dirty);

  // daily table render
  const dBody = $("#dashDailyTable tbody");
  dBody.innerHTML = "";
  daily.forEach(d => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${d.day}</td><td>${d.count}</td><td>${money(d.clean)}</td><td>${money(d.dirty)}</td>`;
    dBody.appendChild(tr);
  });

  // 2) Burghiu: total piese + familii + top CNP + charts
  const rD = await api("/drill");
  let totalPieces = 0;
  const famMap = new Map();
  const cnpMap = new Map();

  if (rD.ok) {
    const jobs = await rD.json();
    // filtrare pe săptămâna selectată (pe baza createdAt)
    let jobsWeek = jobs;
    if (dashWeekSel?.value) {
      try {
        const {year, week} = JSON.parse(dashWeekSel.value);
        jobsWeek = jobs.filter(j => j.createdAt ? inISOWeek(new Date(j.createdAt), year, week) : true);
      } catch {}
    }

    jobsWeek.forEach(j=>{
      const pieces = j.cadru + j.teava + j.mecanism + j.fixare;
      totalPieces += pieces;
      const fam = j.family || "(fără)";
      famMap.set(fam, (famMap.get(fam)||0) + pieces);

      const key = `${j.cnp}::${j.user||""}`;
      cnpMap.set(key, {
        cnp: j.cnp,
        user: j.user || "", // dacă backend-ul nu-l dă, rămâne gol
        taxe: 0,            // completat când backend-ul va combina /taxe cu user
        drill$: (cnpMap.get(key)?.drill$ || 0) + (j.costTotal || 0)
      });
    });

    $("#statDrillPieces").textContent = (totalPieces||0).toLocaleString("ro-RO");

    // Burghiu pe familii table
    const famBody = $("#drillFamiliesTable tbody");
    famBody.innerHTML = "";
    [...famMap.entries()].sort((a,b)=>b[1]-a[1]).forEach(([fam,qty])=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${fam}</td><td>${qty}</td>`;
      famBody.appendChild(tr);
    });

    // Top CNP (cu user)
    const topBody = $("#topCnpTable tbody");
    topBody.innerHTML = "";
    [...cnpMap.values()].sort((a,b)=> (b.drill$ - a.drill$)).slice(0,20).forEach(row=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="font-mono">${row.cnp}</td><td>${row.user||"-"}</td><td>${row.taxe||0}</td><td>${money(row.drill$||0)}</td>`;
      topBody.appendChild(tr);
    });

    // charts
    drawFamilies([...famMap.keys()], [...famMap.values()]);
    // weekly chart – dacă ai /stats/operator cu weekly, îl folosim; altfel desenăm sumarul săptămânilor din jobs
    try {
      const rS = await api("/stats/operator");
      if (rS.ok) {
        const s = await rS.json();
        const labels = (s.weekly||[]).map(w => `W${w.week}`);
        const data   = (s.weekly||[]).map(w => w.total);
        drawWeekly(labels, data);
      } else {
        // fallback: agregă pe săptămână din jobs
        const wk = new Map();
        jobs.forEach(j=>{
          if (!j.createdAt) return;
          const d = new Date(j.createdAt);
          const {year, week} = isoYearWeek(d);
          const key = `${year}-W${String(week).padStart(2,"0")}`;
          wk.set(key, (wk.get(key)||0) + (j.costTotal||0));
        });
        const labels = [...wk.keys()].slice(-10);
        const data   = labels.map(k => wk.get(k));
        drawWeekly(labels, data);
      }
    } catch {
      // ignore
    }
  }
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

$("#weekSelect")?.addEventListener("change", loadAdmin);
$("#searchInput")?.addEventListener("input", (e) => {
  const q = (e.target.value||"").toLowerCase();
  const filtered = adminRows.filter(r =>
    r.user.toLowerCase().includes(q) ||
    (r.cnp||"").toLowerCase().includes(q)
  );
  renderAdmin(filtered);
});

// Invite link
$("#inviteBtn")?.addEventListener("click", async () => {
  try {
    const role = $("#inviteRole").value;
    const r = await api("/invites", { method: "POST", body: JSON.stringify({ role }) });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "Nu s-a putut genera invitația");
    $("#inviteResult").value = j.link || j.code || "(fără link)";
  } catch (e) {
    alert("Eroare la generarea invitației");
  }
});
$("#inviteCopy")?.addEventListener("click", async () => {
  const v = $("#inviteResult").value || "";
  if (!v) return;
  try { await navigator.clipboard.writeText(v); alert("Copiat!"); }
  catch { alert("Nu am putut copia"); }
});

async function loadAdmin() {
  const sel = $("#weekSelect");
  let url = "/admin/stats";
  try {
    if (sel && sel.value) {
      const {year, week} = JSON.parse(sel.value);
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

  // Calcul 50/50 – dacă backend trimite sumele, le folosim; altfel 0.
  adminRows = (list||[]).map(u => {
    const total = (u.taxeAmount ?? 0) + (u.drillAmount ?? 0);
    const userShare = Math.floor(total * 0.5);
    const familyShare = total - userShare;
    return {
      user: u.username,
      cnp:  u.cnp || "",
      taxe: u.taxeAmount ?? 0,
      drill: u.drillAmount ?? 0,
      total,
      userShare,
      familyShare
    };
  });

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
    tr.innerHTML = `<td>${r.user}</td><td>${money(r.userShare)}</td><td>${money(r.familyShare)}</td><td>${money(r.total)}</td>`;
    tbody.appendChild(tr);
  });
}

// ========== Init ==========
hydrateMe();
setTabs("taxe");
