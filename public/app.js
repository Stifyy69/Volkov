// ===== Helpers =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function fmtMoney(n) {
  if (n == null) return "0$";
  return n.toLocaleString("ro-RO") + "$";
}
function fmtDate(d) {
  return new Date(d).toLocaleString("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

// ===== Auth state =====
let token = localStorage.getItem("token");
let me = null;

// ===== Tabs =====
$$(".tabbtn").forEach((btn) => {
  btn.onclick = () => {
    $$(".tabbtn").forEach((b) => (b.dataset.active = "false"));
    btn.dataset.active = "true";
    $$(".tab").forEach((t) => t.classList.add("hidden"));
    $("#tab-" + btn.dataset.tab).classList.remove("hidden");

    if (btn.dataset.tab === "dashboard") loadDashboard();
    if (btn.dataset.tab === "drillfamilies") loadBF();
    if (btn.dataset.tab === "admin") loadAdmin();
    if (btn.dataset.tab === "tables") loadTables();
    if (btn.dataset.tab === "profile") loadProfile();
    if (btn.dataset.tab === "taxe") loadTaxe();
    if (btn.dataset.tab === "drill") loadDrill();
  };
});

// ===== Auth =====
$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const res = await fetch("/api/login", { method: "POST", body: fd });
  const data = await res.json();
  if (data.token) {
    token = data.token;
    localStorage.setItem("token", token);
    startApp();
  } else alert("Login failed");
};

$("#registerForm").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const res = await fetch("/api/register", { method: "POST", body: fd });
  const data = await res.json();
  if (data.ok) {
    alert("Cont creat, acum loghează-te");
  } else alert(data.error || "Eroare la înregistrare");
};

$("#logoutBtn").onclick = () => {
  token = null;
  localStorage.removeItem("token");
  location.reload();
};

// ===== Start App =====
async function startApp() {
  const res = await fetch("/api/me", {
    headers: { Authorization: "Bearer " + token },
  });
  if (!res.ok) {
    localStorage.removeItem("token");
    return;
  }
  me = await res.json();
  $("#whoami").textContent = me.username + " (" + me.role + ")";
  $("#auth").classList.add("hidden");
  $("#app").classList.remove("hidden");
  document.querySelector('[data-tab="taxe"]').click();
}
if (token) startApp();

// ===== Taxe =====
$("#taxeForm").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const res = await fetch("/api/taxe", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: fd,
  });
  if (res.ok) {
    e.target.reset();
    loadTaxe();
  } else alert("Eroare taxe");
};

async function loadTaxe() {
  const res = await fetch("/api/taxe", {
    headers: { Authorization: "Bearer " + token },
  });
  const rows = await res.json();
  const tb = $("#taxeTable tbody");
  tb.innerHTML = "";
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${r.cnp}</td>
      <td>${fmtMoney(r.suma)}</td>
      <td>${fmtDate(r.createdAt)}</td>
      <td class="left">${r.user}</td>`;
    tb.appendChild(tr);
  });
}
$("#taxSearch").oninput = () => {
  const val = $("#taxSearch").value.toLowerCase();
  $$("#taxeTable tbody tr").forEach((tr) => {
    tr.style.display = tr.textContent.toLowerCase().includes(val) ? "" : "none";
  });
};

// ===== Drill / Burghiu =====
$("#drillForm").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const res = await fetch("/api/drill", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: fd,
  });
  if (res.ok) {
    e.target.reset();
    loadDrill();
  } else alert("Eroare burghiu");
};

async function loadDrill() {
  const res = await fetch("/api/drill", {
    headers: { Authorization: "Bearer " + token },
  });
  const rows = await res.json();
  const tb = $("#drillTable tbody");
  tb.innerHTML = "";
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="left">${r.cnp}</td>
      <td class="left">${r.family}</td>
      <td>${r.cadru}</td><td>${r.teava}</td><td>${r.mecanism}</td><td>${r.fixare}</td>
      <td>${r.metoda}</td><td>${fmtMoney(r.cost)}</td>
      <td class="left">${r.user}</td>`;
    tb.appendChild(tr);
  });
}

// ===== Dashboard =====
async function loadDashboard() {
  await fillWeeks("#dashWeekPicker");
  const week = $("#dashWeekPicker").value;
  const mode = $("#dashPeriod").value;

  const res = await fetch(
    `/api/dashboard?period=${mode}&week=${week}`,
    { headers: { Authorization: "Bearer " + token } }
  );
  const d = await res.json();

  $("#statTaxClean").textContent = fmtMoney(d.taxClean);
  $("#statTaxDirty").textContent = fmtMoney(d.taxDirty);
  $("#statDrillPieces").textContent = d.drillPieces;

  const tb = $("#dashDailyTable tbody");
  tb.innerHTML = "";
  d.daily.forEach((x) => {
    tb.innerHTML += `<tr><td class="left">${x.day}</td><td>${x.count}</td><td>${fmtMoney(
      x.clean
    )}</td><td>${fmtMoney(x.dirty)}</td></tr>`;
  });

  const fb = $("#drillFamiliesTable tbody");
  fb.innerHTML = "";
  d.families.forEach((f) => {
    fb.innerHTML += `<tr><td class="left">${f.family}</td><td>${f.cadru}</td><td>${f.teava}</td><td>${f.mecanism}</td><td>${f.fixare}</td><td>${f.total}</td></tr>`;
  });
}
$("#dashPeriod").onchange = loadDashboard;
$("#dashWeekPicker").onchange = loadDashboard;

