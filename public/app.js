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

// ===== ISO week utils =====
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

// ===== Period controls =====
function fillWeekSelect(sel, startWeek = 33){
  if (!sel) return;
  sel.innerHTML = "";
  const now = new Date();
  const {year:currY, week:currW} = isoYearWeek(now);
  // din saptamana 33 a anului curent pana la saptamana curentă
  for (let w = Math.max(startWeek,1); w <= currW; w++){
    const opt = document.createElement("option");
    opt.value = JSON.stringify({year: currY, week: w});
    opt.textContent = `${currY}-W${String(w).padStart(2,"0")}`;
    sel.appendChild(opt);
  }
}
function readPeriod(modeSel, weekSel){
  const mode = modeSel?.value || "week";
  if (mode === "all") return { period:"all" };
  let y, w;
  try { if (weekSel?.value) ({year:y,week:w} = JSON.parse(weekSel.value)); } catch {}
  return { period:"week", year:y, week:w };
}

// ===== Roles =====
let CURRENT_ROLE = null;
function applyRoleVisibility(){
  const tabTaxe  = $(`.tabbtn[data-tab="taxe"]`);
  const tabDash  = $(`.tabbtn[data-tab="dashboard"]`);
  const tabFam   = $(`.tabbtn[data-tab="families"]`);
  const tabAdmin = $(`.tabbtn[data-tab="admin"]`);
  const tabProf  = $(`.tabbtn[data-tab="profile"]`);

  if (CURRENT_ROLE === "OPERATOR"){
    // vede: taxe, dashboard? (poate vedea), families? (vizual), profile
    tabTaxe?.classList.remove("hidden");
    tabDash?.classList.remove("hidden");
    tabFam?.classList.remove("hidden");
    tabAdmin?.classList.add("hidden");
    tabProf?.classList.remove("hidden");
    // butoanele de submit sunt active
    setEditable(true);
  } else if (CURRENT_ROLE === "AUDIT"){
    // vede tot, dar read-only
    tabTaxe?.classList.remove("hidden");
    tabDash?.classList.remove("hidden");
    tabFam?.classList.remove("hidden");
    tabAdmin?.classList.remove("hidden");
    tabProf?.classList.remove("hidden");
    setEditable(false); // dezactivăm submit/ștergere/Invite
  } else {
    // ADMIN si HEAD_OPERATOR -> tot
    tabTaxe?.classList.remove("hidden");
    tabDash?.classList.remove("hidden");
    tabFam?.classList.remove("hidden");
    tabAdmin?.classList.remove("hidden");
    tabProf?.classList.remove("hidden");
    setEditable(true);
  }
}
function setEditable(canEdit){
  // Taxe
  $("#sendTaxBtn")?.toggleAttribute("disabled", !canEdit);
  $("#metodaSelect")?.toggleAttribute("disabled", !canEdit && CURRENT_ROLE==="AUDIT");
  $("#taxeCnp")?.toggleAttribute("disabled", !canEdit && CURRENT_ROLE==="AUDIT");
  $("#gratisFamilie")?.toggleAttribute("disabled", !canEdit && CURRENT_ROLE==="AUDIT");
  // Burghiu
  $("#sendDrillBtn")?.toggleAttribute("disabled", !canEdit);
  $("#drillCnp")?.toggleAttribute("disabled", !canEdit && CURRENT_ROLE==="AUDIT");
  $("#drillFamily")?.toggleAttribute("disabled", !canEdit && CURRENT_ROLE==="AUDIT");
  $("#qtyCadru")?.toggleAttribute("disabled", !canEdit && CURRENT_ROLE==="AUDIT");
  $("#qtyTeava")?.toggleAttribute("disabled", !canEdit && CURRENT_ROLE==="AUDIT");
  $("#qtyMec")?.toggleAttribute("disabled", !canEdit && CURRENT_ROLE==="AUDIT");
  $("#qtyFix")?.toggleAttribute("disabled", !canEdit && CURRENT_ROLE==="AUDIT");
  // Admin: stergere si invite
  $$(".btn-delete-tax").forEach(b => b.toggleAttribute("disabled", !canEdit || CURRENT_ROLE==="AUDIT"));
  $$(".btn-delete-drill").forEach(b => b.toggleAttribute("disabled", !canEdit || CURRENT_ROLE==="AUDIT"));
  $("#inviteBtn")?.toggleAttribute("disabled", !canEdit || CURRENT_ROLE==="AUDIT");
}

