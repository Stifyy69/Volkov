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
const money = (n=0) => `${(n||0).toLocaleString("ro-RO").replace(/\s/g,'')} $`.replace(' $', '$'); // 1.000.000$

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
function inISOWeek(d, year, week){
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const { year:yy, week:ww } = isoYearWeek(tmp);
  return (yy===year && ww===week);
}
const dayNames = ["Lun","Mar","Mie","Joi","Vin","Sâm","Dum"];

// populate week selects W33..W52 current year
function fillWeeksFrom33To52(sel){
  if (!sel) return;
  sel.innerHTML = "";
  const now = new Date();
  const currentYear = now.getFullYear();
  for (let w = 33; w <= 52; w++){
    const opt = document.createElement("option");
    opt.value = JSON.stringify({year:currentYear, week:w});
    opt.textContent = `${currentYear}-W${String(w).padStart(2,"0")}`;
    sel.appendChild(opt);
  }
}

// show/hide a week select based on a period <select>
function bindPeriod(periodSel, weekSel){
  const update = () => {
    const isWeek = periodSel.value === "week";
    weekSel.classList.toggle("hidden", !isWeek);
  };
  periodSel.addEventListener("change", update);
  update();
}

// ===== Auth =====
async function hydrateMe() {
  try {
    const r = await api("/auth/me");
    if (!r.ok) throw 0;
    const me = await r.json();
    $("#whoami").textContent = `${me.username} [${me.role}]`;

    // role-based tabs
    const see = (tab, show) => {
      const btn = $$(".tabbtn").find(b => b.dataset.tab === tab);
      if (btn) btn.classList.toggle("hidden", !show);
    };
    // OPERATOR: taxe, dashboard, drillfamilies, tables, profile (fără admin)
    // AUDIT: vede tot (fără posibilitatea de a trimite în UI — logica server blochează oricum)
    // ADMIN: tot
    see("admin", me.role === "ADMIN");
    // dacă vrei să ascunzi "tables" de operatori, schimbă aici.
    // (lăsăm vizibil)

    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");
    setTabs("taxe");

    // weeks in all places
    fillWeeksFrom33To52($("#dashWeekPicker"));
    fillWeeksFrom33To52($("#bfWeekPicker"));
    fillWeeksFrom33To52($("#weekSelect"));
    fillWeeksFrom33To52($("#tblWeekPicker"));
    fillWeeksFrom33To52($("#profWeekPicker"));

    // bind period controls
    bindPeriod($("#dashPeriod"), $("#dashWeekPicker"));
    bindPeriod($("#bfPeriod"),   $("#bfWeekPicker"));
    bindPeriod($("#admPeriod"),  $("#weekSelect"));
    bindPeriod($("#tblPeriod"),  $("#tblWeekPicker"));
    bindPeriod($("#profPeriod"), $("#profWeekPicker"));

    loadTaxe();
    loadDrill();
    loadDashboard();
    loadAdmin();
    loadTables();
    loadProfile();

    // SSE
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
  es.addEventListener("taxe:new", () => { loadTaxe(); loadDashboard(); loadTables(); loadProfile(); });
  es.addEventListener("drill:new", () => { loadDrill(); loadDashboard(); loadDrillFamilies(); loadTables(); loadProfile(); });
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
  loadTaxe(); loadDashboard(); loadTables(); loadProfile();
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
      if (row.metoda === "GRATIS" || row.tip === "GRATIS" || (row.amount===0)) {
        suma = "GRATIS";
      } else if (row.tip === "Bani curați") {
        suma = "40.000$";
      } else if (row.tip === "Bani murdari") {
        suma = "60.000$";
      }
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="font-mono">${row.cnp}</td><td>${suma}</td><td>${row.remaining||""}</td><td class="left">${row.user || "-"}</td>`;
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
  loadDrill(); loadDashboard(); loadDrillFamilies(); loadTables(); loadProfile();
});

let drillCache = [];
async function loadDrill() {
  const r = await api("/drill");
  if (!r.ok) return;
  const all = await r.json();
  drillCache = all.slice(0,5); // doar ultimele 5
  renderDrill(drillCache);
}
function renderDrill(list){
  const tbody = $("#drillTable tbody");
  tbody.innerHTML = "";
  (list || []).forEach(j => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="font-mono">${j.cnp}</td>
      <td class="left">${j.family||"-"}</td>
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

// ===== Dashboard (pe săptămâna selectată sau all-time) =====
$("#dashPeriod")?.addEventListener("change", loadDashboard);
$("#dashWeekPicker")?.addEventListener("change", loadDashboard);

async function loadDashboard() {
  const period = $("#dashPeriod").value;
  let selYear, selWeek;
  try { if (period==="week" && $("#dashWeekPicker").value) ({year:selYear,week:selWeek} = JSON.parse($("#dashWeekPicker").value)); } catch {}

  // 1) Taxe pe săptămână
  let clean = 0, dirty = 0;
  const daily = Array.from({length:7}, (_,i)=>({ day: dayNames[i], count:0, clean:0, dirty:0 }));

  const rT = await api("/taxe");
  let taxe = [];
  if (rT.ok) {
    taxe = await rT.json();
    taxe.forEach(t => {
      const created = t.createdAt ? new Date(t.createdAt) : new Date();
      if (period==="week" && selYear && selWeek && !inISOWeek(created, selYear, selWeek)) return;

      if (t.tip === "Bani curați") { clean += 40000; }
      if (t.tip === "Bani murdari") { dirty += 60000; }

      const wd = (created.getDay() + 6) % 7;
      const row = daily[wd];
      row.count += 1;
      if (t.tip === "Bani curați")  row.clean += 40000;
      if (t.tip === "Bani murdari") row.dirty += 60000;
    });
  }
  $("#statTaxClean").textContent = money(clean).replace(' $', '$');
  $("#statTaxDirty").textContent = money(dirty).replace(' $', '$');

  const dBody = $("#dashDailyTable tbody");
  dBody.innerHTML = "";
  daily.forEach(d => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${d.day}</td><td>${d.count}</td><td>${money(d.clean)}</td><td>${money(d.dirty)}</td>`;
    dBody.appendChild(tr);
  });

  // 2) Burghiu pe săptămână + topuri
  const rD = await api("/drill");
  const famAgg = new Map(); // familie -> {cadru, teava, mecanism, fixare}
  const topTaxMap = new Map(); // user -> count
  const topDrillMap = new Map(); // user -> sum $
  let totalPieces = 0;

  let jobs = [];
  if (rD.ok) {
    const all = await rD.json();
    jobs = all.filter(j => {
      const dt = j.createdAt ? new Date(j.createdAt) : new Date();
      return (period==="week" ? inISOWeek(dt, selYear, selWeek) : true);
    });

    jobs.forEach(j=>{
      const pieces = j.cadru + j.teava + j.mecanism + j.fixare;
      totalPieces += pieces;
      const fam = j.family || "(fără)";
      const prev = famAgg.get(fam) || {cadru:0,teava:0,mecanism:0,fixare:0};
      prev.cadru += j.cadru; prev.teava += j.teava; prev.mecanism += j.mecanism; prev.fixare += j.fixare;
      famAgg.set(fam, prev);

      const user = j.user || "-";
      topDrillMap.set(user, (topDrillMap.get(user)||0) + (j.costTotal||0));
    });
  }
  $("#statDrillPieces").textContent = (totalPieces||0).toLocaleString("ro-RO");

  // Familii burghiu tabel
  const famBody = $("#drillFamiliesTable tbody");
  famBody.innerHTML = "";
  [...famAgg.entries()]
    .map(([fam,v]) => ({fam, ...v, total: v.cadru+v.teava+v.mecanism+v.fixare}))
    .sort((a,b)=>b.total-a.total)
    .forEach(r=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="left">${r.fam}</td><td>${r.cadru}</td><td>${r.teava}</td><td>${r.mecanism}</td><td>${r.fixare}</td><td>${r.total}</td>`;
      famBody.appendChild(tr);
    });

  // Top useri taxe (pe săptămână)
  const topTaxBody = $("#topCnpTaxe tbody");
  topTaxBody.innerHTML = "";
  const userTaxMap = new Map();
  (taxe||[]).forEach(t=>{
    const created = t.createdAt ? new Date(t.createdAt) : new Date();
    if (period==="week" && selYear && selWeek && !inISOWeek(created, selYear, selWeek)) return;
    const user = t.user || "-";
    userTaxMap.set(user, (userTaxMap.get(user)||0) + 1);
  });
  [...userTaxMap.entries()]
    .sort((a,b)=>b[1]-a[1]).slice(0,20)
    .forEach(([user,count])=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="left">${user}</td><td>${count}</td>`;
      topTaxBody.appendChild(tr);
    });

  // Top useri drill (pe săptămână)
  const topDrillBody = $("#topCnpDrill tbody");
  topDrillBody.innerHTML = "";
  [...topDrillMap.entries()]
    .sort((a,b)=>b[1]-a[1]).slice(0,20)
    .forEach(([user,sum])=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="left">${user}</td><td>${money(sum)}</td>`;
      topDrillBody.appendChild(tr);
    });

  // filtru familie pe dashboard
  $("#famSearch")?.addEventListener("input", ()=>{
    const v = ($("#famSearch").value||"").toLowerCase();
    [...$("#drillFamiliesTable tbody").children].forEach(tr=>{
      const name = tr.children[0].textContent.toLowerCase();
      tr.style.display = name.includes(v) ? "" : "none";
    });
  }, { once:true });
}

// ===== Statistici Familii =====
$("#bfPeriod")?.addEventListener("change", loadDrillFamilies);
$("#bfWeekPicker")?.addEventListener("change", loadDrillFamilies);
$("#bfSearch")?.addEventListener("input", ()=>{
  const v = ($("#bfSearch").value||"").toLowerCase();
  [...$("#bfTable tbody").children].forEach(tr=>{
    const name = tr.children[0].textContent.toLowerCase();
    tr.style.display = name.includes(v) ? "" : "none";
  });
});

async function loadDrillFamilies(){
  const period = $("#bfPeriod").value;
  let selYear, selWeek;
  try { if (period==="week" && $("#bfWeekPicker").value) ({year:selYear,week:selWeek} = JSON.parse($("#bfWeekPicker").value)); } catch {}
  const rD = await api("/drill");
  const tbody = $("#bfTable tbody");
  tbody.innerHTML = "";
  if (!rD.ok) return;

  const agg = new Map();
  const jobs = (await rD.json()).filter(j=>{
    const dt = j.createdAt ? new Date(j.createdAt) : new Date();
    return (period==="week" ? inISOWeek(dt, selYear, selWeek) : true);
  });
  jobs.forEach(j=>{
    const fam = j.family || "(fără)";
    const prev = agg.get(fam) || {cadru:0,teava:0,mecanism:0,fixare:0};
    prev.cadru += j.cadru; prev.teava += j.teava; prev.mecanism += j.mecanism; prev.fixare += j.fixare;
    agg.set(fam, prev);
  });
  [...agg.entries()]
    .map(([fam,v]) => ({fam, ...v, total: v.cadru+v.teava+v.mecanism+v.fixare}))
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

async function loadAdmin(){
  const period = $("#admPeriod").value;
  let url = "/admin/stats";
  if (period==="week" && $("#weekSelect").value) {
    const {year, week} = JSON.parse($("#weekSelect").value);
    url = `/admin/stats?year=${year}&week=${week}`;
  }
  const r = await api(url);
  const tbody = $("#admTable tbody");
  tbody.innerHTML = "";
  if (r.status === 403) {
    tbody.innerHTML = `<tr><td colspan="8" class="left" style="color:#9fb3c8">Doar ADMIN are acces.</td></tr>`;
    return;
  }
  const list = await r.json();
  if (!Array.isArray(list) || !list.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="left" style="color:#9fb3c8">Fără date.</td></tr>`;
    return;
  }

  // sort desc by TOTAL
  list.sort((a,b)=> (b.total||0) - (a.total||0));

  let sum = {uC:0,uD:0,fC:0,fD:0,tC:0,tD:0,tt:0};
  list.forEach(u=>{
    sum.uC += u.userClean||0; sum.uD += u.userDirty||0;
    sum.fC += u.familyClean||0; sum.fD += u.familyDirty||0;
    sum.tC += u.totalClean||0; sum.tD += u.totalDirty||0;
    sum.tt += u.total||0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="left">${u.username}</td>
      <td>${money(u.userClean||0)}</td>
      <td>${money(u.userDirty||0)}</td>
      <td>${money(u.familyClean||0)}</td>
      <td>${money(u.familyDirty||0)}</td>
      <td>${money(u.totalClean||0)}</td>
      <td>${money(u.totalDirty||0)}</td>
      <td>${money(u.total||0)}</td>`;
    tbody.appendChild(tr);
  });

  // total row (accent)
  const tr = document.createElement("tr");
  tr.className = "total-row";
  tr.innerHTML = `
    <td class="left"><b>TOTAL</b></td>
    <td><b>${money(sum.uC)}</b></td>
    <td><b>${money(sum.uD)}</b></td>
    <td><b>${money(sum.fC)}</b></td>
    <td><b>${money(sum.fD)}</b></td>
    <td><b>${money(sum.tC)}</b></td>
    <td><b>${money(sum.tD)}</b></td>
    <td><b>${money(sum.tt)}</b></td>`;
  tbody.appendChild(tr);
}

// ===== Tabele All =====
$("#tblPeriod")?.addEventListener("change", loadTables);
$("#tblWeekPicker")?.addEventListener("change", loadTables);
$("#tblRefresh")?.addEventListener("click", loadTables);
$("#tblType")?.addEventListener("change", renderTables);

let tblCache = [];
async function loadTables(){
  const type = $("#tblType").value;
  const period = $("#tblPeriod").value;
  let yr, wk;
  try { if (period==="week" && $("#tblWeekPicker").value) ({year:yr,week:wk} = JSON.parse($("#tblWeekPicker").value)); } catch {}

  let data = [];
  if (type === "taxe"){
    const r = await api("/taxe");
    if (!r.ok) return;
    data = await r.json();
  } else {
    const r = await api("/drill");
    if (!r.ok) return;
    data = await r.json();
  }

  tblCache = data.filter(row=>{
    if (period!=="week") return true;
    const dt = new Date(row.createdAt || Date.now());
    return inISOWeek(dt, yr, wk);
  });

  renderTables();
}
function renderTables(){
  const type = $("#tblType").value;
  const head = $("#tblHead");
  const body = $("#tblAll tbody");
  body.innerHTML = "";

  const qUser = ($("#tblFilterUser").value||"").toLowerCase();
  const qCnp  = ($("#tblFilterCnp").value||"").toLowerCase();
  const qFam  = ($("#tblFilterFamily").value||"").toLowerCase();

  const rows = tblCache.filter(r => {
    const user = (r.user||"").toLowerCase();
    const cnp  = String(r.cnp||"").toLowerCase();
    const fam  = (r.family||r?.family?.name||"").toLowerCase();
    return (!qUser || user.includes(qUser)) &&
           (!qCnp  || cnp.includes(qCnp)) &&
           (!qFam  || fam.includes(qFam));
  });

  if (type==="taxe"){
    head.innerHTML = `<tr>
      <th class="left">CNP</th><th>Tip</th><th>Sumă</th><th>Expiră</th><th class="left">User</th></tr>`;
    rows.forEach(r=>{
      let tip = r.tip || (r.amount===0 ? "GRATIS" : "");
      let suma = r.amount===0 ? "GRATIS" : (tip==="Bani curați" ? "40.000$" : (tip==="Bani murdari" ? "60.000$" : ""));
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="left">${r.cnp}</td><td>${tip}</td><td>${suma}</td><td>${r.remaining||""}</td><td class="left">${r.user||"-"}</td>`;
      body.appendChild(tr);
    });
  } else {
    head.innerHTML = `<tr>
      <th class="left">CNP</th><th class="left">Familie</th>
      <th>Cadru</th><th>Țeavă</th><th>Mecanism</th><th>Fixare</th>
      <th>Valoare (Bani murdari)</th><th class="left">User</th></tr>`;
    rows.forEach(j=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="left">${j.cnp}</td><td class="left">${j.family||"-"}</td>
        <td>${j.cadru}</td><td>${j.teava}</td><td>${j.mecanism}</td><td>${j.fixare}</td>
        <td>${money(j.costTotal||0)}</td><td class="left">${j.user||"-"}</td>`;
      body.appendChild(tr);
    });
  }
}

// ===== My profile =====
$("#profPeriod")?.addEventListener("change", loadProfile);
$("#profWeekPicker")?.addEventListener("change", loadProfile);

async function loadProfile(){
  const period = $("#profPeriod").value;
  let yr, wk;
  try { if (period==="week" && $("#profWeekPicker").value) ({year:yr,week:wk} = JSON.parse($("#profWeekPicker").value)); } catch {}

  // me
  const meR = await api("/auth/me"); if (!meR.ok) return;
  const me = await meR.json();

  // taxe
  let clean=0, dirty=0;
  const daily = Array.from({length:7}, (_,i)=>({ day: dayNames[i], count:0, clean:0, dirty:0 }));
  const rT = await api("/taxe");
  if (rT.ok){
    const taxe = (await rT.json()).filter(t => (t.user===me.username));
    taxe.forEach(t=>{
      const dt = new Date(t.createdAt || Date.now());
      if (period==="week" && !(inISOWeek(dt, yr, wk))) return;
      if (t.tip==="Bani curați")  clean += 40000;
      if (t.tip==="Bani murdari") dirty += 60000;
      const wd = (dt.getDay()+6)%7;
      daily[wd].count++;
      if (t.tip==="Bani curați")  daily[wd].clean += 40000;
      if (t.tip==="Bani murdari") daily[wd].dirty += 60000;
    });
  }

  // drill (bani murdari)
  let drillPieces=0, drillMoney=0;
  const rD = await api("/drill");
  if (rD.ok){
    const jobs = (await rD.json()).filter(j => (j.user===me.username));
    jobs.forEach(j=>{
      const dt = new Date(j.createdAt || Date.now());
      if (period==="week" && !(inISOWeek(dt, yr, wk))) return;
      drillPieces += (j.cadru + j.teava + j.mecanism + j.fixare);
      drillMoney  += (j.costTotal || 0);
    });
  }

  // set stats
  $("#profClean").textContent      = money(clean);
  $("#profDirty").textContent      = money(dirty + drillMoney);
  $("#profPieces").textContent     = (drillPieces).toLocaleString("ro-RO");
  $("#profDrillMoney").textContent = money(drillMoney);

  // daily table
  const body = $("#profDailyTable tbody");
  body.innerHTML = "";
  daily.forEach(d=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${d.day}</td><td>${d.count}</td><td>${money(d.clean)}</td><td>${money(d.dirty)}</td>`;
    body.appendChild(tr);
  });

  // split 50/50
  const userClean  = Math.floor(clean * 0.5);
  const famClean   = clean - userClean;
  const userDirty  = Math.floor((dirty + drillMoney) * 0.5);
  const famDirty   = (dirty + drillMoney) - userDirty;

  $("#splitCleanUser").textContent = money(userClean);
  $("#splitCleanFam").textContent  = money(famClean);
  $("#splitCleanTot").textContent  = money(clean);

  $("#splitDirtyUser").textContent = money(userDirty);
  $("#splitDirtyFam").textContent  = money(famDirty);
  $("#splitDirtyTot").textContent  = money(dirty + drillMoney);

  $("#splitAllUser").textContent   = money(userClean + userDirty);
  $("#splitAllFam").textContent    = money(famClean + famDirty);
  $("#splitAllTot").textContent    = money(clean + dirty + drillMoney);
}

// ===== Init =====
hydrateMe();
setTabs("taxe");
