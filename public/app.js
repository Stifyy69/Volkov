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
const money = (n = 0) => `${(n || 0).toLocaleString("ro-RO")}$`;

// Conversii — aliniat cu Stefanos (rate = 0.65, cu floor)
// Curați -> Murdari: floor(curat / 0.65)
// Murdari -> Curați: floor(murdar * 0.65)
const RATE = 0.65;
const toDirty = (clean = 0) => Math.floor((clean || 0) / RATE);
const toClean = (dirty = 0) => Math.floor((dirty || 0) * RATE);

function setTabs(active) {
  $$(".tabbtn").forEach((b) => (b.dataset.active = b.dataset.tab === active));
  $$(".tab").forEach((sec) =>
    sec.id === `tab-${active}` ? sec.classList.remove("hidden") : sec.classList.add("hidden")
  );
}

// ===== ISO week utils =====
function getISOWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), week: weekNo };
}
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

// Populează doar W33..W53 și selectează săptămâna curentă dacă e în interval
function fillWeeksCurrent(sel) {
  if (!sel) return;
  sel.innerHTML = "";
  const { year: nowYear, week: nowWeek } = getISOWeek(new Date());
  for (let w = 33; w <= 53; w++) {
    const opt = document.createElement("option");
    opt.value = JSON.stringify({ year: nowYear, week: w });
    opt.textContent = `${nowYear}-W${String(w).padStart(2, "0")}`;
    if (w === nowWeek) opt.selected = true;
    sel.appendChild(opt);
  }
  if (nowWeek < 33) sel.selectedIndex = 0;
}

// ===== Auth =====
let currentRole = null;

async function hydrateMe() {
  try {
    const r = await api("/auth/me");
    if (!r.ok) throw 0;
    const me = await r.json();
    currentRole = me.role || null;

    // Afișează nickname dacă există; altfel username
    const display = me.displayName || me.nickname || me.username;
    $("#whoami").textContent = `${display} [${me.role}]`;

    const show = (tab, cond) => {
      const btn = $$(".tabbtn").find((b) => b.dataset.tab === tab);
      if (btn) btn.classList.toggle("hidden", !cond);
    };

    if (me.role === "OPERATOR") {
      show("admin", false);
      show("tables", false);
      show("dashboard", false);
      show("drillfamilies", false);
      show("taxe", true);
      show("profile", true);
    } else {
      show("admin", me.role === "ADMIN" || me.role === "HEAD_OPERATOR" || me.role === "AUDIT");
      show("tables", true);
      show("dashboard", true);
      show("drillfamilies", true);
      show("profile", true);
    }

    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");
    setTabs("taxe");

    ["dashWeekPicker", "bfWeekPicker", "weekSelect", "tblWeekPicker", "profWeekPicker"].forEach(
      (id) => fillWeeksCurrent(document.getElementById(id))
    );

    loadTaxe();
    loadDrill();
    loadDashboard();
    loadAdmin();
    loadTableAll();
    loadProfile();
    await loadFamilies(); // pentru select-uri + Admin UI
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
    if (b.dataset.tab === "drillfamilies") loadDashboard();
    if (b.dataset.tab === "admin") {
      loadAdmin();
      loadFamilies();
    }
    if (b.dataset.tab === "tables") loadTableAll();
    if (b.dataset.tab === "profile") loadProfile();
  });
});

// ===== SSE (live) =====
let es;
function connectSSE() {
  if (es) { try { es.close(); } catch {} }
  es = new EventSource("/events");
  es.addEventListener("taxe:new", () => {
    loadTaxe();
    loadDashboard();
    loadTableAll();
    loadProfile();
    loadAdmin();
  });
  es.addEventListener("drill:new", () => {
    loadDrill();
    loadDashboard();
    loadTableAll();
    loadProfile();
    loadAdmin();
  });
  es.addEventListener("ping", () => {});
}