// ===== Auth =====
async function hydrateMe() {
  try {
    const r = await api("/auth/me");
    if (!r.ok) throw 0;
    const me = await r.json();
    CURRENT_ROLE = me.role || "OPERATOR";
    $("#whoami").textContent = `${me.username} [${me.role}]`;
    $("#auth").classList.add("hidden");
    applyRoleVisibility();

    // default tab
    setTabs("taxe");

    // period selects init
    fillWeekSelect($("#dashWeekPicker"), 33);
    fillWeekSelect($("#famWeekPicker"), 33);
    fillWeekSelect($("#adminWeekPicker"), 33);
    fillWeekSelect($("#profWeekPicker"), 33);

    // load data
    loadTaxe();
    loadDrill();
    loadDashboard();
    loadFamiliesStats();
    loadAdmin();
    loadProfile();

    connectSSE();
  } catch {
    // not logged → show auth only
    $("#auth").classList.remove("hidden");
    // ascunde tot restul tab-urilor
    $$(".tabbtn").forEach(b => b.classList.add("hidden"));
    setTabs("taxe");
  }
}

$("#logoutBtn")?.addEventListener("click", () => {
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

$("#changePassForm")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const f = e.target;
  const r = await api("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ oldPassword: f.oldPass.value, newPassword: f.newPass.value })
  });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Nu am putut schimba parola");
  alert("Parola a fost schimbată.");
  f.reset();
});

// ===== Tabs =====
$$(".tabbtn").forEach(b => {
  b.addEventListener("click", async () => {
    setTabs(b.dataset.tab);
    if (b.dataset.tab === "taxe")      { loadTaxe(); loadDrill(); }
    if (b.dataset.tab === "dashboard") loadDashboard();
    if (b.dataset.tab === "families")  loadFamiliesStats();
    if (b.dataset.tab === "admin")     loadAdmin();
    if (b.dataset.tab === "profile")   loadProfile();
  });
});

// ===== SSE (live) =====
let es;
function connectSSE() {
  if (es) { try { es.close(); } catch {} }
  es = new EventSource("/events");
  es.addEventListener("taxe:new", () => { loadTaxe(); loadDashboard(); });
  es.addEventListener("drill:new", () => { loadDrill(); loadDashboard(); loadFamiliesStats(); });
  es.addEventListener("ping", () => {}); // keepalive
}

// ===== Taxe =====
const metodaSelect = $("#metodaSelect");
const gratisWrap    = $("#gratisWrap");

metodaSelect?.addEventListener("change", () => {
  const isGratis = metodaSelect.value === "gratis";
  if (isGratis) gratisWrap.style.display = "";
  else gratisWrap.style.display = "none";
});

$("#sendTaxBtn")?.addEventListener("click", async () => {
  if (CURRENT_ROLE === "AUDIT") return alert("AUDIT este read-only.");
  const cnp = ($("#taxeCnp")?.value||"").trim();
  if (!/^\d{1,6}$/.test(cnp)) return alert("CNP invalid (max 6).");
  const metoda = $("#metodaSelect")?.value || "curat";
  const body = { cnp, metoda };
  if (metoda === "gratis") body.gratisFamilie = $("#gratisFamilie")?.value;

  const r = await api("/taxe", { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Eroare la taxă");
  // reset
  $("#taxeCnp").value = "";
  metodaSelect.value = "curat";
  metodaSelect.dispatchEvent(new Event("change"));
  loadTaxe();
  loadDashboard();
});

// state + search
let taxeCache = [];
$("#taxSearch")?.addEventListener("input", () => renderTaxe(taxeCache));

async function loadTaxe() {
  if (!localStorage.token) return;
  const r = await api("/taxe");
  if (!r.ok) return;
  taxeCache = await r.json();
  renderTaxe(taxeCache);
}
function renderTaxe(list) {
  const q = ($("#taxSearch")?.value || "").trim().toLowerCase();
  const tbody = $("#taxeTable tbody");
  if (!tbody) return;
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
      tr.innerHTML = `
        <td class="mono">${row.cnp}</td>
        <td>${suma}</td>
        <td class="num">${row.remaining||""}</td>
        <td>${row.user || "-"}</td>
      `;
      tbody.appendChild(tr);
    });
}

