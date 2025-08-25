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
  const dow = simple.getUTCDay();
  const ISOweekStart = new Date(simple);
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

// populează săpt. 33..53 (anul curent)
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

    // Populare săptămâni (33..53) peste tot
    ["dashWeekPicker", "bfWeekPicker", "weekSelect", "tblWeekPicker", "profWeekPicker"].forEach(
      (id) => fillWeeks33toEnd(document.getElementById(id))
    );

    // încărcări inițiale
    loadTaxe(); // active (4h)
    loadDrill();
    loadDashboard();
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
    if (b.dataset.tab === "drillfamilies") loadDashboard(); // agregate drill reutilizate
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
    loadProfile();
  });
  es.addEventListener("drill:new", () => {
    loadDrill();
    loadDashboard();
    loadTableAll();
    loadProfile();
  });
  es.addEventListener("ping", () => {});
}

// ===== Taxe (ACTIVE 4h în tab-ul principal) =====
const metodaSelect = $("#metodaSelect");
const gratisWrap = $("#gratisWrap");

metodaSelect?.addEventListener("change", () => {
  const isGratis = metodaSelect.value === "gratis";
  gratisWrap?.classList.toggle("hidden", !isGratis);
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
  metodaSelect?.dispatchEvent(new Event("change"));
  loadTaxe();
  loadDashboard();
  loadTableAll();
  loadProfile();
});

// state + search
let taxeCache = [];
$("#taxSearch")?.addEventListener("input", () => renderTaxe(taxeCache));

async function loadTaxe() {
  // ACTIVE only (validUntil > now) pentru prima secțiune
  const r = await api("/taxe?scope=active");
  if (!r.ok) return;
  taxeCache = await r.json();
  renderTaxe(taxeCache);
}
function renderTaxe(list) {
  const q = ($("#taxSearch")?.value || "").trim().toLowerCase();
  const tbody = $("#taxeTable tbody");
  if (!tbody) return;
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

// ===== Burghiu (prima pagină: grupare pe un rând) =====
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

  // trimitem ca până acum (endpoint per piesă)
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
  loadProfile();
});

let drillCache = [];
async function loadDrill() {
  const r = await api("/drill");
  if (!r.ok) return;
  drillCache = await r.json();
  // Grupăm doar pentru lista „Ultimele joburi” din prima pagină
  renderDrill(groupDrillRows(drillCache));
}

// Grupare: combină intrări apropiate în timp pentru același CNP + familie
function groupDrillRows(list) {
  const MAX_MIN_DIFF_MS = 2 * 60 * 1000; // 2 minute
  const byKey = new Map();
  (list || []).forEach((j) => {
    const key = `${j.cnp}||${j.family || ""}`;
    const created = j.createdAt ? new Date(j.createdAt).getTime() : Date.now();
    const bucket = byKey.get(key) || [];
    // caută un grup existent suficient de apropiat ca timp
    let placed = false;
    for (const g of bucket) {
      if (Math.abs(created - g._ts) <= MAX_MIN_DIFF_MS) {
        g.cadru += j.cadru;
        g.teava += j.teava;
        g.mecanism += j.mecanism;
        g.fixare += j.fixare;
        g.costTotal += j.costTotal || 0;
        g._ts = Math.max(g._ts, created);
        placed = true;
        break;
      }
    }
    if (!placed) {
      bucket.push({
        ...j,
        cadru: j.cadru,
        teava: j.teava,
        mecanism: j.mecanism,
        fixare: j.fixare,
        costTotal: j.costTotal || 0,
        _ts: created,
      });
    }
    byKey.set(key, bucket);
  });

  // returnăm sortat desc după timp
  const merged = [];
  byKey.forEach((arr) => merged.push(...arr));
  return merged.sort((a, b) => (b._ts || 0) - (a._ts || 0));
}

