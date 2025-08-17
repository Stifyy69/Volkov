// ===== Helpers =====
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

// ISO week utils
function isoYearWeek(d){
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((date - yearStart)/86400000)+1)/7);
  return { year: date.getUTCFullYear(), week: weekNo };
}
function mondayOfISOWeek(year, week){
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const ISOweekStart = simple;
  if (dow <= 4) ISOweekStart.setUTCDate(simple.getUTCDate() - dow + 1);
  else ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - dow);
  return ISOweekStart;
}
function inISOWeek(d, year, week){
  const start = mondayOfISOWeek(year, week);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);
  return d >= start && d < end;
}
const dayNames = ["Lun","Mar","Mie","Joi","Vin","Sâm","Dum"];

// ===== Auth =====
async function hydrateMe() {
  try {
    const r = await api("/auth/me");
    if (!r.ok) throw 0;
    const me = await r.json();
    $("#whoami").textContent = `${me.username} [${me.role}]`;
    // role-based tabs
    const adminBtn = $$(".tabbtn").find(b => b.dataset.tab === "admin");
    if (adminBtn) adminBtn.classList.toggle("hidden", me.role !== "ADMIN");
    $("#auth").classList.add("hidden");
    setTabs("taxe");
    fillWeekSelect($("#weekSelect"));
    fillWeekSelect($("#dashWeekPicker"));
    loadTaxe();
    loadDrill();
    // SSE connect after auth
    connectSSE();
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

// ===== Tabs =====
$$(".tabbtn").forEach(b => {
  b.addEventListener("click", async () => {
    setTabs(b.dataset.tab);
    if (b.dataset.tab === "taxe")      { loadTaxe(); loadDrill(); }
    if (b.dataset.tab === "dashboard") loadDashboard();
    if (b.dataset.tab === "admin")     loadAdmin();
  });
});

// ===== SSE (live) =====
let es;
function connectSSE() {
  if (es) { try { es.close(); } catch {} }
  es = new EventSource("/events");
  es.addEventListener("taxe:new", () => { loadTaxe(); loadDashboard(); });
  es.addEventListener("drill:new", () => { loadDrill(); loadDashboard(); });
  es.addEventListener("ping", () => {}); // keepalive
}

// ===== Taxe =====
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
  // live vine și din SSE, dar facem și reload local ca fallback
  loadTaxe(); loadDashboard();
});

