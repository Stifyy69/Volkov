// ====================== Helpers / Core ======================
const authMain = document.getElementById("auth");
const appMain  = document.getElementById("app");

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const money = (n=0) => `${(n||0).toLocaleString("ro-RO")} $`;

function showApp()  { authMain.classList.add("hidden"); appMain.classList.remove("hidden"); }
function showAuth() { appMain.classList.add("hidden");  authMain.classList.remove("hidden"); }

function setTabs(active) {
  $$(".tabbtn").forEach(b => b.dataset.active = (b.dataset.tab === active));
  $$(".tab").forEach(sec => sec.id === `tab-${active}` ? sec.classList.remove("hidden")
                                                      : sec.classList.add("hidden"));
}

function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
      ...(localStorage.token ? { Authorization: "Bearer " + localStorage.token } : {})
    }
  });
}

// ISO week helpers
const dayNames = ["Lun","Mar","Mie","Joi","Vin","Sâm","Dum"];
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
  if (!year || !week) return true;
  const start = mondayOfISOWeek(year, week);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 7);
  return d >= start && d < end;
}
function fillWeekSelect(sel){
  if (!sel) return;
  sel.innerHTML = "";
  const now = new Date();
  // începând de la săpt. 33 cum ai cerut
  const {year:curY, week:curW} = isoYearWeek(now);
  let y = curY, w = curW;
  const push = (Y,W) => {
    const key = `${Y}-W${String(W).padStart(2,"0")}`;
    const opt = document.createElement("option");
    opt.value = JSON.stringify({year:Y, week:W});
    opt.textContent = key;
    sel.appendChild(opt);
  };
  for (let i=0;i<60;i++){
    push(y,w);
    w--; if (w<=0){ y--; w = 52; }
    if (y===curY && w<33) break; // oprește la W33
  }
}

// ====================== Auth / Roles ======================
let CURRENT_USER = null;

function setReadOnlyMode(isReadOnly){
  // dezactivează toate formularele de input / submit (dar nu filtrele)
  const forms = ["taxeForm","drillForm","resetForm"];
  forms.forEach(id=>{
    const f = document.getElementById(id);
    if (!f) return;
    $$("input,select,button[type=submit]", f).forEach(el=>{
      if (isReadOnly) el.disabled = true;
      else el.disabled = false;
    });
  });
}