// ===== Burghiu =====
$("#sendDrillBtn")?.addEventListener("click", async () => {
  if (CURRENT_ROLE === "AUDIT") return alert("AUDIT este read-only.");
  const cnp = ($("#drillCnp")?.value||"").trim();
  if (!/^\d{1,6}$/.test(cnp)) return alert("CNP invalid (max 6).");

  const body = {
    cnp,
    family: $("#drillFamily")?.value || null,
    cadru: Number($("#qtyCadru")?.value || 0),
    teava: Number($("#qtyTeava")?.value || 0),
    mecanism: Number($("#qtyMec")?.value || 0),
    fixare: Number($("#qtyFix")?.value || 0),
  };
  if ((body.cadru + body.teava + body.mecanism + body.fixare) <= 0)
    return alert("Introdu minim o cantitate > 0.");

  const r = await api("/drill", { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Eroare la burghiu");

  // reset
  $("#drillCnp").value = "";
  $("#drillFamily").selectedIndex = 0; // „Alege”
  $("#qtyCadru").value = "";
  $("#qtyTeava").value = "";
  $("#qtyMec").value = "";
  $("#qtyFix").value = "";

  loadDrill();
  loadDashboard();
  loadFamiliesStats();
});

let drillCache = [];
async function loadDrill() {
  if (!localStorage.token) return;
  const r = await api("/drill");
  if (!r.ok) return;
  drillCache = await r.json();
  renderDrill(drillCache);
}
function renderDrill(list){
  const tbody = $("#drillTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  (list || []).slice(0, 5).forEach(j => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${j.cnp}</td>
      <td>${j.family||"-"}</td>
      <td class="num">${j.cadru}</td>
      <td class="num">${j.teava}</td>
      <td class="num">${j.mecanism}</td>
      <td class="num">${j.fixare}</td>
      <td>${j.metodaPlata}</td>
      <td class="num">${money(j.costTotal || 0)}</td>
      <td>${j.user || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== Dashboard =====
$("#dashPeriodMode")?.addEventListener("change", ()=>{
  const mode = $("#dashPeriodMode").value;
  $("#dashWeekWrap").classList.toggle("hidden", mode==="all");
  loadDashboard();
});
$("#dashWeekPicker")?.addEventListener("change", loadDashboard);

async function loadDashboard() {
  if (!localStorage.token) return;

  const mode = $("#dashPeriodMode");
  const weekSel = $("#dashWeekPicker");
  const pr = readPeriod(mode, weekSel);
  const isWeek = pr.period !== "all";

  // 1) Taxe pe perioada
  let clean = 0, dirty = 0;
  const daily = Array.from({length:7}, (_,i)=>({ day: dayNames[i], count:0, clean:0, dirty:0 }));
  (taxeCache||[]).forEach(t => {
    const created = t.createdAt ? new Date(t.createdAt) : new Date();
    if (isWeek && !(pr.year && pr.week && inISOWeek(created, pr.year, pr.week))) return;

    if (t.tip === "Bani curați") { clean += 40000; }
    if (t.tip === "Bani murdari") { dirty += 60000; }
    if (t.tip === "GRATIS") { /* 0 */ }

    const wd = (created.getDay() + 6) % 7;
    const row = daily[wd];
    row.count += 1;
    if (t.tip === "Bani curați")  row.clean += 40000;
    if (t.tip === "Bani murdari") row.dirty += 60000;
  });

  // 2) Burghiu (murdar) pe perioada
  let totalPieces = 0;
  const cnpMapD = new Map(); // top drill după bani
  const rD = await api("/drill");
  let jobs = [];
  if (rD.ok) jobs = await rD.json();

  const jobsFilter = jobs.filter(j => {
    const dt = j.createdAt ? new Date(j.createdAt) : new Date();
    return !isWeek || (pr.year && pr.week && inISOWeek(dt, pr.year, pr.week));
  });

  jobsFilter.forEach(j=>{
    const pieces = j.cadru + j.teava + j.mecanism + j.fixare;
    totalPieces += pieces;
    // top drill pe CNP+user
    const key = `${j.cnp}::${j.user||""}`;
    const prev = cnpMapD.get(key) || { cnp:j.cnp, user:j.user||"", drill$:0 };
    prev.drill$ += (j.costTotal||0);
    cnpMapD.set(key, prev);
  });

  // banii murdari includ și burghiu
  const drillDirty = jobsFilter.reduce((s,j)=> s + (j.costTotal||0), 0);
  dirty += drillDirty;

  // set UI sums
  $("#statTaxClean")?.replaceChildren(document.createTextNode(money(clean)));
  $("#statTaxDirty")?.replaceChildren(document.createTextNode(money(dirty)));
  $("#statDrillPieces")?.replaceChildren(document.createTextNode((totalPieces||0).toLocaleString("ro-RO")));

  // Zile tabel
  const dBody = $("#dashDailyTable tbody");
  if (dBody){
    dBody.innerHTML = "";
    daily.forEach(d => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${d.day}</td><td class="num">${d.count}</td><td class="num">${money(d.clean)}</td><td class="num">${money(d.dirty)}</td>`;
      dBody.appendChild(tr);
    });
  }

  // Top CNP – Taxe (pe user) pe perioada
  const topTaxBody = $("#topCnpTaxe tbody");
  if (topTaxBody){
    const map = new Map();
    (taxeCache||[]).forEach(t=>{
      const created = t.createdAt ? new Date(t.createdAt) : new Date();
      if (isWeek && !(pr.year && pr.week && inISOWeek(created, pr.year, pr.week))) return;
      if (t.tip === "Bani curați" || t.tip === "Bani murdari") {
        const key = `${t.user||""}`;
        const prev = map.get(key) || { user:t.user||"", cnt:0 };
        prev.cnt += 1;
        map.set(key, prev);
      }
    });
    topTaxBody.innerHTML = "";
    [...map.values()]
      .sort((a,b)=>b.cnt-a.cnt)
      .slice(0,20)
      .forEach(row=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${row.user||"-"}</td><td class="num">${row.cnt}</td>`;
        topTaxBody.appendChild(tr);
      });
  }

  // Top CNP – Burghiu (după bani) pe perioada
  const topDrillBody = $("#topCnpDrill tbody");
  if (topDrillBody){
    topDrillBody.innerHTML = "";
    [...cnpMapD.values()]
      .sort((a,b)=>b.drill$-a.drill$)
      .slice(0,20)
      .forEach(row=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${row.user||"-"}</td><td class="mono">${row.cnp}</td><td class="num">${money(row.drill$||0)}</td>`;
        topDrillBody.appendChild(tr);
      });
  }
}

// ===== Statistici Familii =====
$("#famPeriodMode")?.addEventListener("change", ()=>{
  const mode = $("#famPeriodMode").value;
  $("#famWeekWrap").classList.toggle("hidden", mode==="all");
  loadFamiliesStats();
});
$("#famWeekPicker")?.addEventListener("change", loadFamiliesStats);
$("#familiesSearch")?.addEventListener("input", loadFamiliesStats);

async function loadFamiliesStats(){
  if (!localStorage.token) return;

  const mode = $("#famPeriodMode");
  const weekSel = $("#famWeekPicker");
  const pr = readPeriod(mode, weekSel);

  const params = new URLSearchParams();
  if (pr.period === "all") params.set("period","all");
  else { params.set("period","week"); if (pr.year) params.set("year", pr.year); if (pr.week) params.set("week", pr.week); }

  const q = ($("#familiesSearch")?.value || "").trim();
  if (q) params.set("q", q);

  const r = await api(`/admin/drill-families?${params.toString()}`);
  if (!r.ok) return;
  const rows = await r.json();

  const tbody = $("#drillFamiliesTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  rows.forEach(rw=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${rw.family}</td>
      <td class="num">${rw.cadru}</td>
      <td class="num">${rw.teava}</td>
      <td class="num">${rw.mecanism}</td>
      <td class="num">${rw.fixare}</td>
      <td class="num">${rw.total}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== Admin (All + Invite) =====
$("#adminPeriodMode")?.addEventListener("change", ()=>{
  const mode = $("#adminPeriodMode").value;
  $("#adminWeekWrap").classList.toggle("hidden", mode==="all");
  loadAdmin();
});
$("#adminWeekPicker")?.addEventListener("change", loadAdmin);

$("#inviteBtn")?.addEventListener("click", async () => {
  if (CURRENT_ROLE === "AUDIT") return alert("AUDIT read-only.");
  try {
    const role = $("#inviteRole")?.value || "OPERATOR";
    const r = await api("/invites", { method: "POST", body: JSON.stringify({ role }) });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "Nu s-a putut genera invitația");
    $("#inviteResult").value = j.link || j.code || "(fără link)";
  } catch (e) {
    alert("Eroare la generarea invitației");
  }
});
$("#inviteCopy")?.addEventListener("click", async () => {
  const v = $("#inviteResult")?.value || "";
  if (!v) return;
  try { await navigator.clipboard.writeText(v); alert("Copiat!"); }
  catch { alert("Nu am putut copia"); }
});

$("#adminType")?.addEventListener("change", loadAdmin);
$("#adminSearchUser")?.addEventListener("input", loadAdmin);
$("#adminSearchCnp")?.addEventListener("input", loadAdmin);
$("#adminSearchFamily")?.addEventListener("input", loadAdmin);

async function loadAdmin(){
  if (!localStorage.token) return;

  const mode = $("#adminPeriodMode");
  const weekSel = $("#adminWeekPicker");
  const pr = readPeriod(mode, weekSel);

  const params = new URLSearchParams();
  params.set("type", $("#adminType")?.value || "taxe");
  if (pr.period === "all") params.set("period","all");
  else { params.set("period","week"); if (pr.year) params.set("year", pr.year); if (pr.week) params.set("week", pr.week); }

  const su = ($("#adminSearchUser")?.value||"").trim();
  const sc = ($("#adminSearchCnp")?.value||"").trim();
  const sf = ($("#adminSearchFamily")?.value||"").trim();
  if (su) params.set("user", su);
  if (sc) params.set("cnp", sc);
  if (sf) params.set("family", sf);

  const r = await api(`/admin/all?${params.toString()}`);
  if (!r.ok) return;
  const rows = await r.json();

  const type = $("#adminType")?.value || "taxe";
  renderAdminTable(type, rows);
}
function renderAdminTable(type, rows){
  const tTax = $("#adminTaxTable");
  const tDrill = $("#adminDrillTable");
  if (!tTax || !tDrill) return;

  tTax.classList.toggle("hidden", type !== "taxe");
  tDrill.classList.toggle("hidden", type === "taxe");

  if (type === "taxe"){
    const tbody = $("#adminTaxTable tbody");
    tbody.innerHTML = "";
    (rows||[]).forEach(r=>{
      const tr = document.createElement("tr");
      const suma = r.payment==="Bani curați" ? "40.000$ curat" :
                   r.payment==="Bani murdari" ? "60.000$ murdar" :
                   r.payment==="GRATIS" ? "GRATIS" : money(r.amount||0);
      tr.innerHTML = `
        <td class="mono">${r.cnp}</td>
        <td>${r.payment||"-"}</td>
        <td class="num">${suma}</td>
        <td>${r.user||"-"}</td>
        <td>${r.family||"-"}</td>
        <td>${new Date(r.createdAt).toLocaleString("ro-RO")}</td>
        <td>
          <button class="btn danger btn-delete-tax" data-id="${r.id}" ${ (CURRENT_ROLE==="AUDIT") ? "disabled" : "" }>Șterge</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    // bind delete
    $$(".btn-delete-tax").forEach(b=>{
      b.addEventListener("click", async ()=>{
        if (CURRENT_ROLE==="AUDIT") return alert("AUDIT read-only.");
        const id = b.dataset.id;
        if (!confirm("Sigur ștergi această taxă?")) return;
        const r = await api(`/admin/taxe/${id}`, { method: "DELETE" });
        if (!r.ok) return alert("Nu am putut șterge.");
        loadAdmin();
        loadDashboard();
        loadTaxe();
      });
    });
  } else {
    const tbody = $("#adminDrillTable tbody");
    tbody.innerHTML = "";
    (rows||[]).forEach(r=>{
      const pieces = (r.cadru+r.teava+r.mecanism+r.fixare) || 0;
      tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${r.cnp}</td>
        <td class="num">${r.cadru}</td>
        <td class="num">${r.teava}</td>
        <td class="num">${r.mecanism}</td>
        <td class="num">${r.fixare}</td>
        <td>${r.user||"-"}</td>
        <td>${r.family||"-"}</td>
        <td>${new Date(r.createdAt).toLocaleString("ro-RO")}</td>
        <td>
          <button class="btn danger btn-delete-drill" data-id="${r.id}" ${ (CURRENT_ROLE==="AUDIT") ? "disabled" : "" }>Șterge</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    $$(".btn-delete-drill").forEach(b=>{
      b.addEventListener("click", async ()=>{
        if (CURRENT_ROLE==="AUDIT") return alert("AUDIT read-only.");
        const id = b.dataset.id;
        if (!confirm("Sigur ștergi acest job?")) return;
        const r = await api(`/admin/drill/${id}`, { method: "DELETE" });
        if (!r.ok) return alert("Nu am putut șterge.");
        loadAdmin();
        loadDashboard();
        loadDrill();
        loadFamiliesStats();
      });
    });
  }
}

// ===== My Profile =====
$("#profPeriodMode")?.addEventListener("change", ()=>{
  const mode = $("#profPeriodMode").value;
  $("#profWeekWrap").classList.toggle("hidden", mode==="all");
  loadProfile();
});
$("#profWeekPicker")?.addEventListener("change", loadProfile);

async function loadProfile(){
  if (!localStorage.token) return;

  const mode = $("#profPeriodMode");
  const weekSel = $("#profWeekPicker");
  const pr = readPeriod(mode, weekSel);

  const params = new URLSearchParams();
  if (pr.period === "all") params.set("period","all");
  else { params.set("period","week"); if (pr.year) params.set("year", pr.year); if (pr.week) params.set("week", pr.week); }

  const r = await api(`/me/profile?${params.toString()}`);
  if (!r.ok) return;
  const j = await r.json();

  // split
  $("#profCleanSum")?.replaceChildren(document.createTextNode(money(j.cleanSum||0)));
  $("#profDirtySum")?.replaceChildren(document.createTextNode(money(j.dirtySum||0)));
  $("#profPieces")?.replaceChildren(document.createTextNode((j.drill?.pieces||0).toLocaleString("ro-RO")));
  $("#profDrillMoney")?.replaceChildren(document.createTextNode(money(j.drill?.money||0)));

  $("#profUserShare")?.replaceChildren(document.createTextNode(money((j.split?.userShare)||0)));
  $("#profFamilyShare")?.replaceChildren(document.createTextNode(money((j.split?.familyShare)||0)));
  $("#profTotal")?.replaceChildren(document.createTextNode(money((j.split?.total)||0)));

  // daily table
  const tbody = $("#profDaily tbody");
  if (tbody){
    tbody.innerHTML = "";
    (j.daily||[]).forEach((d, i)=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${dayNames[i]}</td>
        <td class="num">${d.taxe}</td>
        <td class="num">${money(d.clean)}</td>
        <td class="num">${money(d.dirty)}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

// ===== Init =====
hydrateMe();
setTabs("taxe");
