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
const money = (n=0) => `${(n||0).toLocaleString("ro-RO")}$`;

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
function inISOWeek(dateLike, year, week){
  if (!year || !week) return true;
  const d = new Date(dateLike);
  const start = mondayOfISOWeek(year, week);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);
  return d >= start && d < end;
}
const dayNames = ["Lun","Mar","Mie","Joi","Vin","Sâm","Dum"];

// Weeks 33..53, set current if in range + placeholder (fix iOS “No Options”)
function fillWeeks33toEnd(sel){
  if (!sel) return;
  sel.innerHTML = "";

  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = "— Selectează —";
  ph.disabled = false;
  sel.appendChild(ph);

  const now = new Date();
  const { year: nowYear, week: nowWeek } = isoYearWeek(now);
  let defValue = "";

  for (let w=33; w<=53; w++){
    const opt = document.createElement("option");
    opt.value = JSON.stringify({year: nowYear, week: w});
    opt.textContent = `${nowYear}-W${String(w).padStart(2,"0")}`;
    sel.appendChild(opt);
    if (nowWeek === w) defValue = opt.value;
  }

  sel.value = defValue || ph.value;
}
// dacă un select e gol, îl populăm pe loc
function ensureWeeksFilled(id){
  const el = document.getElementById(id);
  if (!el) return;
  if (!el.options || el.options.length <= 1) fillWeeks33toEnd(el);
}

// ===== Auth =====
async function hydrateMe() {
  try {
    const r = await api("/auth/me");
    if (!r.ok) throw 0;
    const me = await r.json();
    $("#whoami").textContent = `${me.username} [${me.role}]`;

    // vizibilitate tab-uri pe rol
    const show = (tab, cond) => {
      const btn = $$(".tabbtn").find(b => b.dataset.tab === tab);
      if (btn) btn.classList.toggle("hidden", !cond);
    };
    show("admin", me.role === "ADMIN" || me.role === "HEAD_OPERATOR" || me.role === "AUDIT");
    show("tables", true);
    show("dashboard", true);
    show("drillfamilies", true);
    show("profile", true);

    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");
    setTabs("taxe");

    // populare weeks pentru toate controalele (și fallback dacă sunt goale)
    ["dashWeekPicker","bfWeekPicker","weekSelect","tblWeekPicker","profWeekPicker"]
      .forEach(id => ensureWeeksFilled(id));

    // încărcări inițiale
    loadTaxe();
    loadDrill();
    loadDashboard();
    loadBF();
    loadAdmin();
    loadTableAll();
    loadProfile();

    // declanșăm prima schimbare ca să nu rămână pe placeholder
    $("#dashWeekPicker") && $("#dashWeekPicker").dispatchEvent(new Event("change"));
    $("#bfWeekPicker")   && $("#bfWeekPicker").dispatchEvent(new Event("change"));
    $("#weekSelect")     && $("#weekSelect").dispatchEvent(new Event("change"));
    $("#tblWeekPicker")  && $("#tblWeekPicker").dispatchEvent(new Event("change"));
    $("#profWeekPicker") && $("#profWeekPicker").dispatchEvent(new Event("change"));

    connectSSE();
  } catch {
    $("#auth").classList.remove("hidden");
    $("#app").classList.add("hidden");
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
  const r = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: f.username.value, password: f.password.value })
  });
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

    // asigurăm săptămânile populate pe fiecare tab relevant
    if (b.dataset.tab === "dashboard")     ensureWeeksFilled("dashWeekPicker");
    if (b.dataset.tab === "drillfamilies") ensureWeeksFilled("bfWeekPicker");
    if (b.dataset.tab === "admin")         ensureWeeksFilled("weekSelect");
    if (b.dataset.tab === "tables")        ensureWeeksFilled("tblWeekPicker");
    if (b.dataset.tab === "profile")       ensureWeeksFilled("profWeekPicker");

    if (b.dataset.tab === "taxe")      { loadTaxe(); loadDrill(); }
    if (b.dataset.tab === "dashboard") loadDashboard();
    if (b.dataset.tab === "drillfamilies") loadBF();
    if (b.dataset.tab === "admin")     loadAdmin();
    if (b.dataset.tab === "tables")    loadTableAll();
    if (b.dataset.tab === "profile")   loadProfile();
  });
});

// ===== SSE (live doar pe pagina Taxe & Burghiu) =====
let es;
function connectSSE() {
  try { es?.close?.(); } catch {}
  es = new EventSource("/events");

  // Actualizează DOAR pagina Taxe & Burghiu în timp real (live 4h)
  es.addEventListener("taxe:new",  () => { loadTaxe();  });
  es.addEventListener("drill:new", () => { loadDrill(); });
  es.addEventListener("ping", () => {});
}

