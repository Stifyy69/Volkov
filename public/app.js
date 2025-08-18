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

// ===== Role gating and Auth =====
let ME = null;

function applyRoleUI() {
  const tabs = {
    taxe:        $$(".tabbtn").find(b=>b.dataset.tab==="taxe"),
    dashboard:   $$(".tabbtn").find(b=>b.dataset.tab==="dashboard"),
    drillfam:    $$(".tabbtn").find(b=>b.dataset.tab==="drillfamilies"),
    admin:       $$(".tabbtn").find(b=>b.dataset.tab==="admin"),
    tables:      $$(".tabbtn").find(b=>b.dataset.tab==="tables"),
    profile:     $$(".tabbtn").find(b=>b.dataset.tab==="profile"),
  };
  // default hide all
  Object.values(tabs).forEach(btn => btn && btn.classList.add("hidden"));

  if (!ME) return;

  // OPERATOR: Taxe & Burghiu, My profile
  if (ME.role === "OPERATOR" || ME.role === "HEAD_OPERATOR") {
    tabs.taxe?.classList.remove("hidden");
    tabs.profile?.classList.remove("hidden");
  }
  // ADMIN: all
  if (ME.role === "ADMIN") {
    Object.values(tabs).forEach(btn => btn?.classList.remove("hidden"));
  }
  // AUDIT: see everything but cannot add
  if (ME.role === "AUDIT") {
    tabs.taxe?.classList.remove("hidden");
    tabs.dashboard?.classList.remove("hidden");
    tabs.drillfam?.classList.remove("hidden");
    tabs.admin?.classList.remove("hidden");
    tabs.tables?.classList.remove("hidden");
    tabs.profile?.classList.remove("hidden");
    // disable forms
    $("#taxeForm")?.querySelectorAll("input,select,button").forEach(el => el.disabled = true);
    $("#drillForm")?.querySelectorAll("input,select,button").forEach(el => el.disabled = true);
  }
}

