<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Volkov RP Panel</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header class="nav">
    <div class="brand">Volkov RP</div>
    <nav class="tabs">
      <button id="tabTaxe" class="tab active">Taxe</button>
      <button id="tabDash" class="tab">Dashboard</button>
    </nav>
    <div class="who">
      <span id="whoami">...</span>
      <button id="logout" class="ghost">Logout</button>
    </div>
  </header>

  <main class="wrap">
    <!-- CARD AUTENTIFICARE -->
    <section class="card" id="authCard">
      <h2>Autentificare</h2>
      <div class="tabs small">
        <button class="tab active" data-tab="login">Login</button>
        <button class="tab" data-tab="register">Register</button>
      </div>

      <div id="loginPane">
        <div class="row">
          <label>Username<input id="loginUser" /></label>
          <label>Parola<input id="loginPass" type="password" /></label>
        </div>
        <button id="btnLogin" class="primary">Login</button>
      </div>

      <div id="registerPane" class="hidden">
        <div class="row">
          <label>Invite code<input id="regInvite" /></label>
          <label>Username<input id="regUser" /></label>
        </div>
        <div class="row">
          <label>Parola<input id="regPass" type="password" /></label>
          <label>Nickname<input id="regNick" /></label>
          <label>CNP (max 6)<input id="regCnp" maxlength="6" inputmode="numeric" pattern="\\d{1,6}" /></label>
        </div>
        <button id="btnRegister" class="primary">Register</button>
      </div>
    </section>

    <!-- CARD TAXE -->
    <section class="card hidden" id="taxeCard">
      <h2>Taxe</h2>
      <div class="row">
        <label>CNP
          <input id="cnp" maxlength="6" inputmode="numeric" pattern="\\d{1,6}" />
        </label>
        <label>Familie (doar la Gratis)
          <select id="gratisFamilie">
            <option>Medelin Cartel</option>
            <option>818</option>
            <option>Stefanos Cartel</option>
          </select>
        </label>
      </div>

      <div class="grid">
        <button class="pay" data-method="curat">Bani curați – 40.000 $</button>
        <button class="pay" data-method="murdar">Bani murdari – 60.000 $</button>
        <button class="pay" data-method="otel">Oțel – 15 buc</button>
        <button class="pay" data-method="praf">Praf de pușcă – 25 buc</button>
        <button class="pay" data-method="gratis">Gratis (cu familie)</button>
      </div>

      <h3>Active</h3>
      <ul id="taxeList"></ul>

      <hr/>
      <h2>Burghiu</h2>
      <div class="row">
        <label>CNP<input id="drCnp" maxlength="6" inputmode="numeric" pattern="\\d{1,6}" /></label>
        <label>Piesă
          <select id="drPart">
            <option value="cadru">Cadru</option>
            <option value="teava">Țeavă</option>
            <option value="mecanism">Mecanism</option>
            <option value="fixare">Elemente de fixare</option>
          </select>
        </label>
        <label>Familie
          <select id="drFamilie"></select>
        </label>
        <label>Cantitate<input type="number" id="drQty" min="1" value="1"/></label>
        <label>CashType
          <select id="drCash">
            <option value="CLEAN">CLEAN</option>
            <option value="DIRTY">DIRTY</option>
          </select>
        </label>
        <button id="btnDrill" class="primary">Trimite</button>
      </div>

      <h3>Ultimele joburi</h3>
      <ul id="drillList"></ul>
    </section>

    <!-- CARD DASHBOARD -->
    <section class="card hidden" id="dashCard">
      <h2>Dashboard</h2>

      <div id="adminInvite" class="hidden">
        <h3>Invite generator</h3>
        <div class="row">
          <label>Rol
            <select id="inviteRole">
              <option value="OPERATOR">OPERATOR</option>
              <option value="HEAD_OPERATOR">HEAD_OPERATOR</option>
              <option value="AUDIT">AUDIT</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>
          <button id="btnMakeInvite" class="primary">Generează invite</button>
        </div>
        <div id="inviteOut" class="mono"></div>
        <hr/>
      </div>

      <h3>Statistici</h3>
      <table class="table" id="statsTable">
        <thead>
          <tr><th>User</th><th>Rol</th><th>Taxe</th><th>Joburi burghiu</th></tr>
        </thead>
        <tbody></tbody>
      </table>
    </section>
  </main>

  <script src="/app.js"></script>
</body>
</html>