// ===== Taxe (LIVE: doar activele 4h) =====
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
  if (!/^[0-9]{1,6}$/.test(cnp)) return alert("CNP invalid (max 6).");

  const body = { cnp, metoda: f.metoda.value };
  if (f.metoda.value === "gratis") body.gratisFamilie = f.gratisFamilie.value;

  const r = await api("/taxe", { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Eroare la taxă");
  f.reset(); metodaSelect.dispatchEvent(new Event("change"));
  loadTaxe(); // live list
});

// state + search
let taxeCache = [];
$("#taxSearch")?.addEventListener("input", () => renderTaxe(taxeCache));

async function loadTaxe() {
  // DOAR active (pentru live page)
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
      if (row.metoda === "gratis" || row.tip === "GRATIS") {
        suma = "GRATIS";
      } else if (row.tip === "Bani curați") {
        suma = "40.000$";
      } else if (row.tip === "Bani murdari") {
        suma = "60.000$";
      }
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="font-mono">${row.cnp}</td><td>${suma}</td><td>${row.remaining||""}</td><td class="left">${row.user||"-"}</td>`;
      tbody.appendChild(tr);
    });
}

// ===== Burghiu (LIVE list) =====
$("#drillForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const cnp = (f.cnp.value||"").trim();
  if (!/^[0-9]{1,6}$/.test(cnp)) return alert("CNP invalid (max 6).");

  const pieces = [
    { key:"cadru",    val: Number(f.cadru.value||0) },
    { key:"teava",    val: Number(f.teava.value||0) },
    { key:"mecanism", val: Number(f.mecanism.value||0) },
    { key:"fixare",   val: Number(f.fixare.value||0) },
  ].filter(p => p.val > 0);
  if (!pieces.length) return alert("Introdu minim o cantitate > 0.");
  if (!f.family.value) return alert("Selectează o familie.");

  for (const p of pieces) {
    const body = { cnp, part: p.key, quantity: p.val, family: f.family.value };
    const r = await api("/drill", { method: "POST", body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return alert(j.error || `Eroare la ${p.key}`);
  }

  f.reset();
  loadDrill(); // live list
});

let drillCache = [];
async function loadDrill() {
  // lista scurtă pentru live; backend oricum returnează ultimele 50
  const r = await api("/drill");
  if (!r.ok) return;
  drillCache = await r.json();
  renderDrill(drillCache);
}
function renderDrill(list){
  const tbody = $("#drillTable tbody");
  tbody.innerHTML = "";
  (list || []).slice(0,5).forEach(j => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="font-mono">${j.cnp}</td>
      <td class="left">${j.family||"-"}</td>
      <td>${j.cadru}</td>
      <td>${j.teava}</td>
      <td>${j.mecanism}</td>
      <td>${j.fixare}</td>
      <td>${j.metodaPlata}</td>
      <td>${money(j.costTotal || 0)}</td>
      <td class="left">${j.user||"-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== Dashboard (contează TOATE taxele/muncile) =====
$("#dashPeriod")?.addEventListener("change", loadDashboard);
$("#dashWeekPicker")?.addEventListener("change", loadDashboard);

async function loadDashboard() {
  const period = $("#dashPeriod")?.value || "week";
  let selYear, selWeek;
  try { if (period === "week" && $("#dashWeekPicker")?.value) ({year:selYear,week:selWeek} = JSON.parse($("#dashWeekPicker").value)); } catch {}

  let clean = 0, dirty = 0;
  const daily = Array.from({length:7}, (_,i)=>({ day: dayNames[i], count:0, clean:0, dirty:0 }));

  // *** ISTORIC COMPLET TAXE ***
  const rT = await api("/taxe/all");
  const taxe = rT.ok ? await rT.json() : [];
  taxe.forEach(t => {
    const created = t.createdAt ? new Date(t.createdAt) : new Date();
    if (period === "week" && selYear && selWeek && !inISOWeek(created, selYear, selWeek)) return;

    if (t.tip === "Bani curați") { clean += 40000; }
    if (t.tip === "Bani murdari") { dirty += 60000; }

    const wd = (created.getDay() + 6) % 7;
    const row = daily[wd];
    row.count += 1;
    if (t.tip === "Bani curați")  row.clean += 40000;
    if (t.tip === "Bani murdari") row.dirty += 60000;
  });

  $("#statTaxClean").textContent = money(clean);
  $("#statTaxDirty").textContent = money(dirty);

  const dBody = $("#dashDailyTable tbody");
  dBody.innerHTML = "";
  daily.forEach(d => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${d.day}</td><td>${d.count}</td><td>${money(d.clean)}</td><td>${money(d.dirty)}</td>`;
    dBody.appendChild(tr);
  });

  // *** ISTORIC COMPLET BURGHIU ***
  let rD = await api("/drill/all");
  if (!rD.ok) rD = await api("/drill"); // fallback dacă nu ai ruta /drill/all
  const famAgg = new Map();
  const topTaxMap = new Map();
  const topDrillMap = new Map();
  let totalPieces = 0;

  if (rD.ok) {
    const jobs = await rD.json();
    const jobsFilt = jobs.filter(j => {
      if (period === "all") return true;
      if (!selYear || !selWeek) return true;
      const dt = j.createdAt ? new Date(j.createdAt) : new Date();
      return inISOWeek(dt, selYear, selWeek);
    });

    jobsFilt.forEach(j=>{
      const pieces = j.cadru + j.teava + j.mecanism + j.fixare;
      totalPieces += pieces;
      const fam = j.family || "(fără)";
      const prev = famAgg.get(fam) || {cadru:0,teava:0,mecanism:0,fixare:0,total:0};
      prev.cadru += j.cadru; prev.teava += j.teava; prev.mecanism += j.mecanism; prev.fixare += j.fixare; prev.total += pieces;
      famAgg.set(fam, prev);

      const keyD = j.user || "";
      topDrillMap.set(keyD, (topDrillMap.get(keyD)||0) + (j.costTotal||0));
    });

    $("#statDrillPieces").textContent = (totalPieces||0).toLocaleString("ro-RO");
  }

  const famBody = $("#drillFamiliesTable tbody");
  famBody.innerHTML = "";
  [...famAgg.entries()].sort((a,b)=>b[1].total - a[1].total).forEach(([fam, agg])=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${fam}</td><td>${agg.cadru}</td><td>${agg.teava}</td><td>${agg.mecanism}</td><td>${agg.fixare}</td><td>${agg.total}</td>`;
    famBody.appendChild(tr);
  });

  // top taxe pe user (din istoricul complet, filtrat pe săptămână dacă e cazul)
  (taxe||[]).forEach(t=>{
    const created = t.createdAt ? new Date(t.createdAt) : new Date();
    if (period === "week" && selYear && selWeek && !inISOWeek(created, selYear, selWeek)) return;
    const key = t.user || "";
    if (!key) return;
    topTaxMap.set(key, (topTaxMap.get(key)||0) + (t.tip === "GRATIS" ? 0 : 1));
  });

  const topTaxBody = $("#topCnpTaxe tbody");
  topTaxBody.innerHTML = "";
  [...topTaxMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([user, cnt])=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${user||"-"}</td><td>${cnt}</td>`;
    topTaxBody.appendChild(tr);
  });

  const topDrillBody = $("#topCnpDrill tbody");
  topDrillBody.innerHTML = "";
  [...topDrillMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([user, val])=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${user||"-"}</td><td>${money(val||0)}</td>`;
    topDrillBody.appendChild(tr);
  });
}

// ===== Statistici Familii (din istoric burghiu) =====
$("#bfWeekPicker")?.addEventListener("change", loadBF);
async function loadBF(){
  const sel = $("#bfWeekPicker")?.value || "";
  let selYear, selWeek;
  try { ({year:selYear,week:selWeek} = JSON.parse(sel)); } catch {}

  let rD = await api("/drill/all");
  if (!rD.ok) rD = await api("/drill");
  if (!rD.ok) return;
  const list = await rD.json();

  const famAgg = new Map();
  list.forEach(j=>{
    const dt = j.createdAt ? new Date(j.createdAt) : new Date();
    if (!inISOWeek(dt, selYear, selWeek)) return;
    const fam = j.family || "(fără)";
    const prev = famAgg.get(fam) || {cadru:0,teava:0,mecanism:0,fixare:0,total:0};
    prev.cadru += j.cadru; prev.teava += j.teava; prev.mecanism += j.mecanism; prev.fixare += j.fixare;
    prev.total += j.cadru + j.teava + j.mecanism + j.fixare;
    famAgg.set(fam, prev);
  });
  const tbody = $("#bfTable tbody");
  tbody.innerHTML = "";
  [...famAgg.entries()].sort((a,b)=>b[1].total-a[1].total).forEach(([fam,agg])=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${fam}</td><td>${agg.cadru}</td><td>${agg.teava}</td><td>${agg.mecanism}</td><td>${agg.fixare}</td><td>${agg.total}</td>`;
    tbody.appendChild(tr);
  });
}

