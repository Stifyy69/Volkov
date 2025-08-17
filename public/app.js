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

// ===== Auth / init =====
let ME = null;

async function hydrateMe() {
  try {
    const r = await api("/auth/me");
    if (!r.ok) throw 0;
    ME = await r.json();
    $("#whoami").textContent = `${ME.username} [${ME.role}]`;

    // admin-only tab
    const adminBtn = $$(".tabbtn").find(b => b.dataset.tab === "admin");
    if (adminBtn) adminBtn.classList.toggle("hidden", ME.role !== "ADMIN");

    // Dashboard: admin poate comuta Week/All
    if (ME.role === "ADMIN") $("#dashPeriodBox").classList.remove("hidden");

    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");

    // populate week pickers
    ["#weekSelect","#dashWeekPicker","#bfWeekPicker","#profWeekPicker","#tblWeekPicker"]
      .map(s => $(s)).forEach(el => el && fillWeekSelect(el));

    setTabs("taxe");
    loadTaxe();
    loadDrill();
    connectSSE();
  } catch {
    $("#auth").classList.remove("hidden");
    $("#app").classList.add("hidden");
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
  const body = { inviteCode: f.inviteCode.value, username: f.username.value, nickname: f.nickname.value, password: f.password.value, cnp: f.cnp.value };
  const r = await api("/auth/register", { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Register eșuat");
  localStorage.token = j.token;
  hydrateMe();
});

// Tabs
$$(".tabbtn").forEach(b => {
  b.addEventListener("click", () => {
    setTabs(b.dataset.tab);
    if (b.dataset.tab === "taxe") { loadTaxe(); loadDrill(); }
    if (b.dataset.tab === "dashboard") loadDashboard();
    if (b.dataset.tab === "admin") loadAdmin();
    if (b.dataset.tab === "drillfamilies") loadBF();
    if (b.dataset.tab === "profile") loadProfile();
    if (b.dataset.tab === "tables") loadTablesAll();
  });
});

// SSE
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
const gratisWrap = $("#gratisWrap");
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
      let suma = row.tip === "GRATIS" ? "GRATIS" :
                 row.tip === "Bani curați" ? "40.000$ curat" : "60.000$ murdar";
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="font-mono">${row.cnp}</td><td>${suma}</td><td>${row.remaining||""}</td>`;
      tbody.appendChild(tr);
    });
}

// ===== Burghiu (one-shot cu toate componentele)
$("#drillForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const cnp = (f.cnp.value||"").trim();
  if (!/^\d{1,6}$/.test(cnp)) return alert("CNP invalid (max 6).");

  const body = {
    cnp,
    family: f.family.value || null,
    cadru: Number(f.cadru.value||0),
    teava: Number(f.teava.value||0),
    mecanism: Number(f.mecanism.value||0),
    fixare: Number(f.fixare.value||0),
  };
  if ((body.cadru+body.teava+body.mecanism+body.fixare) <= 0) return alert("Introdu minim o cantitate > 0.");

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
    const isGratis = !j.costTotal;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="font-mono">${j.cnp}</td>
      <td>${j.family||"-"}</td>
      <td>${j.cadru}</td>
      <td>${j.teava}</td>
      <td>${j.mecanism}</td>
      <td>${j.fixare}</td>
      <td>${isGratis ? "GRATIS" : "Bani murdari"}</td>
      <td>${isGratis ? "GRATIS" : money(j.costTotal)}</td>`;
    tbody.appendChild(tr);
  });
}

// ===== Dashboard
function fillWeekSelect(sel){
  if (!sel || sel.options.length) return;
  const now = new Date(); const set = new Set();
  for (let i=0;i<30;i++){
    const d = new Date(now); d.setDate(d.getDate() - i*7);
    const {year, week} = isoYearWeek(d);
    const key = `${year}-W${String(week).padStart(2,"0")}`;
    if (set.has(key)) continue; set.add(key);
    const opt = document.createElement("option");
    opt.value = JSON.stringify({year, week});
    opt.textContent = key; sel.appendChild(opt);
  }
}
$("#dashWeekPicker")?.addEventListener("change", loadDashboard);
$$("input[name='dashPeriod']").forEach(r => r.addEventListener("change", loadDashboard));
$("#famSearch")?.addEventListener("input", loadDashboard);