function renderDrill(list) {
  const tbody = $("#drillTable tbody");
  if (!tbody) return;
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

// ===== Dashboard (week/all, include active + inactive) =====
$("#dashPeriod")?.addEventListener("change", loadDashboard);
$("#dashWeekPicker")?.addEventListener("change", loadDashboard);
$("#bfPeriod")?.addEventListener("change", loadDashboard);
$("#bfWeekPicker")?.addEventListener("change", loadDashboard);

async function loadDashboard() {
  // --- parametri (week/all)
  const dashPeriod = $("#dashPeriod")?.value || "week";
  let dashYear, dashWeek;
  try {
    if (dashPeriod === "week" && $("#dashWeekPicker")?.value)
      ({ year: dashYear, week: dashWeek } = JSON.parse($("#dashWeekPicker").value));
  } catch {}

  // Taxe: combinăm ACTIVE + HISTORY, apoi filtrăm local după week/all
  const taxUrls = [
    dashPeriod === "all"
      ? "/taxe?scope=history&period=all"
      : dashYear && dashWeek
      ? `/taxe?scope=history&year=${dashYear}&week=${dashWeek}`
      : "/taxe?scope=history",
    "/taxe?scope=active",
  ];

  let taxAll = [];
  for (const u of taxUrls) {
    const r = await api(u);
    if (r.ok) taxAll = taxAll.concat(await r.json());
  }

  let clean = 0,
    dirty = 0;
  const daily = Array.from({ length: 7 }, (_, i) => ({
    day: dayNames[i],
    count: 0,
    clean: 0,
    dirty: 0,
  }));

  taxAll.forEach((t) => {
    const created = t.createdAt ? new Date(t.createdAt) : new Date();
    if (dashPeriod === "week" && dashYear && dashWeek && !inISOWeek(created, dashYear, dashWeek))
      return;

    if (t.tip === "Bani curați") {
      clean += 40000;
    } else if (t.tip === "Bani murdari") {
      dirty += 60000;
    }
    const wd = (created.getDay() + 6) % 7;
    const row = daily[wd];
    row.count += 1;
    if (t.tip === "Bani curați") row.clean += 40000;
    if (t.tip === "Bani murdari") row.dirty += 60000;
  });

  $("#statTaxClean").textContent = money(clean);
  $("#statTaxDirty").textContent = money(dirty);

  const dBody = $("#dashDailyTable tbody");
  if (dBody) {
    dBody.innerHTML = "";
    daily.forEach((d) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="left">${d.day}</td><td>${d.count}</td><td>${money(
        d.clean
      )}</td><td>${money(d.dirty)}</td>`;
      dBody.appendChild(tr);
    });
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
  if (!tbody) return;
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

// ===== Tabele All (week/all + delete cu role) =====
$("#tblPeriod")?.addEventListener("change", loadTableAll);
$("#tblWeekPicker")?.addEventListener("change", loadTableAll);
$("#tblRefresh")?.addEventListener("click", loadTableAll);

async function loadTableAll() {
  const type = $("#tblType")?.value || "taxe";
  const filterUser = ($("#tblFilterUser")?.value || "").toLowerCase();
  const filterCnp = ($("#tblFilterCnp")?.value || "").toLowerCase();
  const filterFam = ($("#tblFilterFamily")?.value || "").toLowerCase();

  const period = $("#tblPeriod")?.value || "week";
  let tblYear, tblWeek;
  try {
    if (period === "week" && $("#tblWeekPicker")?.value)
      ({ year: tblYear, week: tblWeek } = JSON.parse($("#tblWeekPicker").value));
  } catch {}

  const head = $("#tblHead");
  const body = $("#tblAll tbody");
  if (!head || !body) return;
  body.innerHTML = "";

  const canDelete = currentRole === "ADMIN" || currentRole === "HEAD_OPERATOR";

  // formăm parametrii pt API
  const baseParams =
    period === "all"
      ? "period=all"
      : tblYear && tblWeek
      ? `year=${tblYear}&week=${tblWeek}`
      : "";

  if (type === "taxe") {
    head.innerHTML = `<tr><th class="left">CNP</th><th>Sumă</th><th>Timp rămas</th><th class="left">User</th><th class="left">Familie</th><th>Creat</th>${
      canDelete ? "<th>Șterge</th>" : ""
    }</tr>`;

    // combinăm history + active
    let list = [];
    const rH = await api(`/taxe?scope=history${baseParams ? `&${baseParams}` : ""}`);
    if (rH.ok) list = list.concat(await rH.json());
    const rA = await api("/taxe?scope=active");
    if (rA.ok) list = list.concat(await rA.json());

    // dacă avem week selectat și scope=active nu era filtrat, filtrăm local
    const filtered =
      period === "all" || !(tblYear && tblWeek)
        ? list
        : list.filter((x) => {
            const d = x.createdAt ? new Date(x.createdAt) : new Date();
            return inISOWeek(d, tblYear, tblWeek);
          });

    filtered
      .filter((x) => !filterUser || (x.user || "").toLowerCase().includes(filterUser))
      .filter((x) => !filterCnp || (x.cnp || "").toLowerCase().includes(filterCnp))
      .filter((x) => !filterFam || (x.gratisFamilie || "").toLowerCase().includes(filterFam))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .forEach((x) => {
        const suma = x.tip === "GRATIS" ? "GRATIS" : x.tip === "Bani curați" ? "40.000$" : "60.000$";
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
    head.innerHTML = `<tr><th class="left">CNP</th><th class="left">Familie</th><th>Cadru</th><th>Țeavă</th><th>Mecanism</th><th>Fixare</th><th>Plată</th><th>Valoare</th><th class="left">User</th><th>Creat</th>${
      canDelete ? "<th>Șterge</th>" : ""
    }</tr>`;

    const r = await api(`/drill${baseParams ? `?${baseParams}` : ""}`);
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

// delegare pentru butoanele „Șterge”
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
  loadProfile();
});

// ===== Profile (MEU) — include taxe active+inactive și piese/zi =====
$("#profPeriod")?.addEventListener("change", loadProfile);
$("#profWeekPicker")?.addEventListener("change", loadProfile);

async function loadProfile() {
  const period = $("#profPeriod")?.value || "week";
  let selYear, selWeek;
  try {
    if (period === "week" && $("#profWeekPicker")?.value)
      ({ year: selYear, week: selWeek } = JSON.parse($("#profWeekPicker").value));
  } catch {}

  const taxUrls = [
    period === "all"
      ? "/taxe?scope=history&period=all&mine=1"
      : selYear && selWeek
      ? `/taxe?scope=history&mine=1&year=${selYear}&week=${selWeek}`
      : "/taxe?scope=history&mine=1",
    "/taxe?scope=active&mine=1",
  ];

  const drillParams =
    period === "all"
      ? "mine=1&period=all"
      : selYear && selWeek
      ? `mine=1&year=${selYear}&week=${selWeek}`
      : "mine=1";

  let clean = 0,
    dirty = 0,
    pieces = 0,
    drillMoney = 0;

  const daily = Array.from({ length: 7 }, (_, i) => ({
    day: dayNames[i],
    count: 0,
    clean: 0,
    dirty: 0,
    pieces: 0, // <- piese burghiu / zi
  }));

  // Taxele MELE (active + history)
  let myTaxes = [];
  for (const u of taxUrls) {
    const r = await api(u);
    if (r.ok) myTaxes = myTaxes.concat(await r.json());
  }

  // pentru week, filtrăm local și pe active
  myTaxes.forEach((t) => {
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

  // Burghiul MEU
  const rD = await api(`/drill?${drillParams}`);
  if (rD.ok) {
    const jobs = await rD.json();
    jobs.forEach((j) => {
      const p = j.cadru + j.teava + j.mecanism + j.fixare;
      pieces += p;
      drillMoney += j.costTotal || 0;
      const created = j.createdAt ? new Date(j.createdAt) : new Date();
      if (period === "week" && selYear && selWeek && !inISOWeek(created, selYear, selWeek)) return;
      daily[(created.getDay() + 6) % 7].pieces += p; // <- piese/zi
    });
  }

  $("#profClean").textContent = money(clean);
  $("#profDirty").textContent = money(dirty + drillMoney);
  $("#profPieces").textContent = (pieces || 0).toLocaleString("ro-RO");
  $("#profDrillMoney").textContent = money(drillMoney);

  // Tabelul zilnic (taxe + piese/zi – coloana piese o vom arăta în index)
  const body = $("#profDailyTable tbody");
  if (body) {
    body.innerHTML = "";
    daily.forEach((d) => {
      const tr = document.createElement("tr");
      // dacă index.html are încă 4 coloane, piese nu se văd (urmează la pasul de index)
      tr.innerHTML = `<td class="left">${d.day}</td><td>${d.count}</td><td>${money(
        d.clean
      )}</td><td>${money(d.dirty)}</td>`;
      body.appendChild(tr);
    });
  }

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