// ===== Admin (backend deja calculează din istoricul complet) =====
$("#admPeriod")?.addEventListener("change", loadAdmin);
$("#weekSelect")?.addEventListener("change", loadAdmin);

async function loadAdmin() {
  const period = $("#admPeriod")?.value || "week";
  let url = "/admin/stats";
  if (period === "all") url = "/admin/stats?period=all";
  else if ($("#weekSelect")?.value) {
    const {year, week} = JSON.parse($("#weekSelect").value);
    url = `/admin/stats?year=${year}&week=${week}`;
  }

  const r = await api(url);
  const tbody = $("#admTable tbody");
  if (r.status === 403) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-slate-400">Acces doar pentru ADMIN/HEAD_OPERATOR/AUDIT.</td></tr>`;
    return;
  }
  const list = await r.json();

  tbody.innerHTML = "";
  list.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="left">${row.username}</td>
      <td>${money(row.userShareClean||0)}</td>
      <td>${money(row.userShareDirty||0)}</td>
      <td>${money(row.familyShareClean||0)}</td>
      <td>${money(row.familyShareDirty||0)}</td>
      <td>${money(row.totalClean||0)}</td>
      <td>${money(row.totalDirty||0)}</td>
      <td class="total-col">${money(row.total||0)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Invite Admin
$("#inviteBtn")?.addEventListener("click", async ()=>{
  const role = $("#inviteRole").value || "OPERATOR";
  const r = await api("/invites", { method:"POST", body: JSON.stringify({ role }) });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Eroare la generare invite");
  $("#inviteResult").value = j.code || "";
});
$("#inviteCopy")?.addEventListener("click", ()=>{
  const v = $("#inviteResult")?.value || "";
  if (!v) return;
  navigator.clipboard.writeText(v);
});

// ===== Tabele All (folosesc ISTORIC complet) =====
$("#tblPeriod")?.addEventListener("change", loadTableAll);
$("#tblWeekPicker")?.addEventListener("change", loadTableAll);
$("#tblRefresh")?.addEventListener("click", loadTableAll);
$("#tblType")?.addEventListener("change", loadTableAll);

async function loadTableAll(){
  ensureWeeksFilled("tblWeekPicker");

  const type = $("#tblType").value;
  const filterUser = ($("#tblFilterUser").value||"").toLowerCase();
  const filterCnp = ($("#tblFilterCnp").value||"").toLowerCase();
  const filterFam = ($("#tblFilterFamily").value||"").toLowerCase();
  const head = $("#tblHead");
  const body = $("#tblAll tbody");
  body.innerHTML = "";

  let selYear, selWeek;
  try { ({year:selYear,week:selWeek} = JSON.parse($("#tblWeekPicker")?.value||"")); } catch {}
  const weekMode = ($("#tblPeriod")?.value||"week") === "week";

  if (type === "taxe") {
    head.innerHTML = `<tr><th class="left">CNP</th><th>Sumă</th><th>Timp rămas</th><th class="left">User</th><th class="left">Familie</th><th>Creat</th></tr>`;

    // *** ISTORIC COMPLET TAXE ***
    let r = await api("/taxe/all");
    if (!r.ok) return;
    const list = await r.json();
    list
      .filter(x => !filterUser || (x.user||"").toLowerCase().includes(filterUser))
      .filter(x => !filterCnp || (x.cnp||"").toLowerCase().includes(filterCnp))
      .filter(x => !filterFam || (x.gratisFamilie||"").toLowerCase().includes(filterFam))
      .filter(x => {
        if (!weekMode) return true;
        const created = x.createdAt ? new Date(x.createdAt) : new Date();
        return inISOWeek(created, selYear, selWeek);
      })
      .forEach(x=>{
        let suma = x.tip==="GRATIS" ? "GRATIS" : (x.tip==="Bani curați"?"40.000$":"60.000$");
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="font-mono">${x.cnp}</td><td>${suma}</td><td>${x.remaining||""}</td><td class="left">${x.user||"-"}</td><td class="left">${x.gratisFamilie||"-"}</td><td>${x.createdAt?new Date(x.createdAt).toLocaleString("ro-RO"):""}</td>`;
        body.appendChild(tr);
      });
  } else {
    head.innerHTML = `<tr><th class="left">CNP</th><th class="left">Familie</th><th>Cadru</th><th>Țeavă</th><th>Mecanism</th><th>Fixare</th><th>Plată</th><th>Valoare</th><th class="left">User</th><th>Creat</th></tr>`;

    // *** ISTORIC COMPLET BURGHIU ***
    let r = await api("/drill/all");
    if (!r.ok) r = await api("/drill");
    if (!r.ok) return;
    const list = await r.json();
    list
      .filter(x => !filterUser || (x.user||"").toLowerCase().includes(filterUser))
      .filter(x => !filterCnp || (x.cnp||"").toLowerCase().includes(filterCnp))
      .filter(x => !filterFam || (x.family||"").toLowerCase().includes(filterFam))
      .filter(x => {
        if (!weekMode) return true;
        const created = x.createdAt ? new Date(x.createdAt) : new Date();
        return inISOWeek(created, selYear, selWeek);
      })
      .forEach(j=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="font-mono">${j.cnp}</td><td class="left">${j.family||"-"}</td><td>${j.cadru}</td><td>${j.teava}</td><td>${j.mecanism}</td><td>${j.fixare}</td><td>${j.metodaPlata}</td><td>${money(j.costTotal||0)}</td><td class="left">${j.user||"-"}</td><td>${j.createdAt?new Date(j.createdAt).toLocaleString("ro-RO"):""}</td>`;
        body.appendChild(tr);
      });
  }
}

// ===== Profile (contează ISTORIC complet) =====
$("#profPeriod")?.addEventListener("change", loadProfile);
$("#profWeekPicker")?.addEventListener("change", loadProfile);

async function loadProfile(){
  ensureWeeksFilled("profWeekPicker");

  const period = $("#profPeriod")?.value || "week";
  let selYear, selWeek;
  try { if (period === "week" && $("#profWeekPicker")?.value) ({year:selYear,week:selWeek} = JSON.parse($("#profWeekPicker").value)); } catch {}

  let clean=0, dirty=0, pieces=0, drillMoney=0;
  const daily = Array.from({length:7}, (_,i)=>({ day: dayNames[i], count:0, clean:0, dirty:0 }));

  // *** ISTORIC COMPLET TAXE ***
  let rT = await api("/taxe/all");
  const taxe = rT.ok ? await rT.json() : [];
  taxe.forEach(t=>{
    const created = t.createdAt ? new Date(t.createdAt) : new Date();
    if (period==="week" && selYear && selWeek && !inISOWeek(created, selYear, selWeek)) return;
    if (t.tip === "Bani curați") { clean += 40000; daily[(created.getDay()+6)%7].clean += 40000; daily[(created.getDay()+6)%7].count++; }
    if (t.tip === "Bani murdari") { dirty += 60000; daily[(created.getDay()+6)%7].dirty += 60000; daily[(created.getDay()+6)%7].count++; }
  });

  // *** ISTORIC COMPLET BURGHIU ***
  let rD = await api("/drill/all");
  if (!rD.ok) rD = await api("/drill");
  if (rD.ok) {
    const jobs = await rD.json();
    jobs.forEach(j=>{
      const created = j.createdAt ? new Date(j.createdAt) : new Date();
      if (period==="week" && selYear && selWeek && !inISOWeek(created, selYear, selWeek)) return;
      const p = j.cadru + j.teava + j.mecanism + j.fixare;
      pieces += p;
      drillMoney += (j.costTotal||0);
    });
  }

  $("#profClean").textContent = money(clean);
  $("#profDirty").textContent = money(dirty + drillMoney);
  $("#profPieces").textContent = (pieces||0).toLocaleString("ro-RO");
  $("#profDrillMoney").textContent = money(drillMoney);

  const body = $("#profDailyTable tbody");
  body.innerHTML = "";
  daily.forEach(d=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${d.day}</td><td>${d.count}</td><td>${money(d.clean)}</td><td>${money(d.dirty)}</td>`;
    body.appendChild(tr);
  });

  // split 50/50
  const userClean = clean * 0.5, famClean = clean * 0.5;
  const userDirty = (dirty+drillMoney) * 0.5, famDirty = (dirty+drillMoney) * 0.5;
  $("#splitCleanUser").textContent = money(userClean);
  $("#splitCleanFam").textContent  = money(famClean);
  $("#splitCleanTot").textContent  = money(clean);
  $("#splitDirtyUser").textContent = money(userDirty);
  $("#splitDirtyFam").textContent  = money(famDirty);
  $("#splitDirtyTot").textContent  = money(dirty+drillMoney);
  $("#splitAllUser").textContent   = money(userClean+userDirty);
  $("#splitAllFam").textContent    = money(famClean+famDirty);
  $("#splitAllTot").textContent    = money(clean+dirty+drillMoney);
}

// ===== Init =====
hydrateMe();
setTabs("taxe");
