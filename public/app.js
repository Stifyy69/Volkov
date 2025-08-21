// ===================== THEME (persistă alegerea) =====================
(function () {
  const KEY = "theme";
  const saved = localStorage.getItem(KEY) || "dark";
  document.body.setAttribute("data-theme", saved);
  const sel = document.getElementById("themeSel");
  if (sel) {
    sel.value = saved;
    sel.addEventListener("change", () => {
      const v = sel.value || "dark";
      document.body.setAttribute("data-theme", v);
      localStorage.setItem(KEY, v);
    });
  }
})();

// ===================== HELPERE GENERALE =====================
const api = (path, opts = {}) =>
  fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
      ...(localStorage.token ? { Authorization: "Bearer " + localStorage.token } : {}),
    },
  });

const $  = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const money = (n = 0) => `${(n || 0).toLocaleString("ro-RO")}$`; // 1.000.000$

function setTabs(active) {
  $$(".tabbtn").forEach((b) => (b.dataset.active = b.dataset.tab === active));
  $$(".tab").forEach((sec) =>
    sec.id === `tab-${active}` ? sec.classList.remove("hidden") : sec.classList.add("hidden")
  );
}

// ===================== UTIL ISO WEEK =====================
function isoYearWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), week: weekNo };
}
function mondayOfISOWeek(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const ISOweekStart = simple;
  if (dow <= 4) ISOweekStart.setUTCDate(simple.getUTCDate() - dow + 1);
  else ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - dow);
  return ISOweekStart;
}
function inISOWeek(d, year, week) {
  const start = mondayOfISOWeek(year, week);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return d >= start && d < end;
}
const dayNames = ["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"];

// Populează săptămânile 33..sfârșit de an (cerința ta)
function fillWeeks33toEnd(sel) {
  if (!sel) return;
  sel.innerHTML = "";
  const nowYear = new Date().getUTCFullYear();
  for (let w = 33; w <= 53; w++) {
    const opt = document.createElement("option");
    opt.value = JSON.stringify({ year: nowYear, week: w });
    opt.textContent = `${nowYear}-W${String(w).padStart(2, "0")}`;
    sel.appendChild(opt);
  }
}

// ===================== AUTENTIFICARE =====================
let currentRole = null;
let currentUser = null;   // <— folosit la filtrarea „My profile” și tabele all (dacă vrei)

