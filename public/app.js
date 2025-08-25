// ===== Helpers & Theme =====
(function () {
  const saved = localStorage.getItem("theme") || "dark";
  document.body.setAttribute("data-theme", saved);
  const sel = document.getElementById("themeSel");
  if (sel) {
    sel.value = saved;
    sel.addEventListener("change", () => {
      const v = sel.value || "dark";
      document.body.setAttribute("data-theme", v);
      localStorage.setItem("theme", v);
    });
  }
})();

const api = (path, opts = {}) =>
  fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
      ...(localStorage.token ? { Authorization: "Bearer " + localStorage.token } : {}),
    },
  });

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const money = (n = 0) => `${(n || 0).toLocaleString("ro-RO")}$`; // 1.000.000$

function setTabs(active) {
  $$(".tabbtn").forEach((b) => (b.dataset.active = b.dataset.tab === active));
  $$(".tab").forEach((sec) =>
    sec.id === `tab-${active}` ? sec.classList.remove("hidden") : sec.classList.add("hidden")
  );
}

// ===== ISO week utils =====
function mondayOfISOWeek(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay() || 7;
  const start = new Date(simple);
  if (dow <= 4) start.setUTCDate(simple.getUTCDate() - dow + 1);
  else start.setUTCDate(simple.getUTCDate() + 8 - dow);
  return start;
}
function inISOWeek(d, year, week) {
  const start = mondayOfISOWeek(year, week);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return d >= start && d < end;
}
const dayNames = ["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"];

// Populează săpt. 33..53 (pe anul curent)
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

// ===== Auth =====
let currentRole = null;