async function loadDashboard() {
  // period
  const period = document.querySelector("input[name='dashPeriod']:checked")?.value || "week";
  let year, week;
  if (period === "week" && $("#dashWeekPicker")?.value) {
    ({year, week} = JSON.parse($("#dashWeekPicker").value));
  }

  // taxe
  let clean = 0, dirty = 0;
  const daily = Array.from({length:7}, (_,i)=>({ day: dayNames[i], count:0, clean:0, dirty:0 }));
  const rT = await api("/taxe"); let taxe = [];
  if (rT.ok) {
    taxe = await rT.json();
    taxe.forEach(t => {
      const created = t.createdAt ? new Date(t.createdAt) : new Date();
      if (period === "week" && year && week && !inISOWeek(created, year, week)) return;
      if (t.tip === "Bani curați") { clean += 40000; }
      if (t.tip === "Bani murdari") { dirty += 60000; }
      const wd = (created.getDay() + 6) % 7;
      daily[wd].count += 1;
      if (t.tip === "Bani curați")  daily[wd].clean += 40000;
      if (t.tip === "Bani murdari") daily[wd].dirty += 60000;
    });
  }
  $("#statTaxClean").textContent = money(clean);
  $("#statTaxDirty").textContent = money(dirty);
  const dBody = $("#dashDailyTable tbody"); dBody.innerHTML = "";
  daily.forEach(d => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${d.day}</td><td>${d.count}</td><td>${money(d.clean)}</td><td>${money(d.dirty)}</td>`;
    dBody.appendChild(tr);
  });

  // burghiu + top useri + familii pe componente
  const rD = await api("/drill");
  const famAgg = new Map();
  const topTaxByUser = new Map();
  const topDrillByUser = new Map();
  let totalPieces = 0;

  (taxe||[]).forEach(t=>{
    const created = t.createdAt ? new Date(t.createdAt) : new Date();
    if (period === "week" && year && week && !inISOWeek(created, year, week)) return;
    if (t.user) topTaxByUser.set(t.user, (topTaxByUser.get(t.user)||0) + 1);
  });

  if (rD.ok) {
    const jobs = await rD.json();
    jobs.forEach(j=>{
      const dt = j.createdAt ? new Date(j.createdAt) : new Date();
      if (period === "week" && year && week && !inISOWeek(dt, year, week)) return;

      const fam = j.family || "(fără)";
      if (!famAgg.has(fam)) famAgg.set(fam, { cadru:0, teava:0, mecanism:0, fixare:0, total:0 });
      const r = famAgg.get(fam);
      r.cadru += j.cadru; r.teava += j.teava; r.mecanism += j.mecanism; r.fixare += j.fixare;
      r.total += j.cadru + j.teava + j.mecanism + j.fixare;

      totalPieces += (j.cadru + j.teava + j.mecanism + j.fixare);
      if (j.user) topDrillByUser.set(j.user, (topDrillByUser.get(j.user)||0) + (j.costTotal||0));
    });
  }
  $("#statDrillPieces").textContent = (totalPieces||0).toLocaleString("ro-RO");

  // familii cu search
  const qFam = ($("#famSearch")?.value||"").toLowerCase();
  const famBody = $("#drillFamiliesTable tbody"); famBody.innerHTML = "";
  [...famAgg.entries()]
    .filter(([name]) => !qFam || name.toLowerCase().includes(qFam))
    .sort((a,b)=>b[1].total - a[1].total)
    .forEach(([name,ag])=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${name}</td><td>${ag.cadru}</td><td>${ag.teava}</td><td>${ag.mecanism}</td><td>${ag.fixare}</td><td>${ag.total}</td>`;
      famBody.appendChild(tr);
    });

  // top useri taxe
  const topTaxBody = $("#topCnpTaxe tbody"); topTaxBody.innerHTML = "";
  [...topTaxByUser.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([user,count])=>{
    const tr = document.createElement("tr"); tr.innerHTML = `<td>${user}</td><td>${count}</td>`; topTaxBody.appendChild(tr);
  });
  // top useri drill (valoare)
  const topDrillBody = $("#topCnpDrill tbody"); topDrillBody.innerHTML = "";
  [...topDrillByUser.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([user,val])=>{
    const tr = document.createElement("tr"); tr.innerHTML = `<td>${user}</td><td>${money(val||0)}</td>`; topDrillBody.appendChild(tr);
  });
}

// ===== Burghiu Familii (ADMIN)
function periodBF(){ return $$("input[name='bfPeriod']").find(i=>i.checked)?.value || "week"; }
$$("input[name='bfPeriod']").forEach(r => r.addEventListener("change", loadBF));
$("#bfWeekPicker")?.addEventListener("change", loadBF);
$("#bfSearch")?.addEventListener("input", loadBF);

