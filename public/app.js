const API_URL = "http://localhost:3000"; // ajustează pentru Railway

// LOGIN
document.getElementById("loginBtn").addEventListener("click", async () => {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (data.token) {
    localStorage.setItem("token", data.token);
    alert("Login reușit!");
    document.getElementById("login-section").classList.add("hidden");
    document.getElementById("taxe-section").classList.remove("hidden");
  } else {
    alert("Eroare login!");
  }
});

// GRATIS la taxe
document.getElementById("tipPlata").addEventListener("change", e => {
  if (e.target.value === "gratis") {
    document.getElementById("gratisFamilii").classList.remove("hidden");
  } else {
    document.getElementById("gratisFamilii").classList.add("hidden");
  }
});

// FORMATARE BANI
function formatMoney(amount) {
  return amount.toLocaleString("ro-RO") + "$";
}

// POPULARE SELECTOARE SĂPTĂMÂNI
function populateWeeks(selectId) {
  const select = document.getElementById(selectId);
  select.innerHTML = "";
  for (let w = 1; w <= 52; w++) {
    const opt = document.createElement("option");
    opt.value = w;
    opt.textContent = `Săptămâna ${w}`;
    select.appendChild(opt);
  }
}
["dashboardWeek", "statsFamWeek", "adminWeek", "tablesWeek", "profileWeek"].forEach(populateWeeks);
