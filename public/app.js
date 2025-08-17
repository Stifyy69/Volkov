// ========== Helpers ==========
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

// ========== Auth ==========
async function hydrateMe() {
  try {
    const r = await api("/auth/me");
    if (!r.ok) throw 0;
    const me = await r.json();
    $("#whoami").textContent = `${me.username} [${me.role}]`;
    // Admin tab only for ADMIN
    const adminBtn = $$(".tabbtn").find(b => b.dataset.tab === "admin");
    if (adminBtn) adminBtn.classList.toggle("hidden", me.role !== "ADMIN");
    $("#auth").classList.add("hidden");
    setTabs("taxe");
    loadTaxe();
    loadDrill();
  } catch {
    $("#auth").classList.remove("hidden");
    setTabs("taxe");
  }
}

$("#logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("token");
  location.reload();
});

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const r = await api("/auth/login", { method: "POST", body: JSON.stringify({ username: f.username.value, password: f.password.value })});
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Login eșuat");
  localStorage.token = j.token;
  hydrateMe();
});

$("#registerForm").addEventListener("submit", async (e) => {
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

// ========== Tabs ==========
$$(".tabbtn").forEach(b => {
  b.addEventListener("click", async () => {
    setTabs(b.dataset.tab);
    if (b.dataset.tab === "taxe")  loadTaxe();
    if (b.dataset.tab === "dashboard") loadDashboard();
    if (b.dataset.tab === "admin") loadAdmin();
  });
});

// ========== Taxe ==========
const metodaSelect = $("#metodaSelect");
const gratisWrap    = $("#gratisWrap");

metodaSelect.addEventListener("change", () => {
  const isGratis = metodaSelect.value === "gratis";
  gratisWrap.classList.toggle("hidden", !isGratis);
});

$("#taxeForm").addEventListener("submit", async (e) => {
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
  loadTaxe();
});

async function loadTaxe() {
  const r = await api("/taxe");
  if (!r.ok) return;
  const data = await r.json();
  const tbody = $("#taxeTable tbody");
  tbody.innerHTML = "";
  (data || []).forEach(row => {
    // Format cerut: CNP | 40.000$ curat | Timp (hh/mm)
    let suma = "";
    if (row.tip === "Bani curați")   suma = "40.000$ curat";
    else if (row.tip === "Bani murdari") suma = "60.000$ murdar";
    else if (row.tip === "Oțel")     suma = "15 buc oțel";
    else if (row.tip === "Praf de pușcă") suma = "25 buc praf";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="font-mono">${row.cnp}</td><td>${suma}</td><td>${row.remaining||""}</td>`;
    tbody.appendChild(tr);
  });
}

// reîmprospătare live a listelor
setInterval(() => {
  if (!$("#tab-taxe").classList.contains("hidden")) loadTaxe();
  if (!$("#tab-taxe").classList.contains("hidden")) loadDrill();
}, 20000);

// ========== Burghiu ==========
$("#drillForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const cnp = (f.cnp.value||"").trim();
  if (!/^\d{1,6}$/.test(cnp)) return alert("CNP invalid (max 6).");

  // doar bani murdari, 1000 $/buc
  const parts = [
    { key:"cadru",    val: Number(f.cadru.value||0) },
    { key:"teava",    val: Number(f.teava.value||0) },
    { key:"mecanism", val: Number(f.mecanism.value||0) },
    { key:"fixare",   val: Number(f.fixare.value||0) },
  ].filter(p => p.val > 0);

  if (parts.length === 0) return alert("Introdu minim o cantitate > 0.");

  // trimitem câte o cerere per componentă (ca să ții evidența corectă)
  for (const p of parts) {
    const body = {
      cnp,
      part: p.key,
      quantity: p.val,
      family: f.family.value || null,
      cashType: "DIRTY"
    };
    const r = await api("/drill", { method: "POST", body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return alert(j.error || `Eroare la ${p.key}`);
  }

  f.reset();
  loadDrill();
});

async function loadDrill() {
  const r = await api("/drill");
  if (!r.ok) return;
  const list = await r.json();
  const tbody = $("#drillTable tbody");
  tbody.innerHTML = "";
  (list || []).forEach(j => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="font-mono">${j.cnp}</td>
      <td>${j.family||"-"}</td>
      <td>${j.cadru}</td>
      <td>${j.teava}</td>
      <td>${j.mecanism}</td>
      <td>${j.fixare}</td>
      <td>Bani murdari</td>
      <td>${money(j.costTotal || 0)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ========== Dashboard ==========
let chartFamilies, chartWeekly;

async function loadDashboard() {
  try {
    // încercăm /stats/operator pentru totaluri și weekly
    const r = await api("/stats/operator");
    if (r.ok) {
      const s = await r.json();
      $("#statDirty").textContent = money(s.totals?.dirtyMoney || 0);
      $("#statKeep").textContent  = money(s.totals?.keep || 0);
      $("#statFam").textContent   = money(s.totals?.toFamily || 0);

      // weekly chart
      const labels = (s.weekly||[]).map(w => `W${w.week}`);
      const data   = (s.weekly||[]).map(w => w.total);
      drawWeekly(labels, data);
    }
  } catch {}

  // families chart din /drill (local)
  try {
    const r2 = await api("/drill");
    if (!r2.ok) return;
    const jobs = await r2.json();
    const map = new Map();
    jobs.forEach(j => {
      const k = j.family || "(fără)";
      map.set(k, (map.get(k)||0) + j.cadru + j.teava + j.mecanism + j.fixare);
    });
    drawFamilies([...map.keys()], [...map.values()]);
  } catch {}
}

function drawFamilies(labels, data) {
  const ctx = $("#chartFamilies").getContext("2d");
  if (chartFamilies) chartFamilies.destroy();
  chartFamilies = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Bucăți", data }] },
    options: { responsive: true, plugins: { legend: { display:false } } }
  });
}

function drawWeekly(labels, data) {
  const ctx = $("#chartWeekly").getContext("2d");
  if (chartWeekly) chartWeekly.destroy();
  chartWeekly = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ label: "Bani murdari", data, tension: 0.35 }] },
    options: { responsive: true, plugins: { legend: { display:false } } }
  });
}

// ========== Admin ==========
let adminRows = [];
async function loadAdmin() {
  const r = await api("/admin/stats");
  const tbody = $("#admTable tbody");
  if (r.status === 403) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-slate-400">Doar ADMIN are acces.</td></tr>`;
    return;
  }
  const list = await r.json();
  // avem doar counts din backend-ul tău; le transformăm în $ (opțional poți extinde endpointul)
  adminRows = (list||[]).map(u => ({
    user: u.username,
    taxe: u.taxeCount || 0,
    drill: u.drillCount || 0,
    total: (u.taxeCount||0) + (u.drillCount||0)
  }));
  renderAdmin(adminRows);
}

function renderAdmin(rows) {
  const tbody = $("#admTable tbody");
  tbody.innerHTML = "";
  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.user}</td><td>${r.taxe}</td><td>${r.drill}</td><td>${r.total}</td>`;
    tbody.appendChild(tr);
  });
}

$("#searchInput")?.addEventListener("input", (e) => {
  const q = (e.target.value||"").toLowerCase();
  const filtered = adminRows.filter(r => r.user.toLowerCase().includes(q));
  renderAdmin(filtered);
});

// ========== Init ==========
hydrateMe();
setTabs("taxe");
