// ===== Utilities =====
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
const show = (el, v) => el.classList.toggle("hidden", !v);
const fmt = (n) => (typeof n === "number" ? n.toLocaleString("ro-RO") : n);
const toast = (msg, ms = 2000) => {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), ms);
};

// ===== Tabs =====
const tabs = {
  taxe: $("#tab-taxe"),
  drill: $("#tab-drill"),
  dashboard: $("#tab-dashboard"),
  admin: $("#tab-admin"),
};
function setActive(tab) {
  $$(".tab").forEach((el) => el.classList.remove("active"));
  tabs[tab].classList.add("active");
}
$$("nav button[data-tab]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const tab = btn.dataset.tab;
    setActive(tab);
    if (tab === "taxe") {
      await loadTaxe();
    } else if (tab === "drill") {
      await loadDrill();
      await loadFamiliesIntoSelect();
    } else if (tab === "dashboard") {
      await loadDashboard();
    } else if (tab === "admin") {
      await loadAdminStats();
    }
  });
});

// ===== Auth (minimal în această pagină – login/register sunt pe altă pagină sau prin API tools externe) =====
$("#logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("token");
  location.reload();
});

// ===== TAXE =====
const metodaSelect = $("#metodaSelect");
const gratisSelect = $("#gratisSelect");

metodaSelect.addEventListener("change", () => {
  const showGratis = metodaSelect.value === "gratis";
  gratisSelect.style.display = showGratis ? "block" : "none";
  if (!showGratis) gratisSelect.value = "";
});

$("#taxeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const cnp = (f.cnp.value || "").trim();
  if (!/^\d{1,6}$/.test(cnp)) return toast("CNP invalid (max 6 cifre).");

  const body = {
    cnp,
    metoda: f.metoda.value,
  };
  if (f.metoda.value === "gratis") {
    if (!f.gratisFamilie.value) return toast("Alege familia pentru Gratis.");
    body.gratisFamilie = f.gratisFamilie.value;
  }

  const r = await api("/taxe", { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) return toast(j.error || "Eroare la salvare.");
  toast("Taxă adăugată.");
  f.reset();
  metodaSelect.dispatchEvent(new Event("change"));
  await loadTaxe();
});

async function loadTaxe() {
  const r = await api("/taxe");
  const data = await r.json();
  const tbody = $("#taxeTable tbody");
  tbody.innerHTML = "";
  (data || []).forEach((row) => {
    // afișare în format cerut: CNP | 40.000$ curat | Timp (hh/mm/ss)
    let suma = "";
    if (row.tip === "Bani curați") suma = "40.000$ curat";
    else if (row.tip === "Bani murdari") suma = "60.000$ murdar";
    else if (row.tip === "Oțel") suma = "15 buc oțel";
    else if (row.tip === "Praf de pușcă") suma = "25 buc praf";
    else suma = row.tip;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.cnp}</td>
      <td>${suma}</td>
      <td>${row.remaining || ""}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== BURGHIU =====
async function loadFamiliesIntoSelect() {
  const sel = $("#drillForm select[name='family']");
  // dacă backend-ul are endpoint /families, îl folosim; dacă nu, păstrează opțiunile implicite
  try {
    const r = await api("/families");
    if (!r.ok) return;
    const fams = await r.json();
    sel.innerHTML = `<option value="">Fără familie</option>` + (fams || []).map(f => `<option value="${f.name}">${f.name}</option>`).join("");
  } catch {}
}

$("#drillForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const cnp = (f.cnp.value || "").trim();
  const quantity = Number(f.quantity.value || 0);
  const part = f.part.value;
  const family = f.family.value || null;

  if (!/^\d{1,6}$/.test(cnp)) return toast("CNP invalid (max 6 cifre).");
  if (!part) return toast("Alege piesa.");
  if (!(quantity > 0)) return toast("Cantitate > 0.");

  const body = { cnp, part, quantity, family, cashType: "DIRTY" }; // mereu Bani murdari
  const r = await api("/drill", { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) return toast(j.error || "Eroare la burghiu.");
  toast("Job adăugat.");
  f.reset();
  await loadDrill();
});

async function loadDrill() {
  const r = await api("/drill");
  const data = await r.json();
  const tbody = $("#drillTable tbody");
  tbody.innerHTML = "";
  (data || []).forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.cnp}</td>
      <td>${row.family || "-"}</td>
      <td>${row.cadru}</td>
      <td>${row.teava}</td>
      <td>${row.mecanism}</td>
      <td>${row.fixare}</td>
      <td>${row.metoda || row.metodaPlata || "Bani murdari"}</td>
      <td>${fmt(row.total || row.costTotal || 0)} $</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== DASHBOARD =====
async function loadDashboard() {
  const dashTaxe = $("#dashTaxe");
  const dashDrill = $("#dashDrill");
  if (dashTaxe) {
    const r = await api("/taxe");
    const data = await r.json();
    dashTaxe.innerHTML = "";
    (data || []).forEach((t) => {
      const li = document.createElement("li");
      const sum =
        t.tip === "Bani curați" ? "40.000$ curat" :
        t.tip === "Bani murdari" ? "60.000$ murdar" :
        t.tip === "Oțel" ? "15 buc oțel" :
        t.tip === "Praf de pușcă" ? "25 buc praf" : t.tip;
      li.textContent = `${t.cnp} | ${sum} | ${t.remaining || ""}`;
      dashTaxe.appendChild(li);
    });
  }

  if (dashDrill) {
    const r2 = await api("/drill");
    const jobs = await r2.json();
    dashDrill.innerHTML = "";
    (jobs || []).forEach((j) => {
      const li = document.createElement("li");
      li.innerHTML =
        `<div>${j.cnp} | ${j.family || "-"}</div>` +
        `<div class="mono small">Cadru ${j.cadru} | Țeavă ${j.teava} | Mecanism ${j.mecanism} | Fixare ${j.fixare} — total: ${fmt(j.total || j.costTotal || 0)}$</div>`;
      dashDrill.appendChild(li);
    });
  }

  // Charts (opțional): încearcă să încarci /admin/stats pentru totaluri pe user & /drill pentru familii
  if (window.Chart) {
    await drawFamiliesChart();
    await drawWeeklyChart();
  }
}

// Chart: producție per familie (din /drill, grupat local)
async function drawFamiliesChart() {
  const canvas = $("#chartFamilies");
  if (!canvas || !window.Chart) return;
  try {
    const r = await api("/drill");
    const jobs = await r.json();
    const map = new Map(); // family -> total processed
    (jobs || []).forEach((j) => {
      const key = j.family || "(fără)";
      const prev = map.get(key) || 0;
      map.set(key, prev + (j.cadru + j.teava + j.mecanism + j.fixare));
    });
    const labels = [...map.keys()];
    const data = [...map.values()];

    if (canvas._chart) canvas._chart.destroy();
    canvas._chart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: { labels, datasets: [{ label: "Burghiu (buc)", data }] },
      options: { responsive: true, plugins: { legend: { display: false } } },
    });
  } catch {}
}

