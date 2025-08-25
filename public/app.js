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

    // OPERATOR: DOAR Taxe & Burghiu + My profile
    if (me.role === "OPERATOR") {
      show("taxe", true);
      show("profile", true);
      show("dashboard", false);
      show("drillfamilies", false);
      show("tables", false);
      show("admin", false);
    } else {
      show("taxe", true);
      show("profile", true);
      show("dashboard", true);
      show("drillfamilies", true);
      show("tables", true);
      show("admin", me.role === "ADMIN" || me.role === "HEAD_OPERATOR" || me.role === "AUDIT");
    }

    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");
    setTabs("taxe");

    // Populare săptămâni (33..53) peste tot
    ["dashWeekPicker", "bfWeekPicker", "weekSelect", "tblWeekPicker", "profWeekPicker"].forEach(
      (id) => fillWeeks33toEnd(document.getElementById(id))
    );

    // încărcări inițiale
    loadTaxe();     // active (4h)
    loadDrill();    // ultimele joburi (grupate pe CNP/familie)
    loadDashboard();// statistici taxe + familii (dashboard)
    loadProfile();  // profil
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
    try { es.close(); } catch {}
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
  loadProfile();
});

let drillCache = [];
async function loadDrill() {
  const r = await api("/drill");
  if (!r.ok) return;
  drillCache = await r.json();
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

  // ====== TAXE: luăm history (+ active dacă serverul vechi nu include) și DEDUP pe id ======
  let taxAll = [];
  // încercăm să cerem istoric filtrat direct, dar pentru compatibilitate adăugăm și active
  const taxUrls = [
    dashPeriod === "all"
      ? "/taxe?scope=history&period=all"
      : dashYear && dashWeek
      ? `/taxe?scope=history&year=${dashYear}&week=${dashWeek}`
      : "/taxe?scope=history",
    "/taxe?scope=active",
  ];
  for (const u of taxUrls) {
    const r = await api(u);
    if (r.ok) taxAll = taxAll.concat(await r.json());
  }
  // dedup pe id (evită dubluri între active + history)
  const seen = new Set();
  taxAll = taxAll.filter((x) => (seen.has(x.id) ? false : seen.add(x.id)));

  let clean = 0, dirty = 0;
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
      daily[(created.getDay() + 6) % 7].clean += 40000;
    } else if (t.tip === "Bani murdari") {
      dirty += 60000;
      daily[(created.getDay() + 6) % 7].dirty += 60000;
    }
    daily[(created.getDay() + 6) % 7].count += 1;
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

  // ====== DRILL: agregate pe familii (Dashboard + tab Statistici Familii) ======
  await renderFamiliesAggregates(dashPeriod, dashYear, dashWeek);
}

// Agregare drill pe familii + populare Dashboard & BF tab
async function renderFamiliesAggregates(period, year, week) {
  // cerem /drill cu filtrare server-side dacă e posibil
  let url = "/drill";
  if (period === "all") url = "/drill?period=all";
  else if (year && week) url = `/drill?year=${year}&week=${week}`;

  const r = await api(url);
  const jobs = r.ok ? await r.json() : [];

  // dacă serverul nu a filtrat, aplicăm local
  const jobsFilt = jobs.filter((j) => {
    if (period === "all") return true;
    if (!year || !week) return true;
    const dt = j.createdAt ? new Date(j.createdAt) : new Date();
    return inISOWeek(dt, year, week);
  });

  // total piese (pt. stat din dashboard)
  let totalPieces = 0;

  // agregare pe familie
  const famAgg = new Map(); // fam -> {cadru, teava, mecanism, fixare, total}
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

  // scriem totalul de piese în dashboard
  $("#statDrillPieces").textContent = (totalPieces || 0).toLocaleString("ro-RO");

  // Dashboard: tabel familii
  const famBodyDash = $("#drillFamiliesTable tbody");
  if (famBodyDash) {
    famBodyDash.innerHTML = "";
    [...famAgg.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([fam, agg]) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="left">${fam}</td>
          <td>${agg.cadru}</td>
          <td>${agg.teava}</td>
          <td>${agg.mecanism}</td>
          <td>${agg.fixare}</td>
          <td>${agg.total}</td>
        `;
        famBodyDash.appendChild(tr);
      });

    // filtru text pe Dashboard (o singură legare)
    const famSearch = $("#famSearch");
    if (famSearch && !famSearch._bound) {
      famSearch.addEventListener("input", (e) => {
        const q = (e.target.value || "").toLowerCase();
        [...$("#drillFamiliesTable tbody").rows].forEach((tr) => {
          const name = (tr.cells[0]?.textContent || "").toLowerCase();
          tr.style.display = name.includes(q) ? "" : "none";
        });
      });
      famSearch._bound = true;
    }
  }

  // Tab „Statistici Familii” (bfTable)
  const bfBody = $("#bfTable tbody");
  if (bfBody) {
    bfBody.innerHTML = "";
    [...famAgg.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([fam, agg]) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="left">${fam}</td>
          <td>${agg.cadru}</td>
          <td>${agg.teava}</td>
          <td>${agg.mecanism}</td>
          <td>${agg.fixare}</td>
          <td>${agg.total}</td>
        `;
        bfBody.appendChild(tr);
      });

    // filtru text pe BF (o singură legare)
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

    // combinăm history + active și DEDUP pe id
    let list = [];
    const rH = await api(`/taxe?scope=history${baseParams ? `&${baseParams}` : ""}`);
    if (rH.ok) list = list.concat(await rH.json());
    const rA = await api("/taxe?scope=active");
    if (rA.ok) list = list.concat(await rA.json());

    const seen = new Set();
    list = list.filter((x) => (seen.has(x.id) ? false : seen.add(x.id)));

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
    pieces: 0,
  }));

  // Taxele MELE (active + history) + dedup
  let myTaxes = [];
  for (const u of taxUrls) {
    const r = await api(u);
    if (r.ok) myTaxes = myTaxes.concat(await r.json());
  }
  const seen = new Set();
  myTaxes = myTaxes.filter((x) => (seen.has(x.id) ? false : seen.add(x.id)));

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
      daily[(created.getDay() + 6) % 7].pieces += p;
    });
  }

  $("#profClean").textContent = money(clean);
  $("#profDirty").textContent = money(dirty + drillMoney);
  $("#profPieces").textContent = (pieces || 0).toLocaleString("ro-RO");
  $("#profDrillMoney").textContent = money(drillMoney);

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