// ===== Taxe (ACTIVE 4h) =====
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
        suma = "50.000$";
      }
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="font-mono left">${row.cnp}</td><td>${suma}</td><td>${
        row.remaining || ""
      }</td><td class="left">${row.user || "-"}</td>`;
      tbody.appendChild(tr);
    });
}

// ===== Burghiu (mini listă în tab-ul Taxe) =====
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
  loadProfile();
});

let drillCache = [];
async function loadDrill() {
  // serverul nu mai limitează; mini-tabelul păstrează doar 5 ultime vizual
  const r = await api("/drill");
  if (!r.ok) return;
  drillCache = await r.json();
  renderDrill(drillCache.slice(0, 5));
}
function renderDrill(list) {
  const tbody = $("#drillTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  (list || []).forEach((j) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="font-mono left">${j.cnp}</td>
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

// ===== Statistici Taxe + Statistici Familii =====
$("#dashPeriod")?.addEventListener("change", loadDashboard);
$("#dashWeekPicker")?.addEventListener("change", loadDashboard);
$("#bfPeriod")?.addEventListener("change", loadDashboard);
$("#bfWeekPicker")?.addEventListener("change", loadDashboard);

async function loadDashboard() {
  const dashPeriod = $("#dashPeriod")?.value || "week";
  let dashYear, dashWeek;
  try {
    if (dashPeriod === "week" && $("#dashWeekPicker")?.value)
      ({ year: dashYear, week: dashWeek } = JSON.parse($("#dashWeekPicker").value));
  } catch {}

  const taxParams =
    dashPeriod === "all"
      ? "scope=history&period=all"
      : dashYear && dashWeek
      ? `scope=history&year=${dashYear}&week=${dashWeek}`
      : "scope=history";

  let clean = 0, dirty = 0;
  const daily = Array.from({ length: 7 }, (_, i) => ({
    day: dayNames[i], count: 0, clean: 0, dirty: 0, totalDirtyAll: 0,
  }));

  const rT = await api(`/taxe?${taxParams}`);
  let taxe = [];
  if (rT.ok) taxe = await rT.json();

  taxe.forEach((t) => {
    const created = t.createdAt ? new Date(t.createdAt) : new Date();
    if (dashPeriod === "week" && dashYear && dashWeek && !inISOWeek(created, dashYear, dashWeek))
      return;
    if (t.tip === "Bani curați") clean += 40000;
    else if (t.tip === "Bani murdari") dirty += 50000;
    const wd = (created.getDay() + 6) % 7;
    const row = daily[wd];
    row.count += 1;
    if (t.tip === "Bani curați") row.clean += 40000;
    if (t.tip === "Bani murdari") row.dirty += 50000;
    row.totalDirtyAll = row.dirty + toDirty(row.clean);
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
      )}</td><td>${money(d.dirty)}</td><td>${money(d.totalDirtyAll)}</td>`;
      dBody.appendChild(tr);
    });
  }

  const topTaxBody = $("#topCnpTaxe tbody");
  if (topTaxBody) {
    topTaxBody.innerHTML = "";
    const counts = new Map();
    taxe.forEach((t) => {
      const created = t.createdAt ? new Date(t.createdAt) : new Date();
      if (dashPeriod === "week" && dashYear && dashWeek && !inISOWeek(created, dashYear, dashWeek))
        return;
      const u = t.user || "-";
      counts.set(u, (counts.get(u) || 0) + 1);
    });
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([u, c]) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="left">${u}</td><td>${c}</td>`;
        topTaxBody.appendChild(tr);
      });
  }

  const bfPeriod = $("#bfPeriod")?.value || "week";
  let bfYear, bfWeek;
  try {
    if (bfPeriod === "week" && $("#bfWeekPicker")?.value)
      ({ year: bfYear, week: bfWeek } = JSON.parse($("#bfWeekPicker").value));
  } catch {}

  const drillParams =
    bfPeriod === "all"
      ? "period=all"
      : bfYear && bfWeek
      ? `year=${bfYear}&week=${bfWeek}`
      : "";

  const famBody = $("#bfTable tbody");
  const rD = await api(`/drill${drillParams ? `?${drillParams}` : ""}`);
  let jobs = [];
  if (rD.ok) jobs = await rD.json();

  const jobsFilt =
    bfPeriod === "all" || !(bfYear && bfWeek)
      ? jobs
      : jobs.filter((j) => {
          const dt = j.createdAt ? new Date(j.createdAt) : new Date();
          return inISOWeek(dt, bfYear, bfWeek);
        });

  const famAgg = new Map();
  jobsFilt.forEach((j) => {
    const fam = j.family || "(fără)";
    const prev = famAgg.get(fam) || {
      cadru: 0, teava: 0, mecanism: 0, fixare: 0, total: 0, totalMoney: 0,
    };
    prev.cadru += j.cadru;
    prev.teava += j.teava;
    prev.mecanism += j.mecanism;
    prev.fixare += j.fixare;
    const pieces = j.cadru + j.teava + j.mecanism + j.fixare;
    prev.total += pieces;
    prev.totalMoney += j.costTotal || 0;
    famAgg.set(fam, prev);
  });

  if (famBody) {
    famBody.innerHTML = "";
    [...famAgg.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([fam, agg]) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="left">${fam}</td><td>${agg.cadru}</td><td>${agg.teava}</td><td>${agg.mecanism}</td><td>${agg.fixare}</td><td>${agg.total}</td><td>${money(agg.totalMoney)}</td>`;
        famBody.appendChild(tr);
      });

    const bfSearch = $("#bfSearch");
    if (bfSearch && !bfSearch._bound) {
      bfSearch.addEventListener("input", (e) => {
        const q = (e.target.value || "").toLowerCase();
        [...$("#bfTable tbody").rows].forEach((tr) => {
          const name = (tr.cells[0]?.textContent || "").toLowerCase();
          tr.style.display = name.includes(q) ? "" : "none";
        });
      });
      bfSearch._bound = true;
    }
  }

  const bfDailyBody = $("#bfDailyTable tbody");
  if (bfDailyBody) {
    const daily2 = Array.from({ length: 7 }, (_, i) => ({
      day: dayNames[i], count: 0, clean: 0, dirty: 0, total: 0,
    }));
    jobsFilt.forEach((j) => {
      const created = j.createdAt ? new Date(j.createdAt) : new Date();
      const wd = (created.getDay() + 6) % 7;
      daily2[wd].count += 1;
      const murdar = j.costTotal || 0;
      daily2[wd].dirty += murdar;
      daily2[wd].total = daily2[wd].dirty + daily2[wd].clean;
    });

    bfDailyBody.innerHTML = "";
    daily2.forEach((d) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="left">${d.day}</td><td>${d.count}</td><td>${money(
        d.clean
      )}</td><td>${money(d.dirty)}</td><td>${money(d.total)}</td>`;
      bfDailyBody.appendChild(tr);
    });
  }

  const topMatBody = $("#topDrillUsers tbody");
  const topEntBody = $("#topDrillEntries tbody");
  if (topMatBody && topEntBody) {
    const materials = new Map();
    const entries = new Map();

    jobsFilt.forEach((j) => {
      const u = j.user || "-";
      const pieces = j.cadru + j.teava + j.mecanism + j.fixare;
      materials.set(u, (materials.get(u) || 0) + pieces);
      entries.set(u, (entries.get(u) || 0) + 1);
    });

    topMatBody.innerHTML = "";
    [...materials.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([u, total]) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="left">${u}</td><td>${total}</td>`;
        topMatBody.appendChild(tr);
      });

    topEntBody.innerHTML = "";
    [...entries.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([u, total]) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="left">${u}</td><td>${total}</td>`;
        topEntBody.appendChild(tr);
      });
  }
}

// ===== Admin =====
$("#admPeriod")?.addEventListener("change", () => { admPage = 1; loadAdmin(); });
$("#weekSelect")?.addEventListener("change", () => { admPage = 1; loadAdmin(); });

let admPage = 1;
let admPages = 1;

async function loadAdmin() {
  const period = $("#admPeriod")?.value || "week";
  let url = "/admin/stats";
  let usePaging = false;
  if (period === "all") {
    // numai aici păstrăm paginația de 50 (serverul setează X-Pages/X-Page)
    usePaging = true;
    url = `/admin/stats?period=all&limit=50&page=${admPage}`;
  } else if ($("#weekSelect")?.value) {
    const { year, week } = JSON.parse($("#weekSelect").value);
    url = `/admin/stats?year=${year}&week=${week}`;
  }

  const r = await api(url);
  const tbody = $("#admTable tbody");
  if (!tbody) return;
  if (r.status === 403) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-slate-400">Acces doar pentru ADMIN/HEAD_OPERATOR/AUDIT.</td></tr>`;
    $("#admPager")?.classList.add("hidden");
    return;
  }
  if (usePaging) {
    admPages = parseInt(r.headers.get("X-Pages") || "1", 10) || 1;
    admPage = parseInt(r.headers.get("X-Page") || `${admPage}`, 10) || admPage;
  } else {
    admPages = 1;
    admPage = 1;
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

  const pager = $("#admPager");
  if (pager) {
    if (usePaging) {
      pager.classList.remove("hidden");
      $("#admPageInfo").textContent = `Pagina ${admPage} / ${admPages}`;
      $("#admPrev").disabled = admPage <= 1;
      $("#admNext").disabled = admPage >= admPages;
    } else {
      pager.classList.add("hidden");
    }
  }
}