async function hydrateMe() {
  try {
    const r = await api("/auth/me");
    if (!r.ok) throw 0;

    CURRENT_USER = await r.json();
    $("#whoami").textContent = `${CURRENT_USER.username} [${CURRENT_USER.role}]`;

    // vizibilitate tab-uri:
    const isAdmin = CURRENT_USER.role === "ADMIN";
    const isAudit = CURRENT_USER.role === "AUDIT";
    const isOperator = CURRENT_USER.role === "OPERATOR";

    // Operator: Taxe & Burghiu + My profile
    $('.tabbtn[data-tab="dashboard"]').classList.toggle("hidden", false);
    $('.tabbtn[data-tab="drillfamilies"]').classList.toggle("hidden", false);
    $('.tabbtn[data-tab="admin"]').classList.toggle("hidden", !isAdmin);
    $('.tabbtn[data-tab="tables"]').classList.toggle("hidden", !isAdmin);
    $('.tabbtn[data-tab="profile"]').classList.toggle("hidden", false);

    // Audit: vede tot dar read-only
    setReadOnlyMode(isAudit);

    showApp();
    setTabs("taxe");

    // populate week selects
    ["dashWeekPicker","bfWeekPicker","weekSelect","tblWeekPicker","profWeekPicker"]
      .forEach(id => fillWeekSelect(document.getElementById(id)));

    // primele încărcări
    await Promise.all([loadTaxe(), loadDrill(), loadDashboard(), loadDrillFamilies()]);
    connectSSE();
  } catch {
    CURRENT_USER = null;
    showAuth();
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

// Tabs click
$$(".tabbtn").forEach(b => {
  b.addEventListener("click", () => {
    setTabs(b.dataset.tab);
    if (b.dataset.tab === "taxe") { loadTaxe(); loadDrill(); }
    if (b.dataset.tab === "dashboard") loadDashboard();
    if (b.dataset.tab === "drillfamilies") loadDrillFamilies();
    if (b.dataset.tab === "admin") loadAdmin();
    if (b.dataset.tab === "tables") loadTables();
    if (b.dataset.tab === "profile") loadProfile();
  });
});

// ====================== SSE Live ======================
let es;
function connectSSE() {
  try { if (es) es.close(); } catch {}
  es = new EventSource("/events");
  es.addEventListener("taxe:new", () => { loadTaxe(); loadDashboard(); loadTables(true); });
  es.addEventListener("drill:new", () => { loadDrill(); loadDashboard(); loadDrillFamilies(); loadTables(true); });
  es.addEventListener("ping", () => {});
}

// ====================== Taxe ======================
const metodaSelect = $("#metodaSelect");
const gratisWrap    = $("#gratisWrap");

metodaSelect?.addEventListener("change", () => {
  const isGratis = metodaSelect.value === "gratis";
  if (gratisWrap) gratisWrap.classList.toggle("hidden", !isGratis);
});

let taxeCache = [];
$("#taxeForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (CURRENT_USER?.role === "AUDIT") return; // read-only
  const f = e.target;
  const cnp = (f.cnp.value||"").trim();
  if (!/^\d{1,6}$/.test(cnp)) return alert("CNP invalid (max 6).");
  if (!f.metoda.value) return alert("Alege tipul de plată.");

  const body = { cnp, metoda: f.metoda.value };
  if (f.metoda.value === "gratis") body.gratisFamilie = f.gratisFamilie.value;

  const r = await api("/taxe", { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Eroare la taxă");
  f.reset(); metodaSelect.dispatchEvent(new Event("change"));
  loadTaxe(); // SSE oricum va veni; păstrăm ca fallback
});

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
      else if (row.tip === "Bani curați")  suma = "40.000$ Bani curați";
      else if (row.tip === "Bani murdari") suma = "60.000$ Bani murdari";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono left">${row.cnp}</td>
        <td class="num">${suma}</td>
        <td class="num">${row.remaining||""}</td>
        <td class="left">${row.user || "-"}</td>
      `;
      tbody.appendChild(tr);
    });
}

// ====================== Burghiu ======================
let drillCache = [];

$("#drillForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (CURRENT_USER?.role === "AUDIT") return; // read-only
  const f = e.target;
  const cnp = (f.cnp.value||"").trim();
  if (!/^\d{1,6}$/.test(cnp)) return alert("CNP invalid (max 6).");

  // coalesce pe o singură linie: trimitem componentele >0 una câte una
  const parts = [
    { key:"cadru",    v: Number(f.cadru.value||0) },
    { key:"teava",    v: Number(f.teava.value||0) },
    { key:"mecanism", v: Number(f.mecanism.value||0) },
    { key:"fixare",   v: Number(f.fixare.value||0) },
  ].filter(p => p.v > 0);

  if (parts.length === 0) return alert("Introdu minim o cantitate (>0).");

  for (const p of parts) {
    const body = {
      cnp, part: p.key, quantity: p.v,
      family: (f.family.value || null)
    };
    const r = await api("/drill", { method:"POST", body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return alert(j.error || `Eroare la ${p.key}`);
  }

  f.reset();
  loadDrill();
  loadDashboard();
});

async function loadDrill() {
  const r = await api("/drill");
  if (!r.ok) return;
  let list = await r.json();
  // ultimele 5 tranzacții
  list = list.slice(0, 5);
  drillCache = list;

  const tbody = $("#drillTable tbody");
  tbody.innerHTML = "";
  (list||[]).forEach(j => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono left">${j.cnp}</td>
      <td class="left">${j.family||"-"}</td>
      <td class="num">${j.cadru}</td>
      <td class="num">${j.teava}</td>
      <td class="num">${j.mecanism}</td>
      <td class="num">${j.fixare}</td>
      <td class="num">Bani murdari</td>
      <td class="num">${money(j.costTotal||0)}</td>
      <td class="left">${j.user || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ====================== Dashboard ======================
$("#dashPeriod")?.addEventListener("change", () => {
  const mode = $("#dashPeriod").value;
  $("#dashWeekPicker").classList.toggle("hidden", mode !== "week");
  loadDashboard();
});
$("#dashWeekPicker")?.addEventListener("change", loadDashboard);

async function loadDashboard() {
  const mode = $("#dashPeriod")?.value || "week";
  let selYear, selWeek;
  if (mode === "week") {
    try { ({year:selYear,week:selWeek} = JSON.parse($("#dashWeekPicker").value)); } catch {}
  }

  // 1) Taxe – pe zile (număr + bani curați/murdari)
  const rT = await api("/taxe");
  const daily = Array.from({length:7}, (_,i)=>({ day: dayNames[i], count:0, clean:0, dirty:0 }));
  let clean = 0, dirty = 0;
  if (rT.ok) {
    const rows = await rT.json();
    rows.forEach(t=>{
      const created = t.createdAt ? new Date(t.createdAt) : new Date();
      if (!inISOWeek(created, selYear, selWeek)) return;
      const wd = (created.getDay()+6)%7;
      daily[wd].count += 1;
      if (t.tip === "Bani curați")  { daily[wd].clean += 40000; clean += 40000; }
      if (t.tip === "Bani murdari"){ daily[wd].dirty += 60000; dirty += 60000; }
    });
  }
  $("#statTaxClean").textContent = money(clean);
  $("#statTaxDirty").textContent = money(dirty);

  const dBody = $("#dashDailyTable tbody"); dBody.innerHTML="";
  daily.forEach(d=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${d.day}</td><td class="num">${d.count}</td><td class="num">${money(d.clean)}</td><td class="num">${money(d.dirty)}</td>`;
    dBody.appendChild(tr);
  });

  // 2) Familii – Burghiu (pe componente)
  const rD = await api("/drill");
  const famAgg = new Map(); // fam => { cadru, teava, mecanism, fixare, total }
  const topTaxMap = new Map(); // user => nr taxe (pe săptămână)
  const topDrillMap = new Map(); // user => sum drill $

  if (rD.ok) {
    const jobs = await rD.json();
    jobs.forEach(j=>{
      const dt = j.createdAt ? new Date(j.createdAt) : new Date();
      if (!inISOWeek(dt, selYear, selWeek)) return;
      const fam = j.family || "(fără)";
      const obj = famAgg.get(fam) || {cadru:0,teava:0,mecanism:0,fixare:0,total:0};
      obj.cadru += j.cadru||0;
      obj.teava += j.teava||0;
      obj.mecanism += j.mecanism||0;
      obj.fixare += j.fixare||0;
      obj.total = obj.cadru+obj.teava+obj.mecanism+obj.fixare;
      famAgg.set(fam,obj);

      const usr = j.user || "-";
      const dPrev = topDrillMap.get(usr)||0;
      topDrillMap.set(usr, dPrev + (j.costTotal||0));
    });
  }

  // Top useri taxe (pe săptămâna selectată)
  (taxeCache||[]).forEach(t=>{
    const created = t.createdAt ? new Date(t.createdAt) : new Date();
    if (!inISOWeek(created, selYear, selWeek)) return;
    if (t.tip === "Bani curați" || t.tip === "Bani murdari") {
      const usr = t.user || "-";
      topTaxMap.set(usr, (topTaxMap.get(usr)||0) + 1);
    }
  });

  const famBody = $("#drillFamiliesTable tbody"); famBody.innerHTML="";
  [...famAgg.entries()].sort((a,b)=>b[1].total - a[1].total).forEach(([fam,v])=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${fam}</td><td class="num">${v.cadru}</td><td class="num">${v.teava}</td><td class="num">${v.mecanism}</td><td class="num">${v.fixare}</td><td class="num">${v.total}</td>`;
    famBody.appendChild(tr);
  });

  const topTaxBody = $("#topCnpTaxe tbody"); topTaxBody.innerHTML="";
  [...topTaxMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([user,cnt])=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${user}</td><td class="num">${cnt}</td>`;
    topTaxBody.appendChild(tr);
  });

  const topDrillBody = $("#topCnpDrill tbody"); topDrillBody.innerHTML="";
  [...topDrillMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([user,sum])=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${user}</td><td class="num">${money(sum)}</td>`;
    topDrillBody.appendChild(tr);
  });
}

// ====================== Statistici Familii (tab separat) ======================
$("#bfPeriod")?.addEventListener("change", () => {
  $("#bfWeekPicker").classList.toggle("hidden", $("#bfPeriod").value !== "week");
  loadDrillFamilies();
});
$("#bfWeekPicker")?.addEventListener("change", loadDrillFamilies);
$("#bfSearch")?.addEventListener("input", loadDrillFamilies);

async function loadDrillFamilies(){
  const mode = $("#bfPeriod")?.value || "week";
  let selYear, selWeek;
  if (mode === "week") {
    try { ({year:selYear,week:selWeek} = JSON.parse($("#bfWeekPicker").value)); } catch {}
  }
  const r = await api("/drill");
  const tbody = $("#bfTable tbody");
  tbody.innerHTML = "";
  if (!r.ok) return;

  const q = ($("#bfSearch")?.value||"").toLowerCase();

  const agg = new Map();
  (await r.json()).forEach(j=>{
    const dt = j.createdAt ? new Date(j.createdAt) : new Date();
    if (mode==="week" && !inISOWeek(dt, selYear, selWeek)) return;
    const fam = j.family || "(fără)";
    const v = agg.get(fam) || {cadru:0, teava:0, mecanism:0, fixare:0, total:0};
    v.cadru += j.cadru||0;
    v.teava += j.teava||0;
    v.mecanism += j.mecanism||0;
    v.fixare += j.fixare||0;
    v.total = v.cadru+v.teava+v.mecanism+v.fixare;
    agg.set(fam, v);
  });

  [...agg.entries()]
    .filter(([fam]) => !q || fam.toLowerCase().includes(q))
    .sort((a,b)=>b[1].total - a[1].total)
    .forEach(([fam,v])=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="left">${fam}</td><td class="num">${v.cadru}</td><td class="num">${v.teava}</td><td class="num">${v.mecanism}</td><td class="num">${v.fixare}</td><td class="num">${v.total}</td>`;
      tbody.appendChild(tr);
    });
}

