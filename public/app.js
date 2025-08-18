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
const money = (n=0) => `${(Number(n)||0).toLocaleString("ro-RO").replace(/\s/g,".")}$`;

function setTabs(active) {
  $$(".tabbtn").forEach(b => b.dataset.active = (b.dataset.tab === active));
  $$(".tab").forEach(sec => sec.id === `tab-${active}` ? sec.classList.remove("hidden") : sec.classList.add("hidden"));
}

// Week 33..52 for current year
function populateWeeks(selectId){
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = "";
  for (let w=33; w<=52; w++){
    const opt = document.createElement("option");
    opt.value = w;
    opt.textContent = `Săpt. ${w}`;
    sel.appendChild(opt);
  }
}
["dashWeekPicker","bfWeekPicker","weekSelect","tblWeekPicker","profWeekPicker"].forEach(populateWeeks);

const dayNames = ["Lun","Mar","Mie","Joi","Vin","Sâm","Dum"];
function todayISO(){ const d = new Date(); return d.toISOString(); }

// ===== Auth & RBAC =====
let ME = null;

function applyRBAC(){
  // Tabs visibility
  const role = ME?.role || "OPERATOR";
  const show = (tab, visible) => {
    const btn = $(`.tabbtn[data-tab="${tab}"]`);
    if (btn) btn.style.display = visible ? "" : "none";
  };
  // OPERATOR: Taxe & Burghiu + My profile
  show("taxe", true);
  show("profile", true);
  show("dashboard", role !== "OPERATOR");
  show("drillfamilies", role !== "OPERATOR");
  show("admin", role === "ADMIN");
  show("tables", role !== "OPERATOR"); // poate vedea, dar AUDIT nu modifică

  // Disable actions for AUDIT
  const disable = (flag) => {
    $("#taxeSubmit")?.toggleAttribute("disabled", flag);
    $("#drillSubmit")?.toggleAttribute("disabled", flag);
    $("#inviteBtn")?.toggleAttribute("disabled", flag);
    $("#resetForm")?.querySelector("button")?.toggleAttribute("disabled", flag);
  };
  disable(role === "AUDIT");
}