// Chart: sume săptămânale (dacă există /stats/operator, îl folosim; altfel, calc local din /drill)
async function drawWeeklyChart() {
  const canvas = $("#chartWeekly");
  if (!canvas || !window.Chart) return;

  // încearcă /stats/operator
  try {
    const r = await api("/stats/operator");
    if (r.ok) {
      const j = await r.json();
      const labels = (j.weekly || []).map((w) => `W${w.week}`);
      const data = (j.weekly || []).map((w) => w.total);
      if (canvas._chart) canvas._chart.destroy();
      canvas._chart = new Chart(canvas.getContext("2d"), {
        type: "line",
        data: { labels, datasets: [{ label: "Bani murdari / săpt.", data, tension: 0.3 }] },
        options: { responsive: true, plugins: { legend: { display: false } } },
      });
      return;
    }
  } catch {}

  // fallback: calculează din /drill (total bani murdari per săptămână)
  try {
    const r2 = await api("/drill");
    const jobs = await r2.json();
    const wkMap = new Map(); // YYYY-W -> sum
    (jobs || []).forEach((j) => {
      const d = new Date(j.createdAt || Date.now());
      const wk = isoWeekKey(d);
      const sum = (j.total || j.costTotal || (j.processed || 0) * (j.unitPrice || 1000));
      wkMap.set(wk, (wkMap.get(wk) || 0) + (sum || 0));
    });
    const labels = [...wkMap.keys()].sort();
    const data = labels.map((k) => wkMap.get(k));

    if (canvas._chart) canvas._chart.destroy();
    canvas._chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: { labels, datasets: [{ label: "Bani murdari / săpt.", data, tension: 0.3 }] },
      options: { responsive: true, plugins: { legend: { display: false } } },
    });
  } catch {}
}

function isoWeekKey(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${weekNo}`;
}

// ===== ADMIN STATS =====
let adminStatsCache = [];
async function loadAdminStats() {
  const tbody = $("#admTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "<tr><td colspan='4'>Încărcare…</td></tr>";
  const r = await api("/admin/stats");
  if (r.status === 403) {
    tbody.innerHTML = "<tr><td colspan='4'>Doar ADMIN are acces la acest tab.</td></tr>";
    return;
  }
  const data = await r.json();
  adminStatsCache = Array.isArray(data) ? data : [];
  renderAdminStats();
}
function renderAdminStats() {
  const tbody = $("#admTable tbody");
  tbody.innerHTML = "";
  adminStatsCache.forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.user}</td>
      <td>${fmt(u.taxe)} $</td>
      <td>${fmt(u.drill)} $</td>
      <td><b>${fmt(u.total)} $</b></td>
    `;
    tbody.appendChild(tr);
  });
}
$("#searchInput")?.addEventListener("input", (e) => {
  const q = (e.target.value || "").toLowerCase();
  const filtered = adminStatsCache.filter(
    (x) => (x.user || "").toLowerCase().includes(q) || ("" + x.total).includes(q)
  );
  const tbody = $("#admTable tbody");
  tbody.innerHTML = "";
  filtered.forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.user}</td>
      <td>${fmt(u.taxe)} $</td>
      <td>${fmt(u.drill)} $</td>
      <td><b>${fmt(u.total)} $</b></td>
    `;
    tbody.appendChild(tr);
  });
});

// ===== Bootstrap =====
(async function init() {
  // Ascunde tab-ul Admin by default (îl vom afișa dacă userul e ADMIN)
  const adminBtn = $$("nav button[data-tab]").find((b) => b.dataset.tab === "admin");
  if (adminBtn) adminBtn.style.display = "none";

  // Încearcă să obții /auth/me
  try {
    const r = await api("/auth/me");
    if (r.ok) {
      const me = await r.json();
      // dacă este ADMIN, arată tab-ul Admin
      if (me.role === "ADMIN" && adminBtn) adminBtn.style.display = "";
    }
  } catch {}

  // setare tab default
  setActive("taxe");
  await loadTaxe();
})();