// ====================== Admin ======================
$("#inviteBtn")?.addEventListener("click", async ()=>{
  if (CURRENT_USER?.role !== "ADMIN") return;
  const role = $("#inviteRole").value;
  const r = await api("/invites", { method:"POST", body: JSON.stringify({ role }) });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Nu s-a putut genera invitația");
  $("#inviteResult").value = j.link || j.code || "(fără link)";
});
$("#inviteCopy")?.addEventListener("click", async ()=>{
  const v = $("#inviteResult").value || "";
  if (!v) return;
  try { await navigator.clipboard.writeText(v); } catch {}
});

$("#admPeriod")?.addEventListener("change", ()=>{
  $("#weekSelect").classList.toggle("hidden", $("#admPeriod").value!=="week");
  loadAdmin();
});
$("#weekSelect")?.addEventListener("change", loadAdmin);

async function loadAdmin(){
  if (!CURRENT_USER || CURRENT_USER.role !== "ADMIN") {
    $("#admTable tbody").innerHTML = `<tr><td colspan="8" class="left">Doar ADMIN are acces.</td></tr>`;
    return;
  }
  let url = "/admin/stats";
  if ($("#admPeriod").value==="week") {
    try {
      const {year, week} = JSON.parse($("#weekSelect").value);
      url = `/admin/stats?year=${year}&week=${week}`;
    } catch {}
  }
  const r = await api(url);
  if (!r.ok) {
    $("#admTable tbody").innerHTML = `<tr><td colspan="8" class="left">Fără date.</td></tr>`;
    return;
  }
  const list = await r.json();
  const tbody = $("#admTable tbody"); tbody.innerHTML = "";
  (list||[]).sort((a,b)=> (b.total||0)-(a.total||0)).forEach(u=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="left">${u.username}</td>
      <td class="num">${money(u.userClean||0)}</td>
      <td class="num">${money(u.userDirty||0)}</td>
      <td class="num">${money(u.familyClean||0)}</td>
      <td class="num">${money(u.familyDirty||0)}</td>
      <td class="num">${money((u.userClean||0)+(u.familyClean||0))}</td>
      <td class="num">${money((u.userDirty||0)+(u.familyDirty||0))}</td>
      <td class="num">${money(u.total||0)}</td>`;
    tbody.appendChild(tr);
  });
}

// ====================== Tabele All ======================
$("#tblPeriod")?.addEventListener("change", ()=>{
  $("#tblWeekPicker").classList.toggle("hidden", $("#tblPeriod").value!=="week");
  loadTables();
});
$("#tblWeekPicker")?.addEventListener("change", loadTables);
$("#tblRefresh")?.addEventListener("click", loadTables);
["#tblFilterUser","#tblFilterCnp","#tblFilterFamily"].forEach(sel=>{
  $(sel)?.addEventListener("input", ()=>loadTables(true));
});

async function loadTables(keepHead=false){
  if (!CURRENT_USER || CURRENT_USER.role !== "ADMIN") {
    $("#tblHead").innerHTML = ""; $("#tblAll tbody").innerHTML = "";
    return;
  }
  const type = $("#tblType").value;
  const mode = $("#tblPeriod").value;
  let selYear, selWeek;
  if (mode==="week") {
    try { ({year:selYear,week:selWeek} = JSON.parse($("#tblWeekPicker").value)); } catch {}
  }
  const fUser = $("#tblFilterUser").value.toLowerCase();
  const fCnp  = $("#tblFilterCnp").value.toLowerCase();
  const fFam  = $("#tblFilterFamily").value.toLowerCase();

  const head = $("#tblHead");
  const body = $("#tblAll tbody"); body.innerHTML="";

  if (!keepHead) {
    if (type==="taxe") {
      head.innerHTML = `<tr>
        <th class="left">CNP</th><th>Sumă</th><th>Metodă</th><th class="left">User</th><th class="left">Familie</th><th>Creat</th>
      </tr>`;
    } else {
      head.innerHTML = `<tr>
        <th class="left">CNP</th><th class="left">Familie</th>
        <th>Cadru</th><th>Țeavă</th><th>Mecanism</th><th>Fixare</th>
        <th>Cost (Bani murdari)</th><th class="left">User</th><th>Creat</th>
      </tr>`;
    }
  }

  if (type==="taxe") {
    const r = await api("/taxe");
    if (!r.ok) return;
    const list = await r.json();
    list
      .filter(row => {
        const dt = row.createdAt ? new Date(row.createdAt) : new Date();
        if (mode==="week" && !inISOWeek(dt, selYear, selWeek)) return false;
        if (fUser && !(row.user||"").toLowerCase().includes(fUser)) return false;
        if (fCnp  && !String(row.cnp).toLowerCase().includes(fCnp)) return false;
        if (fFam  && !(row.gratisFamilie||"").toLowerCase().includes(fFam)) return false;
        return true;
      })
      .forEach(row=>{
        let suma = row.tip==="Bani curați" ? "40.000$ Bani curați"
                 : row.tip==="Bani murdari" ? "60.000$ Bani murdari"
                 : "GRATIS";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="mono left">${row.cnp}</td>
          <td class="num">${suma}</td>
          <td class="num">${row.metoda||row.payment||"-"}</td>
          <td class="left">${row.user||"-"}</td>
          <td class="left">${row.gratisFamilie||"-"}</td>
          <td class="num">${row.createdAt ? new Date(row.createdAt).toLocaleString("ro-RO") : "-"}</td>`;
        body.appendChild(tr);
      });
  } else {
    const r = await api("/drill");
    if (!r.ok) return;
    (await r.json())
      .filter(j=>{
        const dt = j.createdAt ? new Date(j.createdAt) : new Date();
        if (mode==="week" && !inISOWeek(dt, selYear, selWeek)) return false;
        if (fUser && !(j.user||"").toLowerCase().includes(fUser)) return false;
        if (fCnp && !String(j.cnp).toLowerCase().includes(fCnp)) return false;
        if (fFam && !(j.family||"").toLowerCase().includes(fFam)) return false;
        return true;
      })
      .forEach(j=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="mono left">${j.cnp}</td>
          <td class="left">${j.family||"-"}</td>
          <td class="num">${j.cadru}</td>
          <td class="num">${j.teava}</td>
          <td class="num">${j.mecanism}</td>
          <td class="num">${j.fixare}</td>
          <td class="num">${money(j.costTotal||0)}</td>
          <td class="left">${j.user||"-"}</td>
          <td class="num">${j.createdAt ? new Date(j.createdAt).toLocaleString("ro-RO") : "-"}</td>`;
        body.appendChild(tr);
      });
  }
}

// ====================== My Profile ======================
$("#profPeriod")?.addEventListener("change", ()=>{
  $("#profWeekPicker").classList.toggle("hidden", $("#profPeriod").value!=="week");
  loadProfile();
});
$("#profWeekPicker")?.addEventListener("change", loadProfile);

async function loadProfile(){
  if (!CURRENT_USER) return;
  const mode = $("#profPeriod")?.value || "week";
  let selYear, selWeek;
  if (mode==="week") {
    try { ({year:selYear,week:selWeek} = JSON.parse($("#profWeekPicker").value)); } catch {}
  }

  // calcule pe baza /taxe și /drill (filtrate pe user === CURRENT_USER.username dacă backend le trimite user)
  const rT = await api("/taxe");
  const rD = await api("/drill");
  const daily = Array.from({length:7}, (_,i)=>({ day: dayNames[i], count:0, clean:0, dirty:0 }));

  let clean=0, dirty=0, pieces=0, drillMoney=0;

  if (rT.ok) {
    const rows = await rT.json();
    rows.forEach(t=>{
      if ((t.user||"") !== CURRENT_USER.username) return;
      const dt = t.createdAt ? new Date(t.createdAt) : new Date();
      if (!inISOWeek(dt, selYear, selWeek)) return;
      const wd = (dt.getDay()+6)%7;
      if (t.tip==="Bani curați"){ daily[wd].clean += 40000; clean += 40000; daily[wd].count+=1; }
      if (t.tip==="Bani murdari"){ daily[wd].dirty += 60000; dirty += 60000; daily[wd].count+=1; }
    });
  }
  if (rD.ok) {
    const jobs = await rD.json();
    jobs.forEach(j=>{
      if ((j.user||"") !== CURRENT_USER.username) return;
      const dt = j.createdAt ? new Date(j.createdAt) : new Date();
      if (!inISOWeek(dt, selYear, selWeek)) return;
      const pcs = (j.cadru||0)+(j.teava||0)+(j.mecanism||0)+(j.fixare||0);
      pieces += pcs;
      drillMoney += (j.costTotal||0); // Bani murdari
    });
  }
  $("#profClean").textContent = money(clean);
  $("#profDirty").textContent = money(dirty + drillMoney); // murdari = taxe murdare + burghiu
  $("#profPieces").textContent = (pieces||0).toLocaleString("ro-RO");
  $("#profDrillMoney").textContent = money(drillMoney);

  const body = $("#profDailyTable tbody"); body.innerHTML="";
  daily.forEach(d=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${d.day}</td><td class="num">${d.count}</td><td class="num">${money(d.clean)}</td><td class="num">${money(d.dirty)}</td>`;
    body.appendChild(tr);
  });

  // split 50/50
  const userClean  = clean/2;
  const famClean   = clean/2;
  const userDirty  = (dirty + drillMoney)/2;
  const famDirty   = (dirty + drillMoney)/2;

  $("#splitCleanUser").textContent  = money(userClean);
  $("#splitCleanFam").textContent   = money(famClean);
  $("#splitCleanTot").textContent   = money(clean);

  $("#splitDirtyUser").textContent  = money(userDirty);
  $("#splitDirtyFam").textContent   = money(famDirty);
  $("#splitDirtyTot").textContent   = money(dirty + drillMoney);

  $("#splitAllUser").textContent    = money(userClean + userDirty);
  $("#splitAllFam").textContent     = money(famClean + famDirty);
  $("#splitAllTot").textContent     = money(clean + dirty + drillMoney);
}

// ====================== Reset password (local endpoint) ======================
$("#resetForm")?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  if (!CURRENT_USER) return;
  const f = e.target;
  const r = await api("/auth/reset", { method:"POST", body: JSON.stringify({
    oldPassword: f.oldPassword.value,
    newPassword: f.newPassword.value
  })});
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Eroare la schimbarea parolei");
  alert("Parola a fost schimbată.");
  f.reset();
});

// ====================== Init ======================
hydrateMe();