// state + search
let taxeCache = [];
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
      if (row.metoda === "GRATIS" || row.tip === "GRATIS") {
        suma = "GRATIS";
      } else if (row.tip === "Bani curați") {
        suma = "40.000$ curat";
      } else if (row.tip === "Bani murdari") {
        suma = "60.000$ murdar";
      }
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="font-mono">${row.cnp}</td><td>${suma}</td><td>${row.remaining||""}</td>`;
      tbody.appendChild(tr);
    });
}

// ===== Burghiu =====
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
      family: f.family.value || null
    };
    const r = await api("/drill", { method: "POST", body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return alert(j.error || `Eroare la ${p.key}`);
  }

  f.reset();
  loadDrill(); loadDashboard();
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

// ===== Dashboard (strict pe săptămâna selectată) =====
let chartFamilies, chartWeekly;

function fillWeekSelect(sel){
  if (!sel || sel.options.length) return;
  // 30 săptămâni înapoi
  const now = new Date();
  const set = new Set();
  for (let i=0;i<30;i++){
    const d = new Date(now); d.setDate(d.getDate() - i*7);
    const {year, week} = isoYearWeek(d);
    const key = `${year}-W${String(week).padStart(2,"0")}`;
    if (set.has(key)) continue;
    set.add(key);
    const opt = document.createElement("option");
    opt.value = JSON.stringify({year, week});
    opt.textContent = key;
    sel.appendChild(opt);
  }
}

$("#dashWeekPicker")?.addEventListener("change", loadDashboard);

async function loadDashboard() {
  // week selection
  const dashWeekSel = $("#dashWeekPicker");
  let selYear, selWeek;
  try { if (dashWeekSel?.value) ({year:selYear,week:selWeek} = JSON.parse(dashWeekSel.value)); } catch {}

  // 1) Taxe pe săptămână
  let clean = 0, dirty = 0;
  const daily = Array.from({length:7}, (_,i)=>({ day: dayNames[i], count:0, clean:0, dirty:0 }));

  const rT = await api("/taxe");
  if (rT.ok) {
    const taxe = await rT.json();
    taxe.forEach(t => {
      const created = t.createdAt ? new Date(t.createdAt) : new Date();
      if (selYear && selWeek && !inISOWeek(created, selYear, selWeek)) return;

      if (t.tip === "Bani curați") { clean += 40000; }
      if (t.tip === "Bani murdari") { dirty += 60000; }
      if (t.tip === "GRATIS") { /* nu adăugăm bani */ }

      const wd = (created.getDay() + 6) % 7;
      const row = daily[wd];
      row.count += 1;
      if (t.tip === "Bani curați")  row.clean += 40000;
      if (t.tip === "Bani murdari") row.dirty += 60000;
    });
  }
  $("#statTaxClean").textContent = money(clean);
  $("#statTaxDirty").textContent = money(dirty);

  const dBody = $("#dashDailyTable tbody");
  dBody.innerHTML = "";
  daily.forEach(d => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${d.day}</td><td>${d.count}</td><td>${money(d.clean)}</td><td>${money(d.dirty)}</td>`;
    dBody.appendChild(tr);
  });

  // 2) Burghiu pe săptămână + topuri
  const rD = await api("/drill");
  const famMap = new Map();
  const cnpMapT = new Map(); // taxe top
  const cnpMapD = new Map(); // drill top
  let totalPieces = 0;

  if (rD.ok) {
    const jobs = await rD.json();
    const jobsWeek = jobs.filter(j => {
      if (!selYear || !selWeek) return true;
      const dt = j.createdAt ? new Date(j.createdAt) : new Date();
      return inISOWeek(dt, selYear, selWeek);
    });

    jobsWeek.forEach(j=>{
      const pieces = j.cadru + j.teava + j.mecanism + j.fixare;
      totalPieces += pieces;
      const fam = j.family || "(fără)";
      famMap.set(fam, (famMap.get(fam)||0) + pieces);

      // Top drill pe CNP (după bani)
      const key = `${j.cnp}::${j.user||""}`;
      const prev = cnpMapD.get(key) || { cnp:j.cnp, user:j.user||"", drill$:0 };
      prev.drill$ += (j.costTotal||0);
      cnpMapD.set(key, prev);
    });

    $("#statDrillPieces").textContent = (totalPieces||0).toLocaleString("ro-RO");

    // Familii burghiu (sort desc)
    const famBody = $("#drillFamiliesTable tbody");
    famBody.innerHTML = "";
    [...famMap.entries()].sort((a,b)=>b[1]-a[1]).forEach(([fam,qty])=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${fam}</td><td>${qty}</td>`;
      famBody.appendChild(tr);
    });
  }

  // Top CNP taxe (din taxeCache dar filtrat pe săptămână)
  const topTaxBody = $("#topCnpTaxe tbody");
  topTaxBody.innerHTML = "";
  const topTaxMap = new Map();
  (taxeCache||[]).forEach(t=>{
    const created = t.createdAt ? new Date(t.createdAt) : new Date();
    if (selYear && selWeek && !inISOWeek(created, selYear, selWeek)) return;
    if (t.tip === "Bani curați" || t.tip === "Bani murdari") {
      const key = `${t.cnp}::${t.user||""}`;
      const prev = topTaxMap.get(key) || { cnp:t.cnp, user:t.user||"", taxe:0 };
      prev.taxe += 1;
      topTaxMap.set(key, prev);
    }
  });
  [...topTaxMap.values()]
    .sort((a,b)=>b.taxe-a.taxe)
    .slice(0,20)
    .forEach(row=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="font-mono">${row.cnp}</td><td>${row.user||"-"}</td><td>${row.taxe}</td>`;
      topTaxBody.appendChild(tr);
    });

  // Top CNP drill (din cnpMapD)
  const topDrillBody = $("#topCnpDrill tbody");
  topDrillBody.innerHTML = "";
  [...cnpMapD.values()]
    .sort((a,b)=>b.drill$-a.drill$)
    .slice(0,20)
    .forEach(row=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="font-mono">${row.cnp}</td><td>${row.user||"-"}</td><td>${money(row.drill$||0)}</td>`;
      topDrillBody.appendChild(tr);
    });
}

// ===== Admin =====
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

  adminRows = (list||[]).map(u => ({
    user: u.username,
    cnp:  "",
    taxe: 0,            // putem adăuga split per tip dacă expune backend
    drill: 0,
    total: u.total || 0,
    userShare: u.userShare || 0,
    familyShare: u.familyShare || 0,
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
  rows.sort((a,b)=>b.total-a.total).forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.user}</td><td>${money(r.userShare)}</td><td>${money(r.familyShare)}</td><td>${money(r.total)}</td>`;
    tbody.appendChild(tr);
  });
}

// ===== Init =====
hydrateMe();
setTabs("taxe");