async function hydrateMe() {
  try {
    const r = await api("/auth/me");
    if (!r.ok) throw 0;
    ME = await r.json();
    $("#whoami").textContent = `${ME.username} [${ME.role}]`;
    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");
    applyRoleUI();

    // defaults
    setTabs("taxe");
    prepareWeekSelects();
    loadTaxe();
    loadDrill();
    connectSSE();
  } catch {
    ME = null;
    $("#whoami").textContent = "";
    $("#app").classList.add("hidden");
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

// tabs
$$(".tabbtn").forEach(b => {
  b.addEventListener("click", async () => {
    setTabs(b.dataset.tab);
    if (b.dataset.tab === "taxe")      { loadTaxe(); loadDrill(); }
    if (b.dataset.tab === "dashboard") loadDashboard();
    if (b.dataset.tab === "drillfamilies") loadDrillFamilies();
    if (b.dataset.tab === "admin")     loadAdmin();
    if (b.dataset.tab === "tables")    loadTables();
    if (b.dataset.tab === "profile")   loadProfile();
  });
});

// ===== SSE (live) =====
let es;
function connectSSE() {
  if (es) { try { es.close(); } catch {} }
  es = new EventSource("/events");
  es.addEventListener("taxe:new", () => { loadTaxe(); loadDashboard(); loadTables(); });
  es.addEventListener("drill:new", () => { loadDrill(); loadDashboard(); loadDrillFamilies(); loadTables(); });
}

// ===== Week pickers common =====
function fillWeekSelect(sel){
  if (!sel) return;
  sel.innerHTML = "";
  const now = new Date();
  const set = new Set();
  for (let i=0;i<52;i++){
    const d = new Date(now); d.setDate(d.getDate() - i*7);
    const {year, week} = isoYearWeek(d);
    if (week < 33 && year === now.getFullYear()) continue; // de la W33 în sus
    const key = `${year}-W${String(week).padStart(2,"0")}`;
    if (set.has(key)) continue;
    set.add(key);
    const opt = document.createElement("option");
    opt.value = JSON.stringify({year, week});
    opt.textContent = key;
    sel.appendChild(opt);
  }
}
function prepareWeekSelects(){
  ["dashWeekPicker","bfWeekPicker","weekSelect","tblWeekPicker","profWeekPicker"].forEach(id=>fillWeekSelect($(id)));
}

// toggle week selects by period
function attachPeriodBehavior(periodSelId, weekSelId) {
  const ps = $(periodSelId), ws = $(weekSelId);
  if (!ps || !ws) return;
  const sync = () => {
    ws.classList.toggle("hidden", ps.value !== "week");
  };
  ps.addEventListener("change", sync);
  sync();
}
["#dashPeriod|#dashWeekPicker","#bfPeriod|#bfWeekPicker","#admPeriod|#weekSelect","#tblPeriod|#tblWeekPicker","#profPeriod|#profWeekPicker"]
  .forEach(pair => {
    const [p,w] = pair.split("|");
    attachPeriodBehavior(p,w);
  });

// ===== Taxe =====
const metodaSelect = $("#metodaSelect");
const gratisWrap    = $("#gratisWrap");

metodaSelect?.addEventListener("change", () => {
  const isGratis = metodaSelect.value === "gratis";
  gratisWrap.classList.toggle("hidden", !isGratis);
});

$("#taxeForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (ME?.role === "AUDIT") return; // safeguard
  const f = e.target;
  const cnp = (f.cnp.value||"").trim();
  if (!/^\d{1,6}$/.test(cnp)) return alert("CNP invalid (max 6).");

  const body = { cnp, metoda: f.metoda.value };
  if (f.metoda.value === "gratis") body.gratisFamilie = f.gratisFamilie.value;

  const r = await api("/taxe", { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Eroare la taxă");
  f.reset(); metodaSelect.dispatchEvent(new Event("change"));
  loadTaxe(); loadDashboard(); loadTables();
});

// state + search
let taxeCache = [];
$("#taxSearch")?.addEventListener("input", () => renderTaxe(taxeCache));

async function loadTaxe() {
  // asigură familii gratis populate
  const gratisSelect = $("#gratisFamilie");
  if (gratisSelect && gratisSelect.options.length <= 3) {
    ["818","Medelin","Stefanos"].forEach(val=>{
      if (![...gratisSelect.options].some(o=>o.value===val)) {
        const opt = document.createElement("option");
        opt.value = val; opt.textContent = val; gratisSelect.appendChild(opt);
      }
    });
  }

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
      tr.innerHTML = `<td class="mono left">${row.cnp}</td><td>${suma}</td><td>${row.remaining||""}</td><td class="left">${row.user||"-"}</td>`;
      tbody.appendChild(tr);
    });
}

// ===== Burghiu =====
$("#drillForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (ME?.role === "AUDIT") return; // safeguard
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
  loadDrill(); loadDashboard(); loadDrillFamilies(); loadTables();
});