async function loadBF(){
  const period = periodBF();
  let url = `/admin/drill-families?period=${period}`;
  if (period === "week" && $("#bfWeekPicker")?.value) {
    const {year, week} = JSON.parse($("#bfWeekPicker").value);
    url += `&year=${year}&week=${week}`;
  }
  const q = ($("#bfSearch")?.value||"").trim();
  if (q) url += `&q=${encodeURIComponent(q)}`;

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
  if (!r.ok) return;
  const p = await r.json();

  // daily table
  const body = $("#profDailyTable tbody"); body.innerHTML = "";
  dayNames.forEach((name, i) => {
    const d = p.daily[i];
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${name}</td><td>${d.taxe}</td><td>${money(d.clean)}</td><td>${money(d.dirty)}</td>`;
    body.appendChild(tr);
  });

  // totals & split
  $("#profClean").textContent = money(p.cleanSum);
  $("#profDirty").textContent = money(p.dirtySum);
  $("#profPieces").textContent = (p.drill.pieces||0).toLocaleString("ro-RO");
  $("#profDrillMoney").textContent = money(p.drill.money);

  $("#splitCleanUser").textContent = money(p.split.cleanUser);
  $("#splitCleanFam").textContent  = money(p.split.cleanFamily);
  $("#splitCleanTot").textContent  = money(p.cleanSum);
  $("#splitDirtyUser").textContent = money(p.split.dirtyUser);
  $("#splitDirtyFam").textContent  = money(p.split.dirtyFamily);
  $("#splitDirtyTot").textContent  = money(p.dirtySum);
  $("#splitAllUser").textContent   = money(p.split.userShare);
  $("#splitAllFam").textContent    = money(p.split.familyShare);
  $("#splitAllTot").textContent    = money(p.split.total);
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
$("#tblType")?.addEventListener("change", ()=>{ renderTblHead(); loadTablesAll(); });

function renderTblHead(){
  const type = $("#tblType").value;
  const h = $("#tblHead"); h.innerHTML = "";
  if (type === "taxe") h.innerHTML = "<tr><th>ID</th><th>CNP</th><th>Plată</th><th>Suma</th><th>User</th><th>Familie</th><th>Creat</th><th></th></tr>";
  else h.innerHTML = "<tr><th>ID</th><th>CNP</th><th>Cadru</th><th>Țeavă</th><th>Mecanism</th><th>Fixare</th><th>User</th><th>Familie</th><th>Creat</th><th></th></tr>";
}

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
      tr.innerHTML = `<td>${row.id}</td><td class="font-mono">${row.cnp}</td><td>${row.payment}</td><td>${row.amount ? money(row.amount) : "GRATIS"}</td><td>${row.user}</td><td>${row.family||"-"}</td><td>${new Date(row.createdAt).toLocaleString()}</td><td><button data-del="${row.id}" data-t="taxe" class="danger xs">Șterge</button></td>`;
    } else {
      tr.innerHTML = `<td>${row.id}</td><td class="font-mono">${row.cnp}</td><td>${row.cadru}</td><td>${row.teava}</td><td>${row.mecanism}</td><td>${row.fixare}</td><td>${row.user}</td><td>${row.family||"-"}</td><td>${new Date(row.createdAt).toLocaleString()}</td><td><button data-del="${row.id}" data-t="drill" class="danger xs">Șterge</button></td>`;
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

// ===== Admin (split curat/murdar)
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
  try { if (sel && sel.value) { const {year, week} = JSON.parse(sel.value); url = `/admin/stats?year=${year}&week=${week}`; } } catch {}

  const r = await api(url);
  const tbody = $("#admTable tbody"); tbody.innerHTML = "";
  if (r.status === 403) { tbody.innerHTML = `<tr><td colspan="8" class="muted">Doar ADMIN/HEAD.</td></tr>`; return; }
  const rows = await r.json();

  rows.sort((a,b)=> (b.total - a.total)).forEach(u=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.username}</td>
      <td>${money(u.userCleanShare)}</td>
      <td>${money(u.userDirtyShare)}</td>
      <td>${money(u.familyCleanShare)}</td>
      <td>${money(u.familyDirtyShare)}</td>
      <td>${money(u.clean)}</td>
      <td>${money(u.dirty)}</td>
      <td>${money(u.total)}</td>`;
    tbody.appendChild(tr);
  });
}

// init
hydrateMe();
setTabs("taxe");
