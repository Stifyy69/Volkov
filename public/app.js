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
const show = (el, v) => el.classList.toggle("hidden", !v);

const authCard = $("#authCard");
const taxeCard = $("#taxeCard");
const dashCard = $("#dashCard");
const adminInvite = $("#adminInvite");

$("#tabTaxe").onclick = () => {
  $("#tabTaxe").classList.add("active");
  $("#tabDash").classList.remove("active");
  show(taxeCard, true);
  show(dashCard, false);
};
$("#tabDash").onclick = async () => {
  $("#tabDash").classList.add("active");
  $("#tabTaxe").classList.remove("active");
  show(taxeCard, false);
  show(dashCard, true);
  await loadStats();
};

// Login/Register tabs
$$(".card .tabs.small .tab").forEach((t) => {
  t.onclick = () => {
    $$(".card .tabs.small .tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    show($("#loginPane"), t.dataset.tab === "login");
    show($("#registerPane"), t.dataset.tab === "register");
  };
});

// Auth actions
$("#btnLogin").onclick = async () => {
  const r = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: $("#loginUser").value,
      password: $("#loginPass").value,
    }),
  });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Eroare");
  localStorage.token = j.token;
  await bootstrap();
};

$("#btnRegister").onclick = async () => {
  const payload = {
    inviteCode: $("#regInvite").value,
    username: $("#regUser").value,
    password: $("#regPass").value,
    nickname: $("#regNick").value,
    cnp: $("#regCnp").value,
  };
  const r = await api("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Eroare");
  localStorage.token = j.token;
  await bootstrap();
};

$("#logout").onclick = () => {
  localStorage.removeItem("token");
  location.reload();
};

// TAXE — butoane ca metode
$$(".pay").forEach((btn) => {
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    const cnp = $("#cnp").value.trim();
    if (!/^\d{1,6}$/.test(cnp)) return alert("CNP invalid");
    const metoda = btn.dataset.method; // curat | murdar | otel | praf | gratis
    const body = { cnp, metoda };
    if (metoda === "gratis") body.gratisFamilie = $("#gratisFamilie").value;

    const r = await api("/taxe", { method: "POST", body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "Eroare");
    await loadTaxe();
  });
});

// Invite (admin/head)
$("#btnMakeInvite")?.addEventListener("click", async () => {
  const r = await api("/invites", {
    method: "POST",
    body: JSON.stringify({ role: $("#inviteRole").value }),
  });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Eroare");
  $("#inviteOut").textContent = j.link || j.code;
});

// Burghiu
$("#btnDrill").onclick = async () => {
  const payload = {
    cnp: $("#drCnp").value.trim(),
    part: $("#drPart").value,
    family: $("#drFamilie").value || null,
    quantity: Number($("#drQty").value || 0),
    cashType: $("#drCash").value,
  };
  if (!/^\d{1,6}$/.test(payload.cnp)) return alert("CNP invalid");
  if (!(payload.quantity > 0)) return alert("Cantitate invalidă");
  const r = await api("/drill", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!r.ok) return alert(j.error || "Eroare");
  await loadDrill();
};

// Bootstrap după login
async function bootstrap() {
  const r = await api("/auth/me");
  const me = await r.json();
  if (!r.ok) {
    localStorage.removeItem("token");
    return;
  }
  $("#whoami").textContent = `${me.username} [${me.role}]`;
  show(authCard, false);
  show(taxeCard, true);
  show(dashCard, false);
  show(adminInvite, me.role === "ADMIN" || me.role === "HEAD_OPERATOR");
  await loadFamilies();
  await loadTaxe();
  await loadDrill();
}

async function loadFamilies() {
  const r = await api("/families");
  const list = await r.json();
  const sel = $("#drFamilie");
  sel.innerHTML =
    '<option value="">(fără)</option>' +
    list.map((f) => `<option value="${f.name}">${f.name}</option>`).join("");
}

async function loadTaxe() {
  const r = await api("/taxe");
  const data = await r.json();
  const ul = $("#taxeList");
  ul.innerHTML = "";
  data.forEach((x) => {
    const li = document.createElement("li");
    const gratis =
      x.metoda === "gratis" && x.gratisFamilie ? ` / Gratis: ${x.gratisFamilie}` : "";
    li.textContent = `${x.cnp} — ${x.tip} (${x.amount}) — ${x.metoda}${gratis} — ${x.remaining}`;
    ul.appendChild(li);
  });
}

async function loadDrill() {
  const r = await api("/drill");
  const data = await r.json();
  const ul = $("#drillList");
  ul.innerHTML = "";
  data.forEach((j) => {
    const txt = `#${j.id} CNP ${j.cnp} | cadru:${j.cadru} mecanism:${j.mecanism} teava:${j.teava} fixare:${j.fixare} | qty:${j.qty} | ${
      j.family || "-"
    } | ${j.cashType}`;
    const li = document.createElement("li");
    li.textContent = txt;
    ul.appendChild(li);
  });
}

async function loadStats() {
  const r = await api("/stats/users");
  const data = await r.json();
  const tbody = $("#statsTable tbody");
  tbody.innerHTML = "";
  const isAll = data.scope === "ALL";
  data.rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.username}</td><td>${row.role}</td><td>${row.taxes}</td><td>${row.jobs || "-"}</td>`;
    tbody.appendChild(tr);
  });
}

(async () => {
  const params = new URLSearchParams(location.search);
  const invite = params.get("invite");
  if (invite) {
    $$(".card .tabs.small .tab")[1].click();
    $("#regInvite").value = invite;
  }
  if (localStorage.token) await bootstrap();
})();