async function hydrateMe() {
  try {
    const r = await api("/auth/me");
    if (!r.ok) throw 0;
    ME = await r.json();
    $("#whoami").textContent = `${ME.username} [${ME.role}]`;
    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");
    applyRBAC();
    setTabs("taxe");
    loadTaxe();
    loadDrill();
    loadDashboard();
    loadFamiliesStats();
    loadAdmin();
    // SSE live (fallback dacă nu e disponibil)
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

// Tabs
$$(".tabbtn").forEach(b => {
  b.addEventListener("click", () => {
    setTabs(b.dataset.tab);
    if (b.dataset.tab === "taxe") { loadTaxe(); loadDrill(); }
    if (b.dataset.tab === "dashboard") loadDashboard();
    if (b.dataset.tab === "drillfamilies") loadFamiliesStats();
    if (b.dataset.tab === "admin") loadAdmin();
    if (b.dataset.tab === "tables") loadTables();
    if (b.dataset.tab === "profile") loadProfile();
  });
});

// ===== SSE (live) =====
let es;
function connectSSE(){
  try{
    if (es) es.close();
    es = new EventSource("/events");
    es.addEventListener("taxe:new", () => { loadTaxe(); loadDashboard(); loadTables(); });
    es.addEventListener("drill:new", () => { loadDrill(); loadDashboard(); loadFamiliesStats(); loadTables(); });
  }catch{}
}

// ===== Taxe =====
const metodaSelect = $("#metodaSelect");
const gratisFamilie = $("#gratisFamilie");
metodaSelect?.addEventListener("change", () => {
  const isGratis = metodaSelect.value === "gratis";
  gratisFamilie.classList.toggle("hidden", !isGratis);
});

$("#taxeForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (ME?.role === "AUDIT") return alert("AUDIT nu poate adăuga taxe.");
  const f = e.target;
  const cnp = (f.cnp.value||"").trim();
  if (!/^\d{1,6}$/.test(cnp)) return alert("CNP invalid (max 6).");
  const metoda = f.metoda.value;
  if (!metoda) return;

  const body = { cnp, metoda };
  if (metoda === "gratis") body.gratisFamilie = f.gratisFamilie.value || "";

  const r = await api("/taxe", { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Eroare la taxă");
  f.reset(); gratisFamilie.classList.add("hidden");
  loadTaxe(); loadDashboard(); loadTables();
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
      let suma = "GRATIS";
      if (row.tip === "Bani curați")   suma = "40.000$";
      if (row.tip === "Bani murdari")  suma = "60.000$";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="font-mono">${row.cnp}</td>
        <td>${suma}</td>
        <td>${row.remaining || ""}</td>
        <td>${row.user || row.operator || "-"}</td>`;
      tbody.appendChild(tr);
    });
}

// ===== Burghiu =====
$("#drillForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (ME?.role === "AUDIT") return alert("AUDIT nu poate adăuga joburi.");
  const f = e.target;
  const cnp = (f.cnp.value||"").trim();
  if (!/^\d{1,6}$/.test(cnp)) return alert("CNP invalid (max 6).");

  const fam = f.family.value;
  if (!fam) return alert("Alege familia.");

  const components = [
    { key:"cadru",    val: Number(f.cadru.value||0) },
    { key:"teava",    val: Number(f.teava.value||0) },
    { key:"mecanism", val: Number(f.mecanism.value||0) },
    { key:"fixare",   val: Number(f.fixare.value||0) },
  ].filter(p => p.val > 0);

  if (components.length === 0) return alert("Introdu minim o cantitate > 0.");

  // trimitem pe rând (în lipsa endpoint-ului multiplu)
  for (const p of components) {
    const body = { cnp, part: p.key, quantity: p.val, family: fam };
    const r = await api("/drill", { method: "POST", body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return alert(j.error || `Eroare la ${p.key}`);
  }

  f.reset();
  loadDrill(); loadDashboard(); loadFamiliesStats(); loadTables();
});

let drillCache = [];
async function loadDrill() {
  const r = await api("/drill");
  if (!r.ok) return;
  drillCache = await r.json();
  renderDrill(drillCache.slice(0,5)); // ultimele 5
}
function renderDrill(list){
  const tbody = $("#drillTable tbody");
  tbody.innerHTML = "";
  (list || []).forEach(j => {
    const isFree = ["818","Medelin Cartel","Stefanos Cartel"].includes(j.family || "");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="font-mono">${j.cnp}</td>
      <td>${j.family||"-"}</td>
      <td>${j.cadru}</td>
      <td>${j.teava}</td>
      <td>${j.mecanism}</td>
      <td>${j.fixare}</td>
      <td>${isFree ? "GRATIS" : "Bani murdari"}</td>
      <td>${isFree ? "0$" : money(j.costTotal || 0)}</td>
      <td>${j.user || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== Dashboard =====
$("#dashPeriod")?.addEventListener("change", () => {
  $("#dashWeekPicker").classList.toggle("hidden", $("#dashPeriod").value === "all");
  loadDashboard();
});

async function loadDashboard(){
  // simple recompute from active lists (în lipsa istoric)
  // Bani curați: taxe curat; Bani murdari: taxe murdar + drill cost
  let clean = 0, dirty = 0, pieces = 0;

  (taxeCache||[]).forEach(t=>{
    if (t.tip === "Bani curați")  clean += 40000;
    if (t.tip === "Bani murdari") dirty += 60000;
  });

  (drillCache||[]).forEach(j=>{
    const isFree = ["818","Medelin Cartel","Stefanos Cartel"].includes(j.family || "");
    const pcs = (j.cadru||0)+(j.teava||0)+(j.mecanism||0)+(j.fixare||0);
    pieces += pcs;
    if (!isFree) dirty += (j.costTotal||0);
  });

  $("#statTaxClean").textContent = money(clean);
  $("#statTaxDirty").textContent = money(dirty);
  $("#statDrillPieces").textContent = (pieces||0).toLocaleString("ro-RO");

  // daily table (mock pe active)
  const daily = dayNames.map(d=>({day:d,count:0,clean:0,dirty:0}));
  (taxeCache||[]).forEach(t=>{
    const idx = 0; // fără istoric real, îl lăsăm la prima zi
    daily[idx].count += 1;
    if (t.tip === "Bani curați")  daily[idx].clean += 40000;
    if (t.tip === "Bani murdari") daily[idx].dirty += 60000;
  });

  const dBody = $("#dashDailyTable tbody");
  dBody.innerHTML = "";
  daily.forEach(d=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${d.day}</td><td>${d.count}</td><td>${money(d.clean)}</td><td>${money(d.dirty)}</td>`;
    dBody.appendChild(tr);
  });

  renderFamiliesTable(); // din drillCache
  renderTopTables();
}

$("#famSearch")?.addEventListener("input", renderFamiliesTable);

function renderFamiliesTable(){
  const q = ($("#famSearch")?.value||"").toLowerCase();
  const famAgg = new Map(); // name -> {cadru, teava, mecanism, fixare}
  (drillCache||[]).forEach(j=>{
    const key = j.family || "-";
    if (!famAgg.has(key)) famAgg.set(key,{cadru:0,teava:0,mecanism:0,fixare:0});
    const a = famAgg.get(key);
    a.cadru += j.cadru||0; a.teava += j.teava||0; a.mecanism += j.mecanism||0; a.fixare += j.fixare||0;
  });

  const rows = [...famAgg.entries()]
    .map(([fam,a]) => ({fam, ...a, total: a.cadru+a.teava+a.mecanism+a.fixare}))
    .filter(r=>!q || r.fam.toLowerCase().includes(q))
    .sort((a,b)=>b.total-a.total);

  const tbody = $("#drillFamiliesTable tbody");
  tbody.innerHTML = "";
  rows.forEach(r=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.fam}</td><td>${r.cadru}</td><td>${r.teava}</td><td>${r.mecanism}</td><td>${r.fixare}</td><td>${r.total}</td>`;
    tbody.appendChild(tr);
  });
}

function renderTopTables(){
  // Top useri taxe (după count) – necesită user în răspuns; fallback "-"
  const mapT = new Map();
  (taxeCache||[]).forEach(t=>{
    const u = t.user || "-";
    mapT.set(u, (mapT.get(u)||0)+1);
  });
  const tBody = $("#topCnpTaxe tbody"); tBody.innerHTML = "";
  [...mapT.entries()].sort((a,b)=>b[1]-a[1]).forEach(([u,c])=>{
    const tr = document.createElement("tr"); tr.innerHTML = `<td>${u}</td><td>${c}</td>`; tBody.appendChild(tr);
  });

  // Top useri drill (după bani)
  const mapD = new Map();
  (drillCache||[]).forEach(j=>{
    const u = j.user || "-";
    const isFree = ["818","Medelin Cartel","Stefanos Cartel"].includes(j.family||"");
    const val = isFree ? 0 : (j.costTotal||0);
    mapD.set(u, (mapD.get(u)||0)+val);
  });
  const dBody = $("#topCnpDrill tbody"); dBody.innerHTML = "";
  [...mapD.entries()].sort((a,b)=>b[1]-a[1]).forEach(([u,sum])=>{
    const tr = document.createElement("tr"); tr.innerHTML = `<td>${u}</td><td>${money(sum)}</td>`; dBody.appendChild(tr);
  });
}

// ===== Statistici Familii (tab dedicat) =====
$("#bfPeriod")?.addEventListener("change", () => {
  $("#bfWeekPicker").classList.toggle("hidden", $("#bfPeriod").value === "all");
  loadFamiliesStats();
});
$("#bfSearch")?.addEventListener("input", loadFamiliesStats);

function loadFamiliesStats(){
  // reutilizăm drillCache
  const q = ($("#bfSearch")?.value||"").toLowerCase();
  const famAgg = new Map();
  (drillCache||[]).forEach(j=>{
    const key = j.family || "-";
    if (!famAgg.has(key)) famAgg.set(key,{cadru:0,teava:0,mecanism:0,fixare:0});
    const a = famAgg.get(key);
    a.cadru += j.cadru||0; a.teava += j.teava||0; a.mecanism += j.mecanism||0; a.fixare += j.fixare||0;
  });
  const rows = [...famAgg.entries()]
    .map(([fam,a]) => ({fam, ...a, total:a.cadru+a.teava+a.mecanism+a.fixare}))
    .filter(r=>!q || r.fam.toLowerCase().includes(q))
    .sort((a,b)=>b.total-a.total);

  const tbody = $("#bfTable tbody"); tbody.innerHTML = "";
  rows.forEach(r=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.fam}</td><td>${r.cadru}</td><td>${r.teava}</td><td>${r.mecanism}</td><td>${r.fixare}</td><td>${r.total}</td>`;
    tbody.appendChild(tr);
  });
}