$("#admPrev")?.addEventListener("click", () => {
  if (admPage > 1) { admPage--; loadAdmin(); }
});
$("#admNext")?.addEventListener("click", () => {
  if (admPage < admPages) { admPage++; loadAdmin(); }
});

// ===== Tabele All =====
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

  const baseParams =
    period === "all"
      ? "scope=history&period=all"
      : tblYear && tblWeek
      ? `scope=history&year=${tblYear}&week=${tblWeek}`
      : "scope=history";

  if (type === "taxe") {
    head.innerHTML = `<tr><th class="left">CNP</th><th>Sumă</th><th>Timp rămas</th><th class="left">User</th><th class="left">Familie</th><th>Creat</th>${canDelete ? "<th>Șterge</th>" : ""}</tr>`;
    const r = await api(`/taxe?${baseParams}`);
    if (!r.ok) return;
    const list = await r.json();

    list
      .filter((x) => !filterUser || (x.user || "").toLowerCase().includes(filterUser))
      .filter((x) => !filterCnp || (x.cnp || "").toLowerCase().includes(filterCnp))
      .filter((x) => !filterFam || (x.gratisFamilie || "").toLowerCase().includes(filterFam))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .forEach((x) => {
        const suma =
          x.tip === "GRATIS" ? "GRATIS" : x.tip === "Bani curați" ? "40.000$" : "50.000$";
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="font-mono left">${x.cnp}</td><td>${suma}</td><td>${
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
    head.innerHTML = `<tr><th class="left">CNP</th><th class="left">Familie</th><th>Cadru</th><th>Țeavă</th><th>Mecanism</th><th>Fixare</th><th>Plată</th><th>Valoare</th><th class="left">User</th><th>Creat</th>${canDelete ? "<th>Șterge</th>" : ""}</tr>`;

    const params =
      period === "all"
        ? "period=all"
        : tblYear && tblWeek
        ? `year=${tblYear}&week=${tblWeek}`
        : "";
    const r = await api(`/drill${params ? `?${params}` : ""}`);
    if (!r.ok) return;
    const list = await r.json();

    list
      .filter((x) => !filterUser || (x.user || "").toLowerCase().includes(filterUser))
      .filter((x) => !filterCnp || (x.cnp || "").toLowerCase().includes(filterCnp))
      .filter((x) => !filterFam || (x.family || "").toLowerCase().includes(filterFam))
      .forEach((j) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td class="font-mono left">${j.cnp}</td><td class="left">${
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

// ===== Profile (MEU) — KPI-uri separate și Total split în murdari =====
$("#profPeriod")?.addEventListener("change", loadProfile);
$("#profWeekPicker")?.addEventListener("change", loadProfile);

async function loadProfile() {
  const period = $("#profPeriod")?.value || "week";
  let selYear, selWeek;
  try {
    if (period === "week" && $("#profWeekPicker")?.value)
      ({ year: selYear, week: selWeek } = JSON.parse($("#profWeekPicker").value));
  } catch {}

  const taxParams =
    period === "all"
      ? "scope=history&period=all&mine=1"
      : selYear && selWeek
      ? `scope=history&mine=1&year=${selYear}&week=${selWeek}`
      : "scope=history&mine=1";

  const drillParams =
    period === "all"
      ? "mine=1&period=all"
      : selYear && selWeek
      ? `mine=1&year=${selYear}&week=${selWeek}`
      : "mine=1";

  let cleanTax = 0, dirtyTax = 0, pieces = 0, drillMoney = 0, taxesCount = 0;

  const daily = Array.from({ length: 7 }, (_, i) => ({
    day: dayNames[i], count: 0, clean: 0, dirty: 0,
  }));

  const rT = await api(`/taxe?${taxParams}`);
  if (rT.ok) {
    const taxe = await rT.json();
    taxe.forEach((t) => {
      const created = t.createdAt ? new Date(t.createdAt) : new Date();
      const wd = (created.getDay() + 6) % 7;
      if (t.tip === "Bani curați") {
        cleanTax += 40000;
        daily[wd].clean += 40000;
        daily[wd].count++;
        taxesCount++;
      }
      if (t.tip === "Bani murdari") {
        dirtyTax += 50000;
        daily[wd].dirty += 50000;
        daily[wd].count++;
        taxesCount++;
      }
    });
  }

  const rD = await api(`/drill?${drillParams}`);
  if (rD.ok) {
    const jobs = await rD.json();
    jobs.forEach((j) => {
      const p = j.cadru + j.teava + j.mecanism + j.fixare;
      pieces += p;
      drillMoney += j.costTotal || 0;
    });
  }

  $("#profTaxClean").textContent = money(cleanTax);
  $("#profTaxDirty").textContent = money(dirtyTax);
  $("#profDrillDirty").textContent = money(drillMoney);
  $("#profTaxCount").textContent = (taxesCount || 0).toLocaleString("ro-RO");
  $("#profDrillPieces").textContent = (pieces || 0).toLocaleString("ro-RO");

  const body = $("#profDailyTable tbody");
  if (body) {
    body.innerHTML = "";
    daily.forEach((d) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="left">${d.day}</td><td>${d.count}</td><td>${money(
        d.clean
      )}</td><td>${money(d.dirty)}</td>`;
      body.appendChild(tr);
    });
  }

  const totalDirtyConverted = dirtyTax + drillMoney + toDirty(cleanTax);
  const userAllDirty = totalDirtyConverted * 0.5;
  const famAllDirty = totalDirtyConverted * 0.5;

  const userClean = cleanTax * 0.5, famClean = cleanTax * 0.5;
  const userDirty = (dirtyTax + drillMoney) * 0.5, famDirty = (dirtyTax + drillMoney) * 0.5;

  $("#splitCleanUser").textContent = money(userClean);
  $("#splitCleanFam").textContent = money(famClean);
  $("#splitCleanTot").textContent = money(cleanTax);

  $("#splitDirtyUser").textContent = money(userDirty);
  $("#splitDirtyFam").textContent = money(famDirty);
  $("#splitDirtyTot").textContent = money(dirtyTax + drillMoney);

  $("#splitAllUser").textContent = money(userAllDirty);
  $("#splitAllFam").textContent = money(famAllDirty);
  $("#splitAllTot").textContent = money(totalDirtyConverted);
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

// ===== Families (Admin + select-uri dinamice) =====
let familiesCache = [];

async function loadFamilies() {
  try {
    const r = await api("/families");
    if (!r.ok) throw 0;
    familiesCache = await r.json();
    renderFamiliesAdminTable(familiesCache);
    populateFamilySelects(familiesCache);
  } catch {
    familiesCache = [];
    renderFamiliesAdminTable([]);
  }
}

function populateFamilySelects(list = []) {
  const fill = (sel) => {
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = `<option value="" disabled ${prev ? "" : "selected"}>Alege…</option>`;
    list
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((f) => {
        const opt = document.createElement("option");
        opt.value = f.name;
        opt.textContent = f.name;
        sel.appendChild(opt);
      });
    if (prev) sel.value = prev;
  };
  fill(document.getElementById("drillFamily"));
  fill(document.querySelector('[name="gratisFamilie"]'));
}

function renderFamiliesAdminTable(list = []) {
  const tbody = document.querySelector("#familiesTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  // Row pentru adăugare
  const addTr = document.createElement("tr");
  addTr.innerHTML = `
    <td class="left">
      <input type="text" id="famAddName" class="input" placeholder="Nume familie"/>
    </td>
    <td>
      <input type="number" value="0" class="input" disabled style="width:80px"/>
    </td>
    <td>
      <input type="number" value="0" class="input" disabled style="width:80px"/>
    </td>
    <td>
      <button class="sm" id="famAddBtn">Adaugă</button>
    </td>
  `;
  tbody.appendChild(addTr);

  list
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((f) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="left">${f.name}</td>
        <td><input type="number" min="0" max="100" value="${f.discountDrill ?? 0}" data-fid="${f.id}" data-k="discountDrill" style="width:80px"/></td>
        <td><input type="number" min="0" max="100" value="${f.discountTax ?? 0}" data-fid="${f.id}" data-k="discountTax" style="width:80px"/></td>
        <td>
          <button class="sm" data-save="${f.id}">Salvează</button>
          <button class="sm danger" data-del="${f.id}">Șterge</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

  if (!tbody._bound) {
    tbody.addEventListener("click", async (e) => {
      // Add family
      if (e.target.id === "famAddBtn") {
        const inp = document.getElementById("famAddName");
        const name = (inp?.value || "").trim();
        if (!name) return alert("Introdu numele familiei.");
        try {
          const r = await api("/families", { method: "POST", body: JSON.stringify({ name }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return alert(j.error || "Eroare la creare");
          alert("Familie adăugată.");
          loadFamilies();
        } catch {
          alert("Eroare la creare");
        }
        return;
      }

      const btnSave = e.target.closest("[data-save]");
      if (btnSave) {
        const id = btnSave.getAttribute("data-save");
        const rowInputs = [...tbody.querySelectorAll(`input[data-fid="${id}"]`)];
        const payload = {};
        rowInputs.forEach((inp) => {
          const k = inp.getAttribute("data-k");
          const v = Math.max(0, Math.min(100, parseInt(inp.value || 0)));
          payload[k] = v;
          inp.value = v;
        });
        try {
          const r = await api(`/families/${id}/discounts`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return alert(j.error || "Eroare la salvare");
          alert("Salvat");
          loadFamilies();
        } catch {
          alert("Eroare la salvare");
        }
        return;
      }

      const btnDel = e.target.closest("[data-del]");
      if (btnDel) {
        const id = btnDel.getAttribute("data-del");
        if (!confirm("Sigur vrei să ștergi această familie? (nu afectează istoricul)")) return;
        try {
          const r = await api(`/families/${id}`, { method: "DELETE" });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return alert(j.error || "Eroare la ștergere");
          alert("Familie ștearsă.");
          loadFamilies();
        } catch {
          alert("Eroare la ștergere");
        }
      }
    });
    tbody._bound = true;
  }
}

// ===== Init =====
hydrateMe();
setTabs("taxe");