async function hydrateMe() {
  try {
    const r = await api("/auth/me");
    if (!r.ok) throw 0;
    const me = await r.json();
    currentRole = me.role || null;
    currentUser = me.username || null;
    $("#whoami").textContent = `${me.username} [${me.role}]`;

    // Vizibilitate tab-uri pe rol (admin/ho/audit)
    const show = (tab, cond) => {
      const btn = $$(".tabbtn").find((b) => b.dataset.tab === tab);
      if (btn) btn.classList.toggle("hidden", !cond);
    };
    show("admin", me.role === "ADMIN" || me.role === "HEAD_OPERATOR" || me.role === "AUDIT");
    show("tables", true);
    show("dashboard", true);
    show("drillfamilies", true);
    show("profile", true);

    // UI
    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");
    setTabs("taxe");

    // Populare săptămâni (33..53) în TOATE locurile cerute
    ["dashWeekPicker", "bfWeekPicker", "weekSelect", "tblWeekPicker", "profWeekPicker"].forEach(
      (id) => fillWeeks33toEnd(document.getElementById(id))
    );

    // Încărcări inițiale
    loadTaxe(); // active (4h) – secțiunea „Taxe active”
    loadDrill();
    loadDashboard(); // agregate (folosește /taxe/all dacă există)
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
    body: JSON.stringify({ username: f.username.value, password: f.password.value }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return alert(j.error || "Login eșuat");
  localStorage.token = j.token;
  hydrateMe();
});

$("#registerForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = {
    inviteCode: f.inviteCode.value,
    username: f.username.value,
    nickname: f.nickname.value,
    password: f.password.value,
    cnp: f.cnp.value,
  };
  const r = await api("/auth/register", { method: "POST", body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return alert(j.error || "Register eșuat");
  localStorage.token = j.token;
  hydrateMe();
});

// ===================== TABURI =====================
$$(".tabbtn").forEach((b) => {
  b.addEventListener("click", async () => {
    setTabs(b.dataset.tab);
    if (b.dataset.tab === "taxe") {
      loadTaxe();
      loadDrill();
    }
    if (b.dataset.tab === "dashboard") loadDashboard();
    if (b.dataset.tab === "drillfamilies") loadDashboard(); // aceleași agregate
    if (b.dataset.tab === "admin") loadAdmin();
    if (b.dataset.tab === "tables") loadTableAll();
    if (b.dataset.tab === "profile") loadProfile();
  });
});

// ===================== SSE (live refresh) =====================
let es;
function connectSSE() {
  if (es) {
    try { es.close(); } catch {}
  }
  es = new EventSource("/events");
  es.addEventListener("taxe:new", () => {
    loadTaxe();
    loadDashboard();
    loadTableAll();
  });
  es.addEventListener("drill:new", () => {
    loadDrill();
    loadDashboard();
    loadTableAll();
  });
  es.addEventListener("ping", () => {});
}

// ===================== TAXE – ACTIVE (4h) (doar lista „Taxe active”) =====================
const metodaSelect = $("#metodaSelect");
const gratisWrap    = $("#gratisWrap");

metodaSelect?.addEventListener("change", () => {
  const isGratis = metodaSelect.value === "gratis";
  gratisWrap.classList.toggle("hidden", !isGratis);
});

$("#taxeForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const cnp = (f.cnp.value || "").trim();
  if (!/^\d{1,6}$/.test(cnp)) return alert("CNP invalid (max 6).");

  const body = { cnp, metoda: f.metoda.value };
  if (f.metoda.value === "gratis") body.gratisFamilie = f.gratisFamilie.value;

  const r = await api("/taxe", { method: "POST", body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return alert(j.error || "Eroare la taxă");
  f.reset();
  metodaSelect.dispatchEvent(new Event("change"));
  loadTaxe();
  loadDashboard();
  loadTableAll();
});

// cache + search
let taxeCache = [];
$("#taxSearch")?.addEventListener("input", () => renderTaxe(taxeCache));

// Helper: ia „istoric taxe” dacă există /taxe/all; altfel cade pe /taxe
async function fetchAllTaxe() {
  // întâi încercăm /taxe/all (istoric)
  try {
    const rAll = await api("/taxe/all");
    if (rAll.ok) return await rAll.json();
  } catch {}
  // fallback: /taxe (poate returnează doar active)
  try {
    const r = await api("/taxe");
    if (r.ok) return await r.json();
  } catch {}
  return [];
}

async function loadTaxe() {
  const r = await api("/taxe"); // ACTIVE only pentru listarea de pe prima pagină
  if (!r.ok) return;
  taxeCache = await r.json();
  renderTaxe(taxeCache);
}
function renderTaxe(list) {
  const q = ($("#taxSearch")?.value || "").trim().toLowerCase();
  const tbody = $("#taxeTable tbody");
  tbody.innerHTML = "";
  (list || [])
    .filter((row) => !q || String(row.cnp).toLowerCase().includes(q))
    .forEach((row) => {
      let suma = "";
      if (row.metoda === "gratis" || row.tip === "GRATIS") {
        suma = "GRATIS";
      } else if (row.tip === "Bani curați") {
        suma = "40.000$";
      } else if (row.tip === "Bani murdari") {
        suma = "60.000$";
      }
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="font-mono">${row.cnp}</td><td>${suma}</td><td>${row.remaining || ""}</td><td class="left">${row.user || "-"}</td>`;
      tbody.appendChild(tr);
    });
}

// ===================== BURGHIU =====================
$("#drillForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const cnp = (f.cnp.value || "").trim();
  if (!/^\d{1,6}$/.test(cnp)) return alert("CNP invalid (max 6).");

  const pieces = [
    { key: "cadru",    val: Number(f.cadru.value || 0) },
    { key: "teava",    val: Number(f.teava.value || 0) },
    { key: "mecanism", val: Number(f.mecanism.value || 0) },
    { key: "fixare",   val: Number(f.fixare.value || 0) },
  ].filter((p) => p.val > 0);
  if (!pieces.length) return alert("Introdu minim o cantitate > 0.");
  if (!f.family.value) return alert("Selectează o familie.");

  for (const p of pieces) {
    const body = { cnp, part: p.key, quantity: p.val, family: f.family.value };
    const r = await api("/drill", { method: "POST", body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return alert(j.error || `Eroare la ${p.key}`);
  }

  f.reset();
  loadDrill();
  loadDashboard();
  loadTableAll();
});

let drillCache = [];
async function loadDrill() {
  const r = await api("/drill");
  if (!r.ok) return;
  drillCache = await r.json();
  renderDrill(drillCache);
}
function renderDrill(list) {
  const tbody = $("#drillTable tbody");
  tbody.innerHTML = "";
  (list || []).slice(0, 5).forEach((j) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="font-mono">${j.cnp}</td>
      <td class="left">${j.family || "-"}</td>
      <td>${j.cadru}</td>
      <td>${j.teava}</td>
      <td>${j.mecanism}</td>
      <td>${j.fixare}</td>
      <td>${j.metodaPlata}</td>
      <td>${money(j.costTotal || 0)}</td>
      <td class="left">${j.user || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===================== DASHBOARD & STATISTICI FAMILII =====================
$("#dashPeriod")?.addEventListener("change", loadDashboard);
$("#dashWeekPicker")?.addEventListener("change", loadDashboard);
$("#bfPeriod")?.addEventListener("change", loadDashboard);
$("#bfWeekPicker")?.addEventListener("change", loadDashboard);

async function loadDashboard() {
  // Dashboard – perioadă
  const dashPeriod = $("#dashPeriod")?.value || "week";
  let dashYear, dashWeek;
  try {
    if (dashPeriod === "week" && $("#dashWeekPicker")?.value)
      ({ year: dashYear, week: dashWeek } = JSON.parse($("#dashWeekPicker").value));
  } catch {}

  // === 1) TAXE — încercăm /taxe/all ca să avem istoric ===
  let clean = 0, dirty = 0;
  const daily = Array.from({ length: 7 }, (_, i) => ({
    day: dayNames[i], count: 0, clean: 0, dirty: 0,
  }));

  const taxe = await fetchAllTaxe(); // istoric (sau active ca fallback)
  taxe.forEach((t) => {
    // filtrare perioadă (same ca drill)
    if (dashPeriod === "week" && dashYear && dashWeek) {
      const dt = t.createdAt ? new Date(t.createdAt) : new Date();
      if (!inISOWeek(dt, dashYear, dashWeek)) return;
    }
    if (t.tip === "Bani curați") { clean += 40000; }
    if (t.tip === "Bani murdari") { dirty += 60000; }
    const created = t.createdAt ? new Date(t.createdAt) : new Date();
    const wd = (created.getDay() + 6) % 7;
    const row = daily[wd];
    row.count += 1;
    if (t.tip === "Bani curați")  row.clean  += 40000;
    if (t.tip === "Bani murdari") row.dirty += 60000;
  });

  $("#statTaxClean").textContent = money(clean);
  $("#statTaxDirty").textContent = money(dirty);

  const dBody = $("#dashDailyTable tbody");
  dBody.innerHTML = "";
  daily.forEach((d) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${d.day}</td><td>${d.count}</td><td>${money(d.clean)}</td><td>${money(d.dirty)}</td>`;
    dBody.appendChild(tr);
  });

  // === 2) BURGHIU + agregare familii (fără schimbări) ===
  const rD = await api("/drill");
  const famAgg = new Map(); // fam -> {cadru, teava, mecanism, fixare, total}
  let totalPieces = 0;

  if (rD.ok) {
    const jobs = await rD.json();
    const jobsFilt = jobs.filter((j) => {
      if (dashPeriod === "all") return true;
      if (!dashYear || !dashWeek) return true;
      const dt = j.createdAt ? new Date(j.createdAt) : new Date();
      return inISOWeek(dt, dashYear, dashWeek);
    });

    jobsFilt.forEach((j) => {
      const pieces = j.cadru + j.teava + j.mecanism + j.fixare;
      totalPieces += pieces;
      const fam = j.family || "(fără)";
      const prev = famAgg.get(fam) || { cadru: 0, teava: 0, mecanism: 0, fixare: 0, total: 0 };
      prev.cadru += j.cadru;
      prev.teava += j.teava;
      prev.mecanism += j.mecanism;
      prev.fixare += j.fixare;
      prev.total += pieces;
      famAgg.set(fam, prev);
    });

    $("#statDrillPieces").textContent = (totalPieces || 0).toLocaleString("ro-RO");
  }

  // Familii table (în Dashboard)
  const famBody = $("#drillFamiliesTable tbody");
  if (famBody) {
    famBody.innerHTML = "";
    [...famAgg.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([fam, agg]) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="left">${fam}</td><td>${agg.cadru}</td><td>${agg.teava}</td><td>${agg.mecanism}</td><td>${agg.fixare}</td><td>${agg.total}</td>`;
        famBody.appendChild(tr);
      });
  }

  // Filtru familii text (dashboard)
  $("#famSearch")?.addEventListener(
    "input",
    (e) => {
      const q = (e.target.value || "").toLowerCase();
      [...$("#drillFamiliesTable tbody").rows].forEach((tr) => {
        const name = (tr.cells[0]?.textContent || "").toLowerCase();
        tr.style.display = name.includes(q) ? "" : "none";
      });
    },
    { once: true }
  );

  // ================= Statistici Familii (tab separat) =================
  const bfPeriod = $("#bfPeriod")?.value || "week";
  let bfYear, bfWeek;
  try {
    if (bfPeriod === "week" && $("#bfWeekPicker")?.value)
      ({ year: bfYear, week: bfWeek } = JSON.parse($("#bfWeekPicker").value));
  } catch {}

  // Refolosim /drill pentru BF
  const bfBody = $("#bfTable tbody");
  if (bfBody) {
    bfBody.innerHTML = "";
    const famAgg2 = new Map();
    const rD2 = await api("/drill");
    const jobs2 = rD2.ok ? await rD2.json() : [];
    const jobs2Filt = jobs2.filter((j) => {
      if (bfPeriod === "all") return true;
      if (!bfYear || !bfWeek) return true;
      const dt = j.createdAt ? new Date(j.createdAt) : new Date();
      return inISOWeek(dt, bfYear, bfWeek);
    });
    jobs2Filt.forEach((j) => {
      const fam = j.family || "(fără)";
      const prev = famAgg2.get(fam) || { cadru: 0, teava: 0, mecanism: 0, fixare: 0, total: 0 };
      prev.cadru += j.cadru;
      prev.teava += j.teava;
      prev.mecanism += j.mecanism;
      prev.fixare += j.fixare;
      prev.total += j.cadru + j.teava + j.mecanism + j.fixare;
      famAgg2.set(fam, prev);
    });
    [...famAgg2.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([fam, agg]) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="left">${fam}</td><td>${agg.cadru}</td><td>${agg.teava}</td><td>${agg.mecanism}</td><td>${agg.fixare}</td><td>${agg.total}</td>`;
        bfBody.appendChild(tr);
      });

    // Căutare în tab „Statistici Familii”
    $("#bfSearch")?.addEventListener(
      "input",
      (e) => {
        const q = (e.target.value || "").toLowerCase();
        [...$("#bfTable tbody").rows].forEach((tr) => {
          const name = (tr.cells[0]?.textContent || "").toLowerCase();
          tr.style.display = name.includes(q) ? "" : "none";
        });
      },
      { once: true }
    );
  }
}

// ===================== ADMIN (split) =====================
$("#admPeriod")?.addEventListener("change", loadAdmin);
$("#weekSelect")?.addEventListener("change", loadAdmin);

async function loadAdmin() {
  const period = $("#admPeriod")?.value || "week";
  let url = "/admin/stats";
  if (period === "all") url = "/admin/stats?period=all";
  else if ($("#weekSelect")?.value) {
    const { year, week } = JSON.parse($("#weekSelect").value);
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
  list.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="left">${row.username}</td>
      <td>${money(row.userShareClean || 0)}</td>
      <td>${money(row.userShareDirty || 0)}</td>
      <td>${money(row.familyShareClean || 0)}</td>
      <td>${money(row.familyShareDirty || 0)}</td>
      <td>${money(row.totalClean || 0)}</td>
      <td>${money(row.totalDirty || 0)}</td>
      <td class="total-col">${money(row.total || 0)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Invite (admin)
$("#inviteBtn")?.addEventListener("click", async () => {
  const role = $("#inviteRole").value;
  const r = await api("/invites", { method: "POST", body: JSON.stringify({ role }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return alert(j.error || "Eroare");
  $("#inviteResult").value = j.link || j.code || "";
});
$("#inviteCopy")?.addEventListener("click", () => {
  const el = $("#inviteResult");
  el.select();
  document.execCommand?.("copy");
});

// ===================== TABELE ALL =====================
$("#tblPeriod")?.addEventListener("change", loadTableAll);
$("#tblWeekPicker")?.addEventListener("change", loadTableAll);
$("#tblRefresh")?.addEventListener("click", loadTableAll);

async function loadTableAll() {
  const type = $("#tblType").value;
  const filterUser = ($("#tblFilterUser").value || "").toLowerCase();
  const filterCnp = ($("#tblFilterCnp").value || "").toLowerCase();
  const filterFam = ($("#tblFilterFamily").value || "").toLowerCase();
  const head = $("#tblHead");
  const body = $("#tblAll tbody");
  body.innerHTML = "";

  const canDelete = currentRole === "ADMIN" || currentRole === "HEAD_OPERATOR";

  if (type === "taxe") {
    head.innerHTML = `<tr><th class="left">CNP</th><th>Sumă</th><th>Timp rămas</th><th class="left">User</th><th class="left">Familie</th><th>Creat</th>${
      canDelete ? "<th>Șterge</th>" : ""
    }</tr>`;
    const list = await fetchAllTaxe(); // istoric dacă e disponibil
    list
      .filter((x) => !filterUser || (x.user || "").toLowerCase().includes(filterUser))
      .filter((x) => !filterCnp || (x.cnp || "").toLowerCase().includes(filterCnp))
      .filter((x) => !filterFam || (x.gratisFamilie || "").toLowerCase().includes(filterFam))
      .forEach((x) => {
        let suma =
          x.tip === "GRATIS" ? "GRATIS" : x.tip === "Bani curați" ? "40.000$" : "60.000$";
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="font-mono">${x.cnp}</td><td>${suma}</td><td>${
          x.remaining || ""
        }</td><td class="left">${x.user || "-"}</td><td class="left">${
          x.gratisFamilie || "-"
        }</td><td>${x.createdAt ? new Date(x.createdAt).toLocaleString("ro-RO") : ""}</td>${
          canDelete
            ? `<td><button class="sm danger" data-del-type="taxe" data-id="${x.id || x._id || ""}">Șterge</button></td>`
            : ""
        }`;
        body.appendChild(tr);
      });
  } else {
    head.innerHTML = `<tr><th class="left">CNP</th><th class="left">Familie</th><th>Cadru</th><th>Țeavă</th><th>Mecanism</th><th>Fixare</th><th>Plată</th><th>Valoare</th><th class="left">User</th><th>Creat</th>${
      canDelete ? "<th>Șterge</th>" : ""
    }</tr>`;
    const r = await api("/drill");
    if (!r.ok) return;
    const list = await r.json();
    list
      .filter((x) => !filterUser || (x.user || "").toLowerCase().includes(filterUser))
      .filter((x) => !filterCnp || (x.cnp || "").toLowerCase().includes(filterCnp))
      .filter((x) => !filterFam || (x.family || "").toLowerCase().includes(filterFam))
      .forEach((j) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="font-mono">${j.cnp}</td><td class="left">${
          j.family || "-"
        }</td><td>${j.cadru}</td><td>${j.teava}</td><td>${j.mecanism}</td><td>${
          j.fixare
        }</td><td>${j.metodaPlata}</td><td>${money(j.costTotal || 0)}</td><td class="left">${
          j.user || "-"
        }</td><td>${j.createdAt ? new Date(j.createdAt).toLocaleString("ro-RO") : ""}</td>${
          canDelete
            ? `<td><button class="sm danger" data-del-type="drill" data-id="${j.id || j._id || ""}">Șterge</button></td>`
            : ""
        }`;
        body.appendChild(tr);
      });
  }
}

// Ștergere (delegare îmbunătățită: disable btn + scoate rândul la succes)
$("#tblAll")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-del-type]");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  const t  = btn.getAttribute("data-del-type");
  if (!id || !t) return;
  if (!confirm("Sigur vrei să ștergi această intrare?")) return;

  const url = t === "taxe" ? `/taxe/${id}` : `/drill/${id}`;
  btn.disabled = true;
  btn.textContent = "Se șterge…";
  const tr = btn.closest("tr");

  try {
    const r = await api(url, { method: "DELETE" });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert(j.error || "Nu s-a putut șterge");
      btn.disabled = false;
      btn.textContent = "Șterge";
      return;
    }
    // scoatem rândul fără reload complet
    tr?.parentNode?.removeChild(tr);
    loadDashboard(); // sincronizează stats
  } catch {
    alert("Eroare la ștergere");
    btn.disabled = false;
    btn.textContent = "Șterge";
  }
});

// ===================== PROFIL (NUMAI UTILIZATORUL CURENT) =====================
$("#profPeriod")?.addEventListener("change", loadProfile);
$("#profWeekPicker")?.addEventListener("change", loadProfile);

async function loadProfile() {
  const period = $("#profPeriod")?.value || "week";
  let selYear, selWeek;
  try {
    if (period === "week" && $("#profWeekPicker")?.value)
      ({ year: selYear, week: selWeek } = JSON.parse($("#profWeekPicker").value));
  } catch {}

  let clean = 0, dirty = 0, pieces = 0, drillMoney = 0;
  const daily = Array.from({ length: 7 }, (_, i) => ({
    day: dayNames[i], count: 0, clean: 0, dirty: 0,
  }));

  // Taxe – ISTORIC dacă există, altfel active; DOAR ale user-ului curent
  const taxe = (await fetchAllTaxe()).filter((t) => !currentUser || (t.user || "") === currentUser);
  taxe.forEach((t) => {
    const created = t.createdAt ? new Date(t.createdAt) : new Date();
    if (period === "week" && selYear && selWeek && !inISOWeek(created, selYear, selWeek)) return;
    if (t.tip === "Bani curați") {
      clean += 40000;
      daily[(created.getDay() + 6) % 7].clean += 40000;
      daily[(created.getDay() + 6) % 7].count++;
    }
    if (t.tip === "Bani murdari") {
      dirty += 60000;
      daily[(created.getDay() + 6) % 7].dirty += 60000;
      daily[(created.getDay() + 6) % 7].count++;
    }
  });

  // Drill – DOAR ale user-ului curent
  const rD = await api("/drill");
  if (rD.ok) {
    const jobs = (await rD.json()).filter((j) => !currentUser || (j.user || "") === currentUser);
    jobs.forEach((j) => {
      const created = j.createdAt ? new Date(j.createdAt) : new Date();
      if (period === "week" && selYear && selWeek && !inISOWeek(created, selYear, selWeek)) return;
      const p = j.cadru + j.teava + j.mecanism + j.fixare;
      pieces += p;
      drillMoney += j.costTotal || 0;
    });
  }

  $("#profClean").textContent = money(clean);
  $("#profDirty").textContent = money(dirty + drillMoney);
  $("#profPieces").textContent = (pieces || 0).toLocaleString("ro-RO");
  $("#profDrillMoney").textContent = money(drillMoney);

  const body = $("#profDailyTable tbody");
  body.innerHTML = "";
  daily.forEach((d) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${d.day}</td><td>${d.count}</td><td>${money(d.clean)}</td><td>${money(d.dirty)}</td>`;
    body.appendChild(tr);
  });

  // split 50/50
  const userClean = clean * 0.5, famClean = clean * 0.5;
  const userDirty = (dirty + drillMoney) * 0.5, famDirty = (dirty + drillMoney) * 0.5;
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

// ===================== INIT =====================
hydrateMe();
setTabs("taxe");
