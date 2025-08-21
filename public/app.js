const API_URL = window.location.origin;

let token = localStorage.getItem("token") || null;

function showView(viewId) {
  document.querySelectorAll("main section").forEach(sec => sec.classList.add("hidden"));
  document.getElementById(viewId).classList.remove("hidden");
}

document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Eroare login");
    token = data.token;
    localStorage.setItem("token", token);
    loadDashboard();
  } catch (err) {
    document.getElementById("loginError").innerText = err.message;
  }
});

document.getElementById("logoutBtn")?.addEventListener("click", () => {
  token = null;
  localStorage.removeItem("token");
  showView("loginView");
});

function authHeaders() {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function loadDashboard() {
  showView("dashboardView");
  const res = await fetch(`${API_URL}/dashboard`, { headers: authHeaders() });
  const data = await res.json();
  document.getElementById("dashboardView").innerHTML = `
    <h2>Datele mele</h2>
    <pre>${JSON.stringify(data, null, 2)}</pre>
  `;
}

document.querySelectorAll("nav button[data-tab]")?.forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    if (tab === "dashboard") loadDashboard();
    else showView(tab + "View");
  });
});

if (token) loadDashboard();
else showView("loginView");
