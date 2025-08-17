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
  const ISOweekStart = new Date(simple);
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
    const adminBtn = $$(".tabbtn").find(b => b.dataset.tab === "admin");
    if (adminBtn) adminBtn.classList.toggle("hidden", me.role !== "ADMIN");

    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");

    setTabs("taxe");
    [ "#weekSelect", "#dashWeekPicker", "#bfWeekPicker", "#profWeekPicker", "#tblWeekPicker" ]
      .map(sel => $(sel)).forEach(el => el && fillWeekSelect(el));

    loadTaxe();
    loadDrill();
    connectSSE();
  } catch {
    $("#app").classList.add("hidden");
    $("#auth").classList.remove("hidden");
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

// ===== Tabs
$$(".tabbtn").forEach(b => {
  b.addEventListener("click", async () => {
    setTabs(b.dataset.tab);
    if (b.dataset.tab === "taxe")      { loadTaxe(); loadDrill(); }
    if (b.dataset.tab === "dashboard") loadDashboard();
    if (b.dataset.tab === "admin")     loadAdmin();
    if (b.dataset.tab === "drillfamilies") loadBF();
    if (b.dataset.tab === "profile")   loadProfile();
    if (b.dataset.tab === "tables")    loadTablesAll();
  });
});

// ===== SSE
let es;
function connectSSE() {
  if (es) { try { es.close(); } catch {} }
  es = new EventSource("/events");
  es.addEventListener("taxe:new", () => { loadTaxe(); loadDashboard(); loadTablesAll(); });
  es.addEventListener("drill:new", () => { loadDrill(); loadDashboard(); loadBF(); loadTablesAll(); });
  es.addEventListener("ping", () => {});
}

// ===== Taxe
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
  loadTaxe(); loadDashboard();
});

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
      if (row.metoda === "GRATIS" || row.tip === "GRATIS") suma = "GRATIS";
      else if (row.tip === "Bani curați") suma = "40.000$ curat";
      else if (row.tip === "Bani murdari") suma = "60.000$ murdar";
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="font-mono">${row.cnp}</td><td>${suma}</td><td>${row.remaining||""}</td>`;
      tbody.appendChild(tr);
    });
}

// ===== Burghiu (o cerere)
$("#drillForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const cnp = (f.cnp.value||"").trim();
  if (!/^\d{1,6}$/.test(cnp)) return alert("CNP invalid (max 6).");

  const cadru    = Number(f.cadru.value||0);
  const teava    = Number(f.teava.value||0);
  const mecanism = Number(f.mecanism.value||0);
  const fixare   = Number(f.fixare.value||0);
  if ((cadru+teava+mecanism+fixare) <= 0) return alert("Introdu minim o cantitate > 0.");

  const body = { cnp, family: f.family.value || null, cadru, teava, mecanism, fixare };
  const r = await api("/drill", { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Eroare la burghiu");

  f.reset();
  loadDrill(); loadDashboard(); loadBF(); loadTablesAll();
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
      <td>${j.costTotal ? "Bani murdari" : "GRATIS"}</td>
      <td>${j.costTotal ? money(j.costTotal) : "GRATIS"}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== Dashboard
function fillWeekSelect(sel){
  if (!sel || sel.options.length) return;
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
  const dashWeekSel = $("#dashWeekPicker");
  let selYear, selWeek;
  try { if (dashWeekSel?.value) ({year:selYear,week:selWeek} = JSON.parse(dashWeekSel.value)); } catch {}

  let clean = 0, dirty = 0;
  const daily = Array.from({length:7}, (_,i)=>({ day: dayNames[i], count:0, clean:0, dirty:0 }));

  const rT = await api("/taxe");
  let taxe = [];
  if (rT.ok) {
    taxe = await rT.json();
    taxe.forEach(t => {
      const created = t.createdAt ? new Date(t.createdAt) : new Date();
      if (selYear && selWeek && !inISOWeek(created, selYear, selWeek)) return;
      if (t.tip === "Bani curați") { clean += 40000; }
      if (t.tip === "Bani murdari") { dirty += 60000; }

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

  const rD = await api("/drill");
  const famMap = new Map();
  const topTaxByUser = new Map();
  const topDrillByUser = new Map();
  let totalPieces = 0;

  (taxe||[]).forEach(t=>{
    const created = t.createdAt ? new Date(t.createdAt) : new Date();
    if (selYear && selWeek && !inISOWeek(created, selYear, selWeek)) return;
    if (t.user) topTaxByUser.set(t.user, (topTaxByUser.get(t.user)||0) + 1);
  });

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
      if (j.user) topDrillByUser.set(j.user, (topDrillByUser.get(j.user)||0) + (j.costTotal||0));
    });
    $("#statDrillPieces").textContent = (totalPieces||0).toLocaleString("ro-RO");

    const famBody = $("#drillFamiliesTable tbody");
    famBody.innerHTML = "";
    [...famMap.entries()].sort((a,b)=>b[1]-a[1]).forEach(([fam,qty])=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${fam}</td><td>${qty}</td>`;
      famBody.appendChild(tr);
    });
  }

  const topTaxBody = $("#topCnpTaxe tbody");
  topTaxBody.innerHTML = "";
  [...topTaxByUser.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([user,count])=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${user}</td><td>${count}</td>`;
    topTaxBody.appendChild(tr);
  });

  const topDrillBody = $("#topCnpDrill tbody");
  topDrillBody.innerHTML = "";
  [...topDrillByUser.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([user,val])=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${user}</td><td>${money(val||0)}</td>`;
    topDrillBody.appendChild(tr);
  });
}