async function hydrateMe() {
  try {
    const r = await api("/auth/me");
    if (!r.ok) throw 0;
    const me = await r.json();
    currentRole = me.role || null;
    $("#whoami").textContent = `${me.username} [${me.role}]`;

    // vizibilitate tab-uri pe rol
    const show = (tab, cond) => {
      const btn = $$(".tabbtn").find((b) => b.dataset.tab === tab);
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

    // Populare săptămâni (33..53) în toate selectoarele
    ["dashWeekPicker", "bfWeekPicker", "weekSelect", "tblWeekPicker", "profWeekPicker"].forEach(
      (id) => fillWeeks33toEnd(document.getElementById(id))
    );

    loadTaxe(); // active (4h)
    loadDrill();
    loadDashboard(); // agregate din istoric + burghiu
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

// ===== Tabs =====
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

// ===== SSE (live) =====
let es;
function connectSSE() {
  if (es) {
    try {
      es.close();
    } catch {}
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

// ===== Taxe – ACTIVE (4h, tab principal) =====
const metodaSelect = $("#metodaSelect");
const gratisWrap = $("#gratisWrap");

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

// state + search
let taxeCache = [];
$("#taxSearch")?.addEventListener("input", () => renderTaxe(taxeCache));

async function loadTaxe() {
  // doar activele pentru lista de sus
  const r = await api("/taxe?scope=active");
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
      tr.innerHTML = `<td class="font-mono">${row.cnp}</td><td>${suma}</td><td>${
        row.remaining || ""
      }</td><td class="left">${row.user || "-"}</td>`;
      tbody.appendChild(tr);
    });
}

// ===== Burghiu =====
$("#drillForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const cnp = (f.cnp.value || "").trim();
  if (!/^\d{1,6}$/.test(cnp)) return alert("CNP invalid (max 6).");

  const pieces = [
    { key: "cadru", val: Number(f.cadru.value || 0) },
    { key: "teava", val: Number(f.teava.value || 0) },
    { key: "mecanism", val: Number(f.mecanism.value || 0) },
    { key: "fixare", val: Number(f.fixare.value || 0) },
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
  // pentru panoul „Ultimele joburi” nu filtrăm; luăm fresh
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

// ===== Dashboard & Statistici Familii =====
$("#dashPeriod")?.addEventListener("change", loadDashboard);
$("#dashWeekPicker")?.addEventListener("change", loadDashboard);
$("#bfPeriod")?.addEventListener("change", loadDashboard);
$("#bfWeekPicker")?.addEventListener("change", loadDashboard);

function buildPeriodQuery(periodSelId) {
  const p = $(periodSelId)?.value || "week";
  if (p === "all") return "period=all";
  const sel = document.getElementById(
    periodSelId === "#dashPeriod" ? "dashWeekPicker" : periodSelId === "#bfPeriod" ? "bfWeekPicker" : ""
  );
  // folosim selectoarele dedicate în loadDashboard direct
  return "";
}

async function loadDashboard() {
  // Dashboard – determină perioada selectată
  const dashPeriod = $("#dashPeriod")?.value || "week";
  let dashYear, dashWeek;
  try {
    if (dashPeriod === "week" && $("#dashWeekPicker")?.value)
      ({ year: dashYear, week: dashWeek } = JSON.parse($("#dashWeekPicker").value));
  } catch {}

  // 1) Taxe – ISTORIC din backend (scope=history) + filtrare perioadă în backend când e posibil
  let clean = 0,
    dirty = 0;
  const daily = Array.from({ length: 7 }, (_, i) => ({
    day: dayNames[i],
    count: 0,
    clean: 0,
    dirty: 0,
  }));

  const taxUrl =
    dashPeriod === "all"
      ? "/taxe?scope=history"
      : `/taxe?scope=history&year=${dashYear || ""}&week=${dashWeek || ""}`;
  const rT = await api(taxUrl);
  let taxe = [];
  if (rT.ok) {
    taxe = await rT.json();
    taxe.forEach((t) => {
      // (backend deja a filtrat pe week când avem year/week; oricum păstrăm protecție)
      const created = t.createdAt ? new Date(t.createdAt) : new Date();
      if (dashPeriod === "week" && dashYear && dashWeek && !inISOWeek(created, dashYear, dashWeek))
        return;

      if (t.tip === "Bani curați") clean += 40000;
      if (t.tip === "Bani murdari") dirty += 60000;

      const wd = (created.getDay() + 6) % 7;
      daily[wd].count += 1;
      if (t.tip === "Bani curați") daily[wd].clean += 40000;
      if (t.tip === "Bani murdari") daily[wd].dirty += 60000;
    });
  }
  $("#statTaxClean").textContent = money(clean);
  $("#statTaxDirty").textContent = money(dirty);

  const dBody = $("#dashDailyTable tbody");
  dBody.innerHTML = "";
  daily.forEach((d) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${d.day}</td><td>${d.count}</td><td>${money(
      d.clean
    )}</td><td>${money(d.dirty)}</td>`;
    dBody.appendChild(tr);
  });

  // 2) Burghiu + Familii (backend filtrat pe week/all)
  const drillUrl =
    dashPeriod === "all"
      ? "/drill"
      : `/drill?year=${dashYear || ""}&week=${dashWeek || ""}`;
  const rD = await api(drillUrl);
  const famAgg = new Map();
  let totalPieces = 0;

  if (rD.ok) {
    const jobs = await rD.json();
    jobs.forEach((j) => {
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

  // Tabel Familii (Dashboard)
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

  // Filtru familii în Dashboard
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

  // ===== Tab „Statistici Familii” (se bazează pe aceleași date) =====
  const bfPeriod = $("#bfPeriod")?.value || "week";
  let bfYear, bfWeek;
  try {
    if (bfPeriod === "week" && $("#bfWeekPicker")?.value)
      ({ year: bfYear, week: bfWeek } = JSON.parse($("#bfWeekPicker").value));
  } catch {}

  const rD2 = await api(
    bfPeriod === "all" ? "/drill" : `/drill?year=${bfYear || ""}&week=${bfWeek || ""}`
  );
  const famAgg2 = new Map();
  const bfBody = $("#bfTable tbody");
  if (bfBody) {
    bfBody.innerHTML = "";
    const jobs2 = rD2.ok ? await rD2.json() : [];
    jobs2.forEach((j) => {
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

// ===== Admin =====
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

// ===== Tabele All =====
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

  // determină perioada pt query către backend (ca la drill)
  const tblPeriod = $("#tblPeriod")?.value || "week";
  let tblYear, tblWeek;
  try {
    if (tblPeriod === "week" && $("#tblWeekPicker")?.value)
      ({ year: tblYear, week: tblWeek } = JSON.parse($("#tblWeekPicker").value));
  } catch {}

  if (type === "taxe") {
    head.innerHTML = `<tr>
      <th class="left">CNP</th><th>Sumă</th><th>Timp rămas</th><th class="left">User</th>
      <th class="left">Familie</th><th>Creat</th>${canDelete ? "<th>Șterge</th>" : ""}
    </tr>`;

    const url =
      tblPeriod === "all"
        ? `/taxe?scope=history`
        : `/taxe?scope=history&year=${tblYear || ""}&week=${tblWeek || ""}`;

    const r = await api(url);
    if (!r.ok) return;
    const list = await r.json();
    list
      .filter((x) => !filterUser || (x.user || "").toLowerCase().includes(filterUser))
      .filter((x) => !filterCnp || (x.cnp || "").toLowerCase().includes(filterCnp))
      .filter((x) => !filterFam || (x.gratisFamilie || "").toLowerCase().includes(filterFam))
      .forEach((x) => {
        const suma =
          x.tip === "GRATIS" ? "GRATIS" : x.tip === "Bani curați" ? "40.000$" : "60.000$";
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="font-mono">${x.cnp}</td><td>${suma}</td><td>${
          x.remaining || ""
        }</td><td class="left">${x.user || "-"}</td><td class="left">${
          x.gratisFamilie || "-"
        }</td><td>${x.createdAt ? new Date(x.createdAt).toLocaleString("ro-RO") : ""}</td>${
          canDelete
            ? `<td><button class="sm danger" data-del-type="taxe" data-id="${x.id}">Șterge</button></td>`
            : ""
        }`;
        body.appendChild(tr);
      });
  } else {
    head.innerHTML = `<tr>
      <th class="left">CNP</th><th class="left">Familie</th><th>Cadru</th><th>Țeavă</th><th>Mecanism</th><th>Fixare</th>
      <th>Plată</th><th>Valoare</th><th class="left">User</th><th>Creat</th>${canDelete ? "<th>Șterge</th>" : ""}
    </tr>`;

    const url =
      tblPeriod === "all"
        ? `/drill`
        : `/drill?year=${tblYear || ""}&week=${tblWeek || ""}`;

    const r = await api(url);
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
            ? `<td><button class="sm danger" data-del-type="drill" data-id="${j.id}">Șterge</button></td>`
            : ""
        }`;
        body.appendChild(tr);
      });
  }
}

// delegare butoane „Șterge”
$("#tblAll")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-del-type]");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  const t = btn.getAttribute("data-del-type");
  if (!id || !t) return;
  if (!confirm("Sigur vrei să ștergi această intrare?")) return;
  const url = t === "taxe" ? `/taxe/${id}` : `/drill/${id}`;
  const r = await api(url, { method: "DELETE" });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    return alert(j.error || "Nu s-a putut șterge");
  }
  loadTableAll();
  loadDashboard();
});

// ===== Profile (doar ale mele) =====
$("#profPeriod")?.addEventListener("change", loadProfile);
$("#profWeekPicker")?.addEventListener("change", loadProfile);

async function loadProfile() {
  const period = $("#profPeriod")?.value || "week";
  let selYear, selWeek;
  try {
    if (period === "week" && $("#profWeekPicker")?.value)
      ({ year: selYear, week: selWeek } = JSON.parse($("#profWeekPicker").value));
  } catch {}

  let clean = 0,
    dirty = 0,
    pieces = 0,
    drillMoney = 0;
  const daily = Array.from({ length: 7 }, (_, i) => ({
    day: dayNames[i],
    count: 0,
    clean: 0,
    dirty: 0,
  }));

  // Taxe – doar ale mele, istoric; backend filtrează week/all
  const taxUrl =
    period === "all"
      ? `/taxe?scope=history&mine=1`
      : `/taxe?scope=history&mine=1&year=${selYear || ""}&week=${selWeek || ""}`;
  const rT = await api(taxUrl);
  if (rT.ok) {
    const taxe = await rT.json();
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
  }

  // Drill – doar ale mele; backend filtrează week/all
  const drillUrl =
    period === "all"
      ? `/drill?mine=1`
      : `/drill?mine=1&year=${selYear || ""}&week=${selWeek || ""}`;
  const rD = await api(drillUrl);
  if (rD.ok) {
    const jobs = await rD.json();
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
    tr.innerHTML = `<td class="left">${d.day}</td><td>${d.count}</td><td>${money(
      d.clean
    )}</td><td>${money(d.dirty)}</td>`;
    body.appendChild(tr);
  });

  // split 50/50
  const userClean = clean * 0.5,
    famClean = clean * 0.5;
  const userDirty = (dirty + drillMoney) * 0.5,
    famDirty = (dirty + drillMoney) * 0.5;
  $("#splitCleanUser").textContent = money(userClean);
  $("#splitCleanFam").textContent = money(famClean);
  $("#splitCleanTot").textContent = money(clean);
  $("#splitDirtyUser").textContent = money(userDirty);
  $("#splitDirtyFam").textContent = money(famDirty);
  $("#splitDirtyTot").textContent = money(dirty + drillMoney);
  $("#splitAllUser").textContent = money(userClean + userDirty);
  $("#splitAllFam").textContent = money(famClean + famDirty);
  $("#splitAllTot").textContent = money(clean + dirty + drillMoney);
}

// ===== Admin Invite =====
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

// ===== Init =====
hydrateMe();
setTabs("taxe");