// ===== BF (Statistici Familii) =====
async function loadBF() {
  await fillWeeks("#bfWeekPicker");
  const week = $("#bfWeekPicker").value;
  const res = await fetch(`/api/bf?week=${week}`, {
    headers: { Authorization: "Bearer " + token },
  });
  const d = await res.json();
  const tb = $("#bfTable tbody");
  tb.innerHTML = "";
  d.forEach((f) => {
    tb.innerHTML += `<tr><td class="left">${f.family}</td><td>${f.cadru}</td><td>${f.teava}</td><td>${f.mecanism}</td><td>${f.fixare}</td><td>${f.total}</td></tr>`;
  });
}
$("#bfWeekPicker").onchange = loadBF;

// ===== Admin =====
async function loadAdmin() {
  await fillWeeks("#weekSelect");
  const week = $("#weekSelect").value;
  const mode = $("#admPeriod").value;
  const res = await fetch(`/api/admin?period=${mode}&week=${week}`, {
    headers: { Authorization: "Bearer " + token },
  });
  const d = await res.json();
  const tb = $("#admTable tbody");
  tb.innerHTML = "";
  d.forEach((u) => {
    tb.innerHTML += `<tr>
      <td class="left">${u.user}</td>
      <td>${fmtMoney(u.clean)}</td>
      <td>${fmtMoney(u.dirty)}</td>
      <td>${fmtMoney(u.cleanFam)}</td>
      <td>${fmtMoney(u.dirtyFam)}</td>
      <td>${fmtMoney(u.totalClean)}</td>
      <td>${fmtMoney(u.totalDirty)}</td>
      <td class="total-col">${fmtMoney(u.total)}</td>
    </tr>`;
  });
}
$("#admPeriod").onchange = loadAdmin;
$("#weekSelect").onchange = loadAdmin;

// ===== Tables =====
async function loadTables() {
  await fillWeeks("#tblWeekPicker");
  const week = $("#tblWeekPicker").value;
  const type = $("#tblType").value;
  const mode = $("#tblPeriod").value;
  const res = await fetch(
    `/api/tables?type=${type}&period=${mode}&week=${week}`,
    { headers: { Authorization: "Bearer " + token } }
  );
  const d = await res.json();
  const tb = $("#tblAll tbody");
  tb.innerHTML = "";
  if (type === "taxe") {
    $("#tblHead").innerHTML =
      "<tr><th class='left'>CNP</th><th>Sumă</th><th>Data</th><th class='left'>User</th></tr>";
    d.forEach((r) => {
      tb.innerHTML += `<tr><td class="left">${r.cnp}</td><td>${fmtMoney(
        r.suma
      )}</td><td>${fmtDate(r.createdAt)}</td><td class="left">${r.user}</td></tr>`;
    });
  } else {
    $("#tblHead").innerHTML =
      "<tr><th class='left'>CNP</th><th>Familie</th><th>Cadru</th><th>Țeavă</th><th>Mec</th><th>Fixare</th><th>Metodă</th><th>Cost</th><th class='left'>User</th></tr>";
    d.forEach((r) => {
      tb.innerHTML += `<tr><td class="left">${r.cnp}</td><td class="left">${
        r.family
      }</td><td>${r.cadru}</td><td>${r.teava}</td><td>${r.mecanism}</td><td>${
        r.fixare
      }</td><td>${r.metoda}</td><td>${fmtMoney(r.cost)}</td><td class="left">${
        r.user
      }</td></tr>`;
    });
  }
}
$("#tblType").onchange = loadTables;
$("#tblPeriod").onchange = loadTables;
$("#tblWeekPicker").onchange = loadTables;
$("#tblRefresh").onclick = loadTables;

// ===== Profile =====
async function loadProfile() {
  await fillWeeks("#profWeekPicker");
  const week = $("#profWeekPicker").value;
  const mode = $("#profPeriod").value;
  const res = await fetch(`/api/profile?period=${mode}&week=${week}`, {
    headers: { Authorization: "Bearer " + token },
  });
  const d = await res.json();
  $("#profClean").textContent = fmtMoney(d.clean);
  $("#profDirty").textContent = fmtMoney(d.dirty);
  $("#profPieces").textContent = d.pieces;
  $("#profDrillMoney").textContent = fmtMoney(d.drillMoney);

  const tb = $("#profDailyTable tbody");
  tb.innerHTML = "";
  d.daily.forEach((x) => {
    tb.innerHTML += `<tr><td class="left">${x.day}</td><td>${x.count}</td><td>${fmtMoney(
      x.clean
    )}</td><td>${fmtMoney(x.dirty)}</td></tr>`;
  });
}
$("#profPeriod").onchange = loadProfile;
$("#profWeekPicker").onchange = loadProfile;

// ===== Reset Password =====
$("#resetForm").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const res = await fetch("/api/reset", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: fd,
  });
  if (res.ok) {
    alert("Parolă schimbată");
    e.target.reset();
  } else alert("Eroare la schimbare");
};

// ===== Invite =====
$("#inviteBtn").onclick = async () => {
  const role = $("#inviteRole").value;
  const res = await fetch("/api/invite?role=" + role, {
    headers: { Authorization: "Bearer " + token },
  });
  const d = await res.json();
  $("#inviteResult").value = d.code;
};
$("#inviteCopy").onclick = () => {
  navigator.clipboard.writeText($("#inviteResult").value);
};

// ===== Weeks util =====
async function fillWeeks(sel) {
  const res = await fetch("/api/weeks", {
    headers: { Authorization: "Bearer " + token },
  });
  const arr = await res.json();
  const s = $(sel);
  s.innerHTML = "";
  arr.forEach((w) => {
    const o = document.createElement("option");
    o.value = w;
    o.textContent = "Săpt. " + w;
    s.appendChild(o);
  });
  if (arr.length) s.value = arr[arr.length - 1];
}