// ===== Burghiu Familii (tab)
function fillWeekSelectOnce(sel){ fillWeekSelect(sel); }
const bfWeekPicker = $("#bfWeekPicker");
function periodBF(){ return $$("input[name='bfPeriod']").find(i=>i.checked)?.value || "week"; }
$$("input[name='bfPeriod']").forEach(r => r.addEventListener("change", loadBF));
bfWeekPicker?.addEventListener("change", loadBF);

async function loadBF(){
  const period = periodBF();
  let url = `/admin/drill-families?period=${period}`;
  if (period === "week" && bfWeekPicker?.value) {
    const {year, week} = JSON.parse(bfWeekPicker.value);
    url += `&year=${year}&week=${week}`;
  }
  const r = await api(url);
  const tbody = $("#bfTable tbody"); tbody.innerHTML = "";
  if (!r.ok) { tbody.innerHTML = `<tr><td colspan="6">Fără acces</td></tr>`; return; }
  const rows = await r.json();
  rows.forEach(row=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.family}</td><td>${row.cadru}</td><td>${row.teava}</td><td>${row.mecanism}</td><td>${row.fixare}</td><td>${row.total}</td>`;
    tbody.appendChild(tr);
  });
}

// ===== My Profile
const profWeekPicker = $("#profWeekPicker");
profWeekPicker?.addEventListener("change", loadProfile);

async function loadProfile(){
  if (!profWeekPicker?.value) return;
  const {year, week} = JSON.parse(profWeekPicker.value);
  const r = await api(`/me/profile?year=${year}&week=${week}`);
  const box = $("#myProfileStats");
  if (!r.ok) { box.textContent = "Fără acces"; return; }
  const p = await r.json();
  box.innerHTML = `
    <div>Taxe: <b>${p.taxes.count}</b> | Curat: <b>${money(p.taxes.clean)}</b> | Murdar: <b>${money(p.taxes.dirty)}</b></div>
    <div>Burghiu: Piese <b>${(p.drill.pieces||0).toLocaleString("ro-RO")}</b> | Bani <b>${money(p.drill.money)}</b></div>
    <div>Split: User <b>${money(p.split.userShare)}</b> | Familie <b>${money(p.split.familyShare)}</b> | Total <b>${money(p.split.total)}</b></div>
  `;
}
$("#resetForm")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const f = e.target;
  const r = await api("/auth/change-password", { method:"POST", body: JSON.stringify({ oldPassword: f.oldPassword.value, newPassword: f.newPassword.value }) });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Eroare");
  alert("Parola a fost schimbată.");
  f.reset();
});

// ===== Tabele All
const tblWeekPicker = $("#tblWeekPicker");
$("#tblRefresh")?.addEventListener("click", loadTablesAll);

function renderTblHead(){
  const type = $("#tblType").value;
  const h = $("#tblHead"); h.innerHTML = "";
  if (type === "taxe") h.innerHTML = "<tr><th>ID</th><th>CNP</th><th>Plată</th><th>Suma</th><th>User</th><th>Familie</th><th>Creat</th><th></th></tr>";
  else h.innerHTML = "<tr><th>ID</th><th>CNP</th><th>Cadru</th><th>Țeavă</th><th>Mecanism</th><th>Fixare</th><th>User</th><th>Familie</th><th>Creat</th><th></th></tr>";
}
$("#tblType")?.addEventListener("change", ()=>{ renderTblHead(); loadTablesAll(); });

async function loadTablesAll(){
  renderTblHead();
  const type = $("#tblType").value;
  let url = `/admin/all?type=${type}`;
  if (tblWeekPicker?.value) {
    const {year, week} = JSON.parse(tblWeekPicker.value);
    url += `&year=${year}&week=${week}`;
  }
  const qU = ($("#tblFilterUser").value||"").trim();
  const qC = ($("#tblFilterCnp").value||"").trim();
  const qF = ($("#tblFilterFamily").value||"").trim();
  if (qU) url += `&user=${encodeURIComponent(qU)}`;
  if (qC) url += `&cnp=${encodeURIComponent(qC)}`;
  if (qF) url += `&family=${encodeURIComponent(qF)}`;

  const r = await api(url);
  const tbody = $("#tblAll tbody"); tbody.innerHTML = "";
  if (!r.ok) { tbody.innerHTML = `<tr><td colspan="10">Fără acces</td></tr>`; return; }
  const rows = await r.json();
  rows.forEach(row=>{
    const tr = document.createElement("tr");
    if (type === "taxe") {
      tr.innerHTML = `<td>${row.id}</td><td class="font-mono">${row.cnp}</td><td>${row.payment}</td><td>${row.amount ? money(row.amount) : "GRATIS"}</td><td>${row.user}</td><td>${row.family||"-"}</td><td>${new Date(row.createdAt).toLocaleString()}</td><td><button data-del="${row.id}" data-t="taxe" class="danger sm">Șterge</button></td>`;
    } else {
      tr.innerHTML = `<td>${row.id}</td><td class="font-mono">${row.cnp}</td><td>${row.cadru}</td><td>${row.teava}</td><td>${row.mecanism}</td><td>${row.fixare}</td><td>${row.user}</td><td>${row.family||"-"}</td><td>${new Date(row.createdAt).toLocaleString()}</td><td><button data-del="${row.id}" data-t="drill" class="danger sm">Șterge</button></td>`;
    }
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("button[data-del]").forEach(b=>{
    b.addEventListener("click", async ()=> {
      if (!confirm("Sigur ștergi?")) return;
      const t = b.dataset.t, id = b.dataset.del;
      const r = await api(`/admin/${t}/${id}`, { method: "DELETE" });
      if (!r.ok) return alert("Nu am putut șterge");
      loadTablesAll();
    });
  });
}

// ===== Admin
let adminRows = [];
$("#weekSelect")?.addEventListener("change", loadAdmin);

$("#inviteBtn")?.addEventListener("click", async () => {
  try {
    const role = $("#inviteRole").value;
    const r = await api("/invites", { method: "POST", body: JSON.stringify({ role }) });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "Nu s-a putut genera invitația");
    $("#inviteResult").value = j.link || j.code || "(fără link)";
  } catch { alert("Eroare la generarea invitației"); }
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
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Doar ADMIN are acces.</td></tr>`;
    return;
  }
  const list = await r.json();

  adminRows = (list||[]).map(u => ({
    user: u.username,
    total: u.total || 0,
    userShare: u.userShare || 0,
    familyShare: u.familyShare || 0,
  }));

  tbody.innerHTML = "";
  adminRows.sort((a,b)=>b.total-a.total).forEach(rw=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${rw.user}</td><td>${money(rw.userShare)}</td><td>${money(rw.familyShare)}</td><td>${money(rw.total)}</td>`;
    tbody.appendChild(tr);
  });
}

// init
hydrateMe();
setTabs("taxe");
