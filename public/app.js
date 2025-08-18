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
const dayNames = ["Lun","Mar","Mie","Joi","Vin","Sâm","Dum"];

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
  const dow = simple.getUTCDay() || 7;
  const start = new Date(simple);
  start.setUTCDate(simple.getUTCDate() + (dow <= 4 ? 1 - dow : 8 - dow));
  return start;
}
function inISOWeek(d, year, week){
  const start = mondayOfISOWeek(year, week);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);
  return d >= start && d < end;
}

// ===== Auth / Roles =====
let ME = null;

async function hydrateMe() {
  try {
    const r = await api("/auth/me");
    if (!r.ok) throw 0;
    ME = await r.json();
    $("#whoami").textContent = `${ME.username} [${ME.role}]`;

    // Tabs by role
    const show = (tab, ok) => {
      const btn = $$(".tabbtn").find(b => b.dataset.tab === tab);
      if (btn) btn.classList.toggle("hidden", !ok);
    };
    const isAdmin  = ME.role === "ADMIN";
    const isAudit  = ME.role === "AUDIT";
    const isOper   = ME.role === "OPERATOR" || ME.role === "HEAD_OPERATOR";

    show("taxe", true);
    show("dashboard", true);
    show("drillfamilies", true);
    show("tables", isAdmin || isAudit);
    show("admin", isAdmin);
    show("profile", true);

    // Disable forms for AUDIT
    if (isAudit) {
      $("#taxeForm")?.querySelectorAll("input,select,button").forEach(el => el.disabled = true);
      $("#drillForm")?.querySelectorAll("input,select,button").forEach(el => el.disabled = true);
    }

    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");
    setTabs("taxe");

    // fill week selects (from week 33)
    ["dashWeekPicker","bfWeekPicker","weekSelect","tblWeekPicker","profWeekPicker"]
      .forEach(id => fillWeekSelectFrom33($("#" + id)));

    loadTaxe(); loadDrill(); connectSSE();
  } catch {
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
  es.addEventListener("taxe:new", () => { loadTaxe(); loadDashboard(); loadTables(); });
  es.addEventListener("drill:new", () => { loadDrill(); loadDashboard(); loadDrillFamilies(); loadTables(); });
  es.addEventListener("ping", () => {});
}

// ===== Populate weeks (from week 33 this year to current week) =====
function fillWeekSelectFrom33(sel){
  if (!sel) return;
  sel.innerHTML = "";
  const now = new Date();
  const {year, week} = isoYearWeek(now);
  const currentWeek = week;
  const startWeek = 33;

  for (let w = currentWeek; w >= startWeek; w--){
    const opt = document.createElement("option");
    opt.value = JSON.stringify({year, week:w});
    opt.textContent = `${year}-W${String(w).padStart(2,"0")}`;
    sel.appendChild(opt);
  }
  // dacă e înainte de W33 (anul curent), adaugă și W52..W33 anul trecut
  if (currentWeek < startWeek) {
    for (let w = 52; w >= startWeek; w--){
      const opt = document.createElement("option");
      opt.value = JSON.stringify({year:year-1, week:w});
      opt.textContent = `${year-1}-W${String(w).padStart(2,"0")}`;
      sel.appendChild(opt);
    }
  }
}

// ===== Taxe =====
const metodaSelect = $("#metodaSelect");
const gratisWrap    = $("#gratisWrap");

metodaSelect?.addEventListener("change", () => {
  const isGratis = metodaSelect.value === "gratis";
  if (gratisWrap) gratisWrap.classList.toggle("hidden", !isGratis);
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
  loadTaxe(); loadDashboard(); loadTables();
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
        suma = "40.000$ Bani curați";
      } else if (row.tip === "Bani murdari") {
        suma = "60.000$ Bani murdari";
      }
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="font-mono left">${row.cnp}</td>
        <td>${suma}</td>
        <td>${row.remaining||""}</td>
        <td class="left">${row.user||"-"}</td>
      `;
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
  loadDrill(); loadDashboard(); loadDrillFamilies(); loadTables();
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
  (list || []).slice(0,5).forEach(j => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="left font-mono">${j.cnp}</td>
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

// ===== Dashboard =====
$("#dashPeriod")?.addEventListener("change", loadDashboard);
$("#dashWeekPicker")?.addEventListener("change", loadDashboard);

async function loadDashboard() {
  const period = $("#dashPeriod")?.value || "week";
  $("#dashWeekPicker").classList.toggle("hidden", period !== "week");

  // Week selection
  let selYear, selWeek;
  if (period === "week") {
    try { ({year:selYear,week:selWeek} = JSON.parse($("#dashWeekPicker").value)); } catch {}
  }

  // stats init
  let clean = 0, dirty = 0;
  const daily = Array.from({length:7}, (_,i)=>({ day: dayNames[i], count:0, clean:0, dirty:0 }));

  // taxe
  const rT = await api("/taxe");
  const taxe = rT.ok ? await rT.json() : [];
  taxe.forEach(t => {
    const created = t.createdAt ? new Date(t.createdAt) : new Date();
    if (period === "week" && !(selYear && selWeek && inISOWeek(created, selYear, selWeek))) return;
    if (t.tip === "Bani curați")  clean += 40000;
    if (t.tip === "Bani murdari") dirty += 60000;
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

  // drill families + top users
  const rD = await api("/drill");
  const jobs = rD.ok ? await rD.json() : [];
  const famAgg = new Map();
  let totalPieces = 0;

  jobs.forEach(j=>{
    const dt = j.createdAt ? new Date(j.createdAt) : new Date();
    if (period === "week" && !(selYear && selWeek && inISOWeek(dt, selYear, selWeek))) return;
    const fam = j.family || "(?)";
    const row = famAgg.get(fam) || {cadru:0,teava:0,mecanism:0,fixare:0};
    row.cadru += j.cadru; row.teava += j.teava; row.mecanism += j.mecanism; row.fixare += j.fixare;
    famAgg.set(fam,row);
    totalPieces += j.cadru + j.teava + j.mecanism + j.fixare;
  });
  $("#statDrillPieces").textContent = (totalPieces||0).toLocaleString("ro-RO");

  const famBody = $("#drillFamiliesTable tbody");
  famBody.innerHTML = "";
  [...famAgg.entries()]
    .map(([fam,vals]) => ({fam, total: vals.cadru+vals.teava+vals.mecanism+vals.fixare, ...vals}))
    .sort((a,b)=>b.total-a.total)
    .forEach(x=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="left">${x.fam}</td><td>${x.cadru}</td><td>${x.teava}</td><td>${x.mecanism}</td><td>${x.fixare}</td><td>${x.total}</td>`;
      famBody.appendChild(tr);
    });

  // top users taxe & drill (pe săptămâna selectată)
  const topTaxBody = $("#topCnpTaxe tbody");
  topTaxBody.innerHTML = "";
  const taxUsers = new Map();
  taxe.forEach(t=>{
    const dt = t.createdAt ? new Date(t.createdAt) : new Date();
    if (period === "week" && !(selYear && selWeek && inISOWeek(dt, selYear, selWeek))) return;
    if (t.tip === "Bani curați" || t.tip === "Bani murdari"){
      const u = t.user || "(?)";
      taxUsers.set(u, (taxUsers.get(u)||0) + 1);
    }
  });
  [...taxUsers.entries()].sort((a,b)=>b[1]-a[1]).forEach(([u,c])=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${u}</td><td>${c}</td>`;
    topTaxBody.appendChild(tr);
  });

  const topDrillBody = $("#topCnpDrill tbody");
  topDrillBody.innerHTML = "";
  const drillUsers = new Map();
  jobs.forEach(j=>{
    const dt = j.createdAt ? new Date(j.createdAt) : new Date();
    if (period === "week" && !(selYear && selWeek && inISOWeek(dt, selYear, selWeek))) return;
    const u = j.user || "(?)";
    drillUsers.set(u, (drillUsers.get(u)||0) + (j.costTotal||0));
  });
  [...drillUsers.entries()].sort((a,b)=>b[1]-a[1]).forEach(([u,v])=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${u}</td><td>${money(v)}</td>`;
    topDrillBody.appendChild(tr);
  });

  // fam search (client filtering)
  $("#famSearch")?.addEventListener("input", (e)=>{
    const q = (e.target.value||"").toLowerCase();
    [...$("#drillFamiliesTable tbody").children].forEach(tr=>{
      const show = tr.firstElementChild.textContent.toLowerCase().includes(q);
      tr.style.display = show ? "" : "none";
    });
  }, { once:true });
}