// ===== Admin =====
$("#admPeriod")?.addEventListener("change", () => {
  $("#weekSelect").classList.toggle("hidden", $("#admPeriod").value === "all");
  loadAdmin();
});

async function loadAdmin(){
  // back expune /admin/stats (agregat), aici doar afișăm + totalul mare
  const url = $("#admPeriod").value === "week" && $("#weekSelect").value
    ? `/admin/stats?week=${$("#weekSelect").value}`
    : `/admin/stats`;
  const r = await api(url);
  if (r.status === 403){
    $("#admTable tbody").innerHTML = `<tr><td colspan="8">Doar ADMIN are acces.</td></tr>`;
    return;
  }
  const list = await r.json();

  let sumUC=0,sumUD=0,sumFC=0,sumFD=0,sumTC=0,sumTD=0,sumALL=0;
  const tbody = $("#admTable tbody"); tbody.innerHTML = "";
  (list||[]).forEach(u=>{
    // presupunem câmpuri: userShareClean, userShareDirty, famShareClean, famShareDirty, totalClean, totalDirty, total
    const uc = u.userShareClean||0, ud=u.userShareDirty||0, fc=u.familyShareClean||0, fd=u.familyShareDirty||0;
    const tc = u.totalClean|| (uc+fc), td = u.totalDirty||(ud+fd), tt = (u.total||tc+td);
    sumUC+=uc; sumUD+=ud; sumFC+=fc; sumFD+=fd; sumTC+=tc; sumTD+=td; sumALL+=tt;

    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${u.username}</td><td>${money(uc)}</td><td>${money(ud)}</td><td>${money(fc)}</td><td>${money(fd)}</td><td>${money(tc)}</td><td>${money(td)}</td><td>${money(tt)}</td>`;
    tbody.appendChild(tr);
  });
  $("#admTotalCell").textContent = `Total: ${money(sumALL)} (Curat: ${money(sumTC)} / Murdari: ${money(sumTD)})`;
}

// ===== Tabele All =====
$("#tblPeriod")?.addEventListener("change", () => {
  $("#tblWeekPicker").classList.toggle("hidden", $("#tblPeriod").value === "all");
  loadTables();
});
$("#tblRefresh")?.addEventListener("click", loadTables);
["#tblFilterUser","#tblFilterCnp","#tblFilterFamily","#tblType"].forEach(sel=>{
  $(sel)?.addEventListener("input", loadTables);
});

async function loadTables(){
  const type = $("#tblType").value;
  const userQ = ($("#tblFilterUser").value||"").toLowerCase();
  const cnpQ  = ($("#tblFilterCnp").value||"").toLowerCase();
  const famQ  = ($("#tblFilterFamily").value||"").toLowerCase();

  const head = $("#tblHead"); const body = $("#tblAll tbody");
  body.innerHTML = ""; head.innerHTML = "";
  if (type === "taxe"){
    head.innerHTML = `<tr><th>CNP</th><th>Tip</th><th>Sumă</th><th>Expiră</th><th>User</th></tr>`;
    (taxeCache||[])
      .filter(r => (!userQ || (r.user||"").toLowerCase().includes(userQ)) &&
                    (!cnpQ  || String(r.cnp).toLowerCase().includes(cnpQ)) )
      .forEach(r=>{
        const suma = r.tip==="Bani curați" ? "40.000$" : (r.tip==="Bani murdari" ? "60.000$" : "GRATIS");
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${r.cnp}</td><td>${r.tip}</td><td>${suma}</td><td>${r.remaining||""}</td><td>${r.user||"-"}</td>`;
        body.appendChild(tr);
      });
  } else {
    head.innerHTML = `<tr><th>CNP</th><th>Familie</th><th>Cadru</th><th>Țeavă</th><th>Mecanism</th><th>Fixare</th><th>Plată</th><th>Cost</th><th>User</th></tr>`;
    (drillCache||[])
      .filter(r => (!userQ || (r.user||"").toLowerCase().includes(userQ)) &&
                    (!cnpQ  || String(r.cnp).toLowerCase().includes(cnpQ)) &&
                    (!famQ  || String(r.family||"").toLowerCase().includes(famQ)) )
      .forEach(j=>{
        const isFree = ["818","Medelin Cartel","Stefanos Cartel"].includes(j.family || "");
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${j.cnp}</td><td>${j.family||"-"}</td><td>${j.cadru}</td><td>${j.teava}</td><td>${j.mecanism}</td><td>${j.fixare}</td><td>${isFree?"GRATIS":"Bani murdari"}</td><td>${isFree?"0$":money(j.costTotal||0)}</td><td>${j.user||"-"}</td>`;
        body.appendChild(tr);
      });
  }
}

// ===== My profile =====
$("#profPeriod")?.addEventListener("change", () => {
  $("#profWeekPicker").classList.toggle("hidden", $("#profPeriod").value === "all");
  loadProfile();
});

async function loadProfile(){
  // calc simplu pe active (fără istoric)
  let clean=0, dirty=0, pieces=0, drillValue=0;

  (taxeCache||[]).forEach(t=>{
    if (t.user === ME?.username){
      if (t.tip === "Bani curați") clean += 40000;
      if (t.tip === "Bani murdari") dirty += 60000;
    }
  });
  (drillCache||[]).forEach(j=>{
    if (j.user === ME?.username){
      const pcs = (j.cadru||0)+(j.teava||0)+(j.mecanism||0)+(j.fixare||0);
      pieces += pcs;
      const isFree = ["818","Medelin Cartel","Stefanos Cartel"].includes(j.family||"");
      drillValue += isFree ? 0 : (j.costTotal||0);
    }
  });
  // în profil, “Taxe + Burghiu – Bani murdari” = dirty (taxe) + drillValue
  $("#profClean").textContent = money(clean);
  $("#profDirty").textContent = money(dirty + drillValue);
  $("#profPieces").textContent = pieces;
  $("#profDrillMoney").textContent = money(drillValue);

  // daily table (mock)
  const body = $("#profDailyTable tbody"); body.innerHTML = "";
  dayNames.forEach(d=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${d}</td><td>0</td><td>0$</td><td>0$</td>`;
    body.appendChild(tr);
  });

  // split 50/50
  const cleanUser = Math.floor(clean/2), cleanFam = clean - cleanUser;
  const dirtyTotal = dirty + drillValue;
  const dirtyUser = Math.floor(dirtyTotal/2), dirtyFam = dirtyTotal - dirtyUser;

  $("#splitCleanUser").textContent = money(cleanUser);
  $("#splitCleanFam").textContent  = money(cleanFam);
  $("#splitCleanTot").textContent  = money(clean);

  $("#splitDirtyUser").textContent = money(dirtyUser);
  $("#splitDirtyFam").textContent  = money(dirtyFam);
  $("#splitDirtyTot").textContent  = money(dirtyTotal);

  $("#splitAllUser").textContent = money(cleanUser + dirtyUser);
  $("#splitAllFam").textContent  = money(cleanFam + dirtyFam);
  $("#splitAllTot").textContent  = money(clean + dirtyTotal);
}

// ===== Invite link (Admin) =====
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

// ===== Init =====
hydrateMe();
setTabs("taxe");
