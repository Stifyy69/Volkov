// ===== helpers =====
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
function toast(msg){ const t=$("#toast"); t.textContent=msg; show(t,true); setTimeout(()=>show(t,false),2000); }

// ===== elements =====
const authCard = $("#authCard");
const taxeGrid = $("#taxeGrid");
const dashCard = $("#dashCard");
const adminCard= $("#adminCard");

const gratisWrap = $("#gratisWrap");
const metodaSel  = $("#metoda");
metodaSel.addEventListener("change", () => show(gratisWrap, metodaSel.value === "gratis"));

// ===== auth tabs =====
$$(".seg .chip").forEach((t) => {
  t.onclick = () => {
    $$(".seg .chip").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    show($("#loginPane"), t.dataset.tab === "login");
    show($("#registerPane"), t.dataset.tab === "register");
  };
});

$("#btnLogin").onclick = async () => {
  const r = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: $("#loginUser").value, password: $("#loginPass").value }),
  });
  const j = await r.json();
  if (!r.ok) return toast(j.error || "Eroare");
  localStorage.token = j.token; await bootstrap();
};

$("#btnRegister").onclick = async () => {
  const payload = {
    inviteCode: $("#regInvite").value,
    username: $("#regUser").value,
    password: $("#regPass").value,
    nickname: $("#regNick").value,
    cnp: $("#regCnp").value,
  };
  const r = await api("/auth/register", { method: "POST", body: JSON.stringify(payload) });
  const j = await r.json();
  if (!r.ok) return toast(j.error || "Eroare");
  localStorage.token = j.token; await bootstrap();
};

$("#logout").onclick = () => { localStorage.removeItem("token"); location.reload(); };

// ===== tabs =====
$("#tabTaxe").onclick = async () => {
  $("#tabTaxe").classList.add("active");
  $("#tabDash").classList.remove("active");
  $("#tabAdmin").classList.remove("active");
  show(taxeGrid, true); show(dashCard, false); show(adminCard, false);
  await loadFamilies(); await loadTaxe(); await loadDrill(); startLive();
};
$("#tabDash").onclick = async () => {
  $("#tabDash").classList.add("active");
  $("#tabTaxe").classList.remove("active");
  $("#tabAdmin").classList.remove("active");
  show(taxeGrid, false); show(dashCard, true); show(adminCard, false);
  stopLive(); await loadDash();
};
$("#tabAdmin").onclick = async () => {
  $("#tabAdmin").classList.add("active");
  $("#tabTaxe").classList.remove("active");
  $("#tabDash").classList.remove("active");
  show(taxeGrid, false); show(dashCard, false); show(adminCard, true);
  stopLive(); await loadAdminStats();
};

// ===== taxe =====
$("#btnTrimiteTaxa").onclick = async () => {
  const cnp = $("#cnp").value.trim();
  if (!/^\d{1,6}$/.test(cnp)) return toast("CNP invalid (max 6 cifre)");
  const metoda =