// ===== Statistici Familii tab =====
$("#bfPeriod")?.addEventListener("change", loadDrillFamilies);
$("#bfWeekPicker")?.addEventListener("change", loadDrillFamilies);
$("#bfSearch")?.addEventListener("input", ()=>{
  const q = ($("#bfSearch").value||"").toLowerCase();
  [...$("#bfTable tbody").children].forEach(tr=>{
    const show = tr.firstElementChild.textContent.toLowerCase().includes(q);
    tr.style.display = show ? "" : "none";
  });
});

async function loadDrillFamilies(){
  const period = $("#bfPeriod")?.value || "week";
  $("#bfWeekPicker").classList.toggle("hidden", period !== "week");
  let selYear, selWeek;
  if (period === "week") {
    try { ({year:selYear,week:selWeek} = JSON.parse($("#bfWeekPicker").value)); } catch {}
  }

  const rD = await api("/drill");
  const jobs = rD.ok ? await rD.json() : [];
  const famAgg = new Map();
  jobs.forEach(j=>{
    const dt = j.createdAt ? new Date(j.createdAt) : new Date();
    if (period === "week" && !(selYear && selWeek && inISOWeek(dt, selYear, selWeek))) return;
    const fam = j.family || "(?)";
    const row = famAgg.get(fam) || {cadru:0,teava:0,mecanism:0,fixare:0};
    row.cadru += j.cadru; row.teava += j.teava; row.mecanism += j.mecanism; row.fixare += j.fixare;
    famAgg.set(fam,row);
  });

  const tbody = $("#bfTable tbody");
  tbody.innerHTML = "";
  [...famAgg.entries()]
    .map(([fam,vals]) => ({fam, total: vals.cadru+vals.teava+vals.mecanism+vals.fixare, ...vals}))
    .sort((a,b)=>b.total-a.total)
    .forEach(x=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="left">${x.fam}</td><td>${x.cadru}</td><td>${x.teava}</td><td>${x.mecanism}</td><td>${x.fixare}</td><td>${x.total}</td>`;
      tbody.appendChild(tr);
    });
}

// ===== Admin =====
$("#admPeriod")?.addEventListener("change", loadAdmin);
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
  try { await navigator.clipboard.writeText(v); alert("Copiat!"); } catch { alert("Nu am putut copia"); }
});

async function loadAdmin(){
  const period = $("#admPeriod")?.value || "week";
  $("#weekSelect").classList.toggle("hidden", period !== "week");
  let url = "/admin/stats";
  if (period === "week"){
    try {
      const {year, week} = JSON.parse($("#weekSelect").value);
      url = `/admin/stats?year=${year}&week=${week}`;
    } catch {}
  }

  const r = await api(url);
  const tbody = $("#admTable tbody");
  if (r.status === 403) {
    tbody.innerHTML = `<tr><td colspan="8" class="left" style="color:#9fb3c8">Doar ADMIN are acces.</td></tr>`;
    return;
  }
  const list = await r.json();
  tbody.innerHTML = "";

  (list||[]).sort((a,b)=> (b.total||0)-(a.total||0)).forEach(u=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="left">${u.username}</td>
      <td>${money(u.userClean||0)}</td>
      <td>${money(u.userDirty||0)}</td>
      <td>${money(u.familyClean||0)}</td>
      <td>${money(u.familyDirty||0)}</td>
      <td>${money(u.totalClean||0)}</td>
      <td>${money(u.totalDirty||0)}</td>
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
$("#tblFilterUser")?.addEventListener("input", loadTables);
$("#tblFilterCnp")?.addEventListener("input", loadTables);
$("#tblFilterFamily")?.addEventListener("input", loadTables);

async function loadTables(){
  const period = $("#tblPeriod")?.value || "week";
  $("#tblWeekPicker").classList.toggle("hidden", period !== "week");
  let selYear, selWeek;
  if (period === "week"){
    try { ({year:selYear,week:selWeek} = JSON.parse($("#tblWeekPicker").value)); } catch {}
  }
  const type = $("#tblType").value;

  const rT = await api("/taxe");
  const rD = await api("/drill");
  const taxe = rT.ok ? await rT.json() : [];
  const jobs = rD.ok ? await rD.json() : [];

  const head = $("#tblHead");
  const body = $("#tblAll tbody");
  head.innerHTML = ""; body.innerHTML = "";

  if (type === "taxe"){
    head.innerHTML = `<tr><th class="left">CNP</th><th>Sumă</th><th>Timp</th><th class="left">User</th></tr>`;
    taxe
      .filter(t=>{
        const dt = t.createdAt ? new Date(t.createdAt) : new Date();
        if (period === "week" && !(selYear && selWeek && inISOWeek(dt, selYear, selWeek))) return false;
        const okU = !$("#tblFilterUser").value || (t.user||"").toLowerCase().includes($("#tblFilterUser").value.toLowerCase());
        const okC = !$("#tblFilterCnp").value  || String(t.cnp).toLowerCase().includes($("#tblFilterCnp").value.toLowerCase());
        return okU && okC;
      })
      .forEach(t=>{
        const tr = document.createElement("tr");
        const suma = t.tip==="GRATIS"? "GRATIS" : (t.tip==="Bani curați" ? "40.000$ Bani curați" : "60.000$ Bani murdari");
        tr.innerHTML = `<td class="left font-mono">${t.cnp}</td><td>${suma}</td><td>${t.remaining||""}</td><td class="left">${t.user||"-"}</td>`;
        body.appendChild(tr);
      });

  } else {
    head.innerHTML = `<tr>
      <th class="left">CNP</th><th class="left">Familie</th>
      <th>Cadru</th><th>Țeavă</th><th>Mecanism</th><th>Fixare</th>
      <th>Metodă plată</th><th>Cost total</th><th class="left">User</th>
    </tr>`;

    jobs
      .filter(j=>{
        const dt = j.createdAt ? new Date(j.createdAt) : new Date();
        if (period === "week" && !(selYear && selWeek && inISOWeek(dt, selYear, selWeek))) return false;
        const okU = !$("#tblFilterUser").value   || (j.user||"").toLowerCase().includes($("#tblFilterUser").value.toLowerCase());
        const okC = !$("#tblFilterCnp").value    || String(j.cnp).toLowerCase().includes($("#tblFilterCnp").value.toLowerCase());
        const okF = !$("#tblFilterFamily").value || String(j.family||"").toLowerCase().includes($("#tblFilterFamily").value.toLowerCase());
        return okU && okC && okF;
      })
      .forEach(j=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="left font-mono">${j.cnp}</td>
          <td class="left">${j.family||"-"}</td>
          <td>${j.cadru}</td><td>${j.teava}</td><td>${j.mecanism}</td><td>${j.fixare}</td>
          <td>Bani murdari</td>
          <td>${money(j.costTotal||0)}</td>
          <td class="left">${j.user||"-"}</td>
        `;
        body.appendChild(tr);
      });
  }
}