let drillCache = [];
async function loadDrill() {
  const r = await api("/drill");
  if (!r.ok) return;
  const all = await r.json();
  // ultimele 5
  drillCache = all.slice(0,5);
  renderDrill(drillCache);
}
function renderDrill(list){
  const tbody = $("#drillTable tbody");
  tbody.innerHTML = "";
  (list || []).forEach(j => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono left">${j.cnp}</td>
      <td class="left">${j.family||""}</td>
      <td>${j.cadru}</td>
      <td>${j.teava}</td>
      <td>${j.mecanism}</td>
      <td>${j.fixare}</td>
      <td>Bani murdari</td>
      <td>${money(j.costTotal || 0)}</td>
      <td class="left">${j.user||"-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== Dashboard =====
$("#dashPeriod")?.addEventListener("change", loadDashboard);
$("#dashWeekPicker")?.addEventListener("change", loadDashboard);
$("#famSearch")?.addEventListener("input", loadDashboard);

async function loadDashboard() {
  const ps = $("#dashPeriod"), ws = $("#dashWeekPicker");
  let selYear, selWeek;
  if (ps?.value === "week") {
    try { if (ws?.value) ({year:selYear,week:selWeek} = JSON.parse(ws.value)); } catch {}
  }

  // 1) Taxe pe săptămână
  let clean = 0, dirty = 0;
  const daily = Array.from({length:7}, (_,i)=>({ day: dayNames[i], count:0, clean:0, dirty:0 }));

  const rT = await api("/taxe");
  let taxe = [];
  if (rT.ok) {
    taxe = await rT.json();
    taxe.forEach(t => {
      const created = t.createdAt ? new Date(t.createdAt) : new Date();
      if (ps.value==="week" && selYear && selWeek && !inISOWeek(created, selYear, selWeek)) return;

      if (t.tip === "Bani curați") { clean += 40000; }
      if (t.tip === "Bani murdari") { dirty += 60000; }
      if (t.tip === "GRATIS") { /* 0 */ }

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
    tr.innerHTML = `<td class="left">${d.day}</td><td>${d.count}</td><td>${money(d.clean)}</td><td>${money(d.dirty)}</td>`;
    dBody.appendChild(tr);
  });

  // 2) Burghiu + familii + topuri
  const rD = await api("/drill");
  const famAgg = new Map();
  const topDrillMap = new Map();
  let totalPieces = 0;

  if (rD.ok) {
    const jobs = await rD.json();
    const jobsUse = jobs.filter(j => {
      const dt = j.createdAt ? new Date(j.createdAt) : new Date();
      return ps.value==="all" || (selYear && selWeek && inISOWeek(dt, selYear, selWeek));
    });

    jobsUse.forEach(j=>{
      const pieces = j.cadru + j.teava + j.mecanism + j.fixare;
      totalPieces += pieces;
      const fam = j.family || "(fără)"; // pt agregare
      const cur = famAgg.get(fam) || {cadru:0, teava:0, mecanism:0, fixare:0};
      cur.cadru += j.cadru; cur.teava += j.teava; cur.mecanism += j.mecanism; cur.fixare += j.fixare;
      famAgg.set(fam, cur);

      const key = j.user || "";
      const prev = topDrillMap.get(key) || { user:key, drill$:0 };
      prev.drill$ += (j.costTotal||0);
      topDrillMap.set(key, prev);
    });

    $("#statDrillPieces").textContent = (totalPieces||0).toLocaleString("ro-RO");

    // Familii burghiu + search
    const qf = ($("#famSearch")?.value||"").toLowerCase();
    const famBody = $("#drillFamiliesTable tbody");
    famBody.innerHTML = "";
    [...famAgg.entries()]
      .filter(([fam])=>!qf || fam.toLowerCase().includes(qf))
      .map(([fam,agg])=>({fam, ...agg, total: agg.cadru+agg.teava+agg.mecanism+agg.fixare}))
      .sort((a,b)=>b.total-a.total)
      .forEach(r=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="left">${r.fam}</td><td>${r.cadru}</td><td>${r.teava}</td><td>${r.mecanism}</td><td>${r.fixare}</td><td>${r.total}</td>`;
        famBody.appendChild(tr);
      });
  }

  // Top useri – taxe (nr. taxe / săptămâna selectată)
  const topTaxBody = $("#topCnpTaxe tbody");
  topTaxBody.innerHTML = "";
  const topTaxMap = new Map();
  (taxe||[]).forEach(t=>{
    const created = t.createdAt ? new Date(t.createdAt) : new Date();
    if (ps.value==="week" && selYear && selWeek && !inISOWeek(created, selYear, selWeek)) return;
    if (t.tip === "Bani curați" || t.tip === "Bani murdari") {
      const key = t.user || "";
      const prev = topTaxMap.get(key) || { user:key, taxe:0 };
      prev.taxe += 1;
      topTaxMap.set(key, prev);
    }
  });
  [...topTaxMap.values()]
    .sort((a,b)=>b.taxe-a.taxe)
    .slice(0,20)
    .forEach(row=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="left">${row.user||"-"}</td><td>${row.taxe}</td>`;
      topTaxBody.appendChild(tr);
    });

  // Top useri – drill
  const topDrillBody = $("#topCnpDrill tbody");
  topDrillBody.innerHTML = "";
  [...topDrillMap.values()]
    .sort((a,b)=>b.drill$-a.drill$)
    .slice(0,20)
    .forEach(row=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="left">${row.user||"-"}</td><td>${money(row.drill$||0)}</td>`;
      topDrillBody.appendChild(tr);
    });
}

// ===== Statistici Familii tab =====
$("#bfPeriod")?.addEventListener("change", loadDrillFamilies);
$("#bfWeekPicker")?.addEventListener("change", loadDrillFamilies);
$("#bfSearch")?.addEventListener("input", loadDrillFamilies);

async function loadDrillFamilies(){
  const ps = $("#bfPeriod"), ws = $("#bfWeekPicker");
  let selYear, selWeek;
  if (ps?.value === "week") {
    try { if (ws?.value) ({year:selYear,week:selWeek} = JSON.parse(ws.value)); } catch {}
  }
  const rD = await api("/drill");
  const tbody = $("#bfTable tbody");
  tbody.innerHTML = "";
  if (!rD.ok) return;
  const jobs = await rD.json();
  const map = new Map();
  const q = ($("#bfSearch")?.value||"").toLowerCase();

  jobs.forEach(j=>{
    const dt = j.createdAt ? new Date(j.createdAt) : new Date();
    if (ps.value==="week" && selYear && selWeek && !inISOWeek(dt, selYear, selWeek)) return;
    const fam = j.family || "(fără)";
    if (q && !fam.toLowerCase().includes(q)) return;
    const row = map.get(fam) || { cadru:0, teava:0, mecanism:0, fixare:0 };
    row.cadru += j.cadru; row.teava += j.teava; row.mecanism += j.mecanism; row.fixare += j.fixare;
    map.set(fam, row);
  });

  [...map.entries()]
    .map(([fam,agg])=>({fam, ...agg, total: agg.cadru+agg.teava+agg.mecanism+agg.fixare}))
    .sort((a,b)=>b.total-a.total)
    .forEach(r=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="left">${r.fam}</td><td>${r.cadru}</td><td>${r.teava}</td><td>${r.mecanism}</td><td>${r.fixare}</td><td>${r.total}</td>`;
      tbody.appendChild(tr);
    });
}

// ===== Admin =====
$("#admPeriod")?.addEventListener("change", loadAdmin);
$("#weekSelect")?.addEventListener("change", loadAdmin);

// Invite
$("#inviteBtn")?.addEventListener("click", async () => {
  try {
    const role = $("#inviteRole").value;
    const r = await api("/invites", { method: "POST", body: JSON.stringify({ role }) });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "Nu s-a putut genera invitația");
    $("#inviteResult").value = j.link || j.code || "(fără link)";
  } catch {
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
  const ps = $("#admPeriod"), ws = $("#weekSelect");
  let url = "/admin/stats";
  if (ps?.value === "week") {
    try { if (ws?.value) {
      const {year, week} = JSON.parse(ws.value);
      url = `/admin/stats?year=${year}&week=${week}`;
    }} catch {}
  }
  const r = await api(url);
  const tbody = $("#admTable tbody");
  tbody.innerHTML = "";
  if (r.status === 403) {
    tbody.innerHTML = `<tr><td colspan="8" class="left" style="color:#94a3b8">Doar ADMIN are acces.</td></tr>`;
    return;
  }
  const list = await r.json();
  (list||[]).sort((a,b)=> (b.total||0)-(a.total||0)).forEach(u=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="left">${u.username}</td>
      <td>${money(u.userClean||0)}</td>
      <td>${money(u.userDirty||0)}</td>
      <td>${money(u.familyClean||0)}</td>
      <td>${money(u.familyDirty||0)}</td>
      <td>${money((u.userClean||0)+(u.familyClean||0))}</td>
      <td>${money((u.userDirty||0)+(u.familyDirty||0))}</td>
      <td>${money(u.total||0)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== Tabele All =====
$("#tblPeriod")?.addEventListener("change", loadTables);
$("#tblWeekPicker")?.addEventListener("change", loadTables);
$("#tblType")?.addEventListener("change", loadTables);
$("#tblRefresh")?.addEventListener("click", loadTables);
$("#tblFilterUser")?.addEventListener("input", renderTables);
$("#tblFilterCnp")?.addEventListener("input", renderTables);
$("#tblFilterFamily")?.addEventListener("input", renderTables);

let tblCache = { type:"taxe", rows:[] };

async function loadTables(){
  const type = $("#tblType").value;
  const ps = $("#tblPeriod"), ws = $("#tblWeekPicker");
  let selYear, selWeek;
  if (ps?.value === "week") {
    try { if (ws?.value) ({year:selYear,week:selWeek} = JSON.parse(ws.value)); } catch {}
  }

  let rows = [];
  if (type === "taxe"){
    const r = await api("/taxe"); if (!r.ok) return;
    rows = await r.json();
    $("#tblHead").innerHTML = `<tr>
      <th class="left">Tip</th>
      <th class="left">CNP</th>
      <th>Sumă</th>
      <th>Metodă</th>
      <th class="left">User</th>
      <th class="left">Familie</th>
      <th>Creat</th>
    </tr>`;
  } else {
    const r = await api("/drill"); if (!r.ok) return;
    rows = await r.json();
    $("#tblHead").innerHTML = `<tr>
      <th class="left">Tip</th>
      <th class="left">CNP</th>
      <th class="left">Familie</th>
      <th>Cadru</th><th>Țeavă</th><th>Mecanism</th><th>Fixare</th>
      <th>Metodă</th><th>Valoare</th>
      <th class="left">User</th><th>Creat</th>
    </tr>`;
  }

  // filter by period (no limit)
  rows = rows.filter(r=>{
    if (ps.value==="all") return true;
    const dt = r.createdAt ? new Date(r.createdAt) : new Date();
    return (selYear && selWeek) ? inISOWeek(dt, selYear, selWeek) : true;
  });

  tblCache = { type, rows };
  renderTables();
}
function renderTables(){
  const type = tblCache.type;
  const rows = tblCache.rows || [];
  const qU = ($("#tblFilterUser")?.value||"").toLowerCase();
  const qC = ($("#tblFilterCnp")?.value||"").toLowerCase();
  const qF = ($("#tblFilterFamily")?.value||"").toLowerCase();
  const tbody = $("#tblAll tbody");
  tbody.innerHTML = "";

  rows
    .filter(r => (!qU || (r.user||"").toLowerCase().includes(qU)) &&
                 (!qC || String(r.cnp||"").toLowerCase().includes(qC)) &&
                 (!qF || String(r.family||"").toLowerCase().includes(qF)))
    .forEach(r=>{
      const tr = document.createElement("tr");
      if (type === "taxe"){
        let suma = r.tip==="Bani murdari" ? "60.000$" :
                   r.tip==="Bani curați"  ? "40.000$" :
                   "GRATIS";
        tr.innerHTML = `
          <td class="left">Taxe</td>
          <td class="mono left">${r.cnp}</td>
          <td>${suma}</td>
          <td>${r.metoda||r.payment||"-"}</td>
          <td class="left">${r.user||"-"}</td>
          <td class="left">${r.gratisFamilie||r.family||""}</td>
          <td>${r.createdAt? new Date(r.createdAt).toLocaleString("ro-RO") : ""}</td>
        `;
      } else {
        tr.innerHTML = `
          <td class="left">Burghiu</td>
          <td class="mono left">${r.cnp}</td>
          <td class="left">${r.family||""}</td>
          <td>${r.cadru}</td><td>${r.teava}</td><td>${r.mecanism}</td><td>${r.fixare}</td>
          <td>Bani murdari</td><td>${money(r.costTotal||0)}</td>
          <td class="left">${r.user||"-"}</td>
          <td>${r.createdAt? new Date(r.createdAt).toLocaleString("ro-RO") : ""}</td>
        `;
      }
      tbody.appendChild(tr);
    });
}

// ===== My Profile =====
$("#profPeriod")?.addEventListener("change", loadProfile);
$("#profWeekPicker")?.addEventListener("change", loadProfile);

async function loadProfile(){
  if (!ME) return;
  const ps = $("#profPeriod"), ws = $("#profWeekPicker");
  let selYear, selWeek;
  if (ps?.value === "week") {
    try { if (ws?.value) ({year:selYear,week:selWeek} = JSON.parse(ws.value)); } catch {}
  }

  // taxe
  let clean = 0, dirty = 0;
  const daily = Array.from({length:7}, (_,i)=>({ day: dayNames[i], count:0, clean:0, dirty:0 }));

  const rT = await api("/taxe"); let taxe = [];
  if (rT.ok) {
    taxe = (await rT.json()).filter(t => t.user === ME.username);
    taxe.forEach(t=>{
      const dt = t.createdAt ? new Date(t.createdAt) : new Date();
      if (ps.value==="week" && selYear && selWeek && !inISOWeek(dt, selYear, selWeek)) return;
      if (t.tip === "Bani curați") { clean += 40000; daily[(dt.getDay()+6)%7].clean += 40000; daily[(dt.getDay()+6)%7].count++; }
      if (t.tip === "Bani murdari") { dirty += 60000; daily[(dt.getDay()+6)%7].dirty += 60000; daily[(dt.getDay()+6)%7].count++; }
    });
  }

  // burghiu (bani murdari)
  let drillPieces = 0, drillMoney = 0;
  const rD = await api("/drill");
  if (rD.ok) {
    const jobs = (await rD.json()).filter(j => j.user === ME.username);
    jobs.forEach(j=>{
      const dt = j.createdAt ? new Date(j.createdAt) : new Date();
      if (ps.value==="week" && selYear && selWeek && !inISOWeek(dt, selYear, selWeek)) return;
      const pieces = j.cadru + j.teava + j.mecanism + j.fixare;
      drillPieces += pieces;
      drillMoney += (j.costTotal||0); // bani murdari
      // nu intră în daily, doar total
    });
  }

  $("#profClean").textContent = money(clean);
  $("#profDirty").textContent = money(dirty + drillMoney);
  $("#profPieces").textContent = (drillPieces||0);
  $("#profDrillMoney").textContent = money(drillMoney);

  const dBody = $("#profDailyTable tbody");
  dBody.innerHTML = "";
  daily.forEach(d => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${d.day}</td><td>${d.count}</td><td>${money(d.clean)}</td><td>${money(d.dirty)}</td>`;
    dBody.appendChild(tr);
  });

  // split 50/50 pe curat/murdar
  const cleanUser = clean*0.5, cleanFam = clean*0.5;
  const dirtyAll = dirty + drillMoney;
  const dirtyUser = dirtyAll*0.5, dirtyFam = dirtyAll*0.5;

  $("#splitCleanUser").textContent = money(cleanUser);
  $("#splitCleanFam").textContent = money(cleanFam);
  $("#splitCleanTot").textContent  = money(clean);

  $("#splitDirtyUser").textContent = money(dirtyUser);
  $("#splitDirtyFam").textContent = money(dirtyFam);
  $("#splitDirtyTot").textContent  = money(dirtyAll);

  $("#splitAllUser").textContent = money(cleanUser + dirtyUser);
  $("#splitAllFam").textContent  = money(cleanFam + dirtyFam);
  $("#splitAllTot").textContent  = money(clean + dirtyAll);
}

// ===== Init =====
hydrateMe();
setTabs("taxe");