// ===== My profile =====
$("#profPeriod")?.addEventListener("change", loadProfile);
$("#profWeekPicker")?.addEventListener("change", loadProfile);

async function loadProfile(){
  const period = $("#profPeriod")?.value || "week";
  $("#profWeekPicker").classList.toggle("hidden", period !== "week");
  let selYear, selWeek;
  if (period === "week"){
    try { ({year:selYear,week:selWeek} = JSON.parse($("#profWeekPicker").value)); } catch {}
  }

  const [tRes, dRes] = await Promise.all([api("/taxe"), api("/drill")]);
  const taxe = tRes.ok ? await tRes.json() : [];
  const jobs = dRes.ok ? await dRes.json() : [];

  const myTaxe = taxe.filter(t => t.user === (ME?.username||""));
  const myJobs = jobs.filter(j => j.user === (ME?.username||""));

  // filters
  const filtTaxe = myTaxe.filter(t=>{
    const dt = t.createdAt ? new Date(t.createdAt) : new Date();
    return period === "all" || (selYear && selWeek && inISOWeek(dt, selYear, selWeek));
  });
  const filtJobs = myJobs.filter(j=>{
    const dt = j.createdAt ? new Date(j.createdAt) : new Date();
    return period === "all" || (selYear && selWeek && inISOWeek(dt, selYear, selWeek));
  });

  // sums
  let clean = 0, dirty = 0;
  const daily = Array.from({length:7}, (_,i)=>({ day: dayNames[i], count:0, clean:0, dirty:0 }));

  filtTaxe.forEach(t=>{
    const dt = t.createdAt ? new Date(t.createdAt) : new Date();
    if (t.tip === "Bani curați")  clean += 40000;
    if (t.tip === "Bani murdari") dirty += 60000;
    const wd = (dt.getDay()+6)%7;
    const row = daily[wd];
    row.count += 1;
    if (t.tip === "Bani curați")  row.clean += 40000;
    if (t.tip === "Bani murdari") row.dirty += 60000;
  });

  let pieces = 0, drillMoney = 0;
  filtJobs.forEach(j=>{
    pieces += j.cadru + j.teava + j.mecanism + j.fixare;
    drillMoney += (j.costTotal || 0); // bani murdari
  });

  $("#profClean").textContent = money(clean);
  $("#profDirty").textContent = money(dirty + drillMoney);
  $("#profPieces").textContent = (pieces||0);
  $("#profDrillMoney").textContent = money(drillMoney);

  const body = $("#profDailyTable tbody");
  body.innerHTML = "";
  daily.forEach(d=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${d.day}</td><td>${d.count}</td><td>${money(d.clean)}</td><td>${money(d.dirty)}</td>`;
    body.appendChild(tr);
  });

  // split 50/50
  const userClean  = clean/2;
  const famClean   = clean/2;
  const userDirty  = (dirty + drillMoney)/2;
  const famDirty   = (dirty + drillMoney)/2;

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

// show GRATIS families on load if needed
if (metodaSelect) metodaSelect.dispatchEvent(new Event("change"));
