export function adminPage() {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>RANDOM — Panel</title>
<style>
  :root {
    --ink: #070707;
    --paper: #f2ede6;
    --muted: #8a8580;
    --line: rgba(255,255,255,0.14);
    --accent: #ff9d00;
    --danger: #ff4d4d;
    --ok: #38c172;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--ink);
    color: var(--paper);
    font: 15px/1.5 -apple-system, "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; border-bottom: 1px solid var(--line);
  }
  header h1 { font-size: 16px; letter-spacing: 0.04em; margin: 0; text-transform: uppercase; }
  header h1 span { color: var(--accent); }
  main { max-width: 960px; margin: 0 auto; padding: 24px 20px 80px; }
  .center-screen { min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; text-align: center; padding: 20px; }
  .center-screen p { color: var(--muted); max-width: 360px; }
  button, .btn {
    background: var(--accent); color: var(--ink); border: none; border-radius: 8px;
    padding: 12px 20px; font-size: 15px; font-weight: 600; cursor: pointer;
  }
  button.secondary { background: transparent; color: var(--paper); border: 1px solid var(--line); }
  button.danger { background: var(--danger); color: #fff; }
  button:disabled { opacity: 0.5; cursor: default; }
  input, textarea {
    background: #151515; color: var(--paper); border: 1px solid var(--line); border-radius: 6px;
    padding: 10px 12px; font-size: 15px; width: 100%;
  }
  label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.03em; }
  .field { margin-bottom: 14px; }
  .tabs { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--line); }
  .tab { padding: 10px 4px; margin-right: 16px; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; font-weight: 600; }
  .tab.active { color: var(--paper); border-color: var(--accent); }
  .card { background: #121212; border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin-bottom: 14px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .muted { color: var(--muted); }
  .stat { font-size: 40px; font-weight: 700; }
  .stat.positive { color: var(--ok); }
  .stat.negative { color: var(--danger); }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 11px; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .pill.pagado { background: rgba(56,193,114,0.16); color: var(--ok); }
  .pill.pendiente { background: rgba(255,77,77,0.16); color: var(--danger); }
  .inline-form { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .inline-form input { width: auto; flex: 1; min-width: 90px; }
  a.link { color: var(--accent); cursor: pointer; text-decoration: underline; font-size: 13px; }
  [hidden] { display: none !important; }
  .error { color: var(--danger); font-size: 13px; margin-top: 8px; }
</style>
</head>
<body>

<header>
  <h1>RANDOM <span>panel</span></h1>
  <button id="logout-btn" class="secondary" hidden>Salir</button>
</header>

<main>

  <section id="screen-loading" class="center-screen">
    <p class="muted">Cargando…</p>
  </section>

  <section id="screen-login" class="center-screen" hidden>
    <h2>Entrá con Face ID / Touch ID</h2>
    <p>Este panel es privado. Solo tu dispositivo registrado puede entrar.</p>
    <button id="login-btn">Entrar</button>
    <p class="error" id="login-error"></p>
  </section>

  <section id="screen-bootstrap" class="center-screen" hidden>
    <h2>Registrar el primer dispositivo</h2>
    <p>Todavía no hay ningún Face ID / Touch ID registrado. Pedí la clave de arranque a quien configuró el panel.</p>
    <div style="width:100%; max-width:320px; text-align:left;">
      <div class="field">
        <label>Clave de arranque</label>
        <input id="bootstrap-secret" type="password" autocomplete="off">
      </div>
      <div class="field">
        <label>Nombre de este dispositivo</label>
        <input id="bootstrap-device-name" placeholder="iPhone de Mati">
      </div>
    </div>
    <button id="bootstrap-btn">Registrar con Face ID / Touch ID</button>
    <p class="error" id="bootstrap-error"></p>
  </section>

  <section id="screen-app" hidden>
    <div class="tabs">
      <div class="tab active" data-tab="ediciones">Ediciones</div>
      <div class="tab" data-tab="caja">Caja</div>
      <div class="tab" data-tab="dispositivos">Dispositivos</div>
    </div>

    <div id="tab-ediciones">
      <div class="card">
        <div class="row">
          <strong>Nueva edición</strong>
        </div>
        <div class="inline-form">
          <input id="new-numero" placeholder="Número (71)" inputmode="numeric">
          <input id="new-fecha" placeholder="Fecha (2026-09-18)">
          <input id="new-venue" placeholder="Venue" value="LEVEL">
          <button id="new-edicion-btn">Crear</button>
        </div>
        <p class="error" id="ediciones-error"></p>
      </div>
      <div id="ediciones-list"></div>
    </div>

    <div id="tab-caja" hidden>
      <div class="card">
        <div class="muted">Saldo de la caja</div>
        <div class="stat" id="caja-saldo">—</div>
        <div class="muted" id="caja-objetivo"></div>
      </div>
      <div class="card">
        <strong>Registrar movimiento</strong>
        <div class="inline-form">
          <input id="caja-monto" placeholder="Monto € (+100 / -70)" inputmode="decimal">
          <input id="caja-motivo" placeholder="Motivo">
          <button id="caja-add-btn">Agregar</button>
        </div>
        <p class="error" id="caja-error"></p>
      </div>
      <div class="card">
        <table id="caja-tabla">
          <thead><tr><th>Fecha</th><th>Motivo</th><th style="text-align:right">Monto</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <div id="tab-dispositivos" hidden>
      <div class="card">
        <strong>Dispositivos registrados</strong>
        <table id="dispositivos-tabla">
          <thead><tr><th>Nombre</th><th>Agregado</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="card">
        <strong>Agregar otro dispositivo</strong>
        <div class="inline-form">
          <input id="add-device-name" placeholder="Mac de Mati">
          <button id="add-device-btn">Registrar con Face ID / Touch ID</button>
        </div>
        <p class="error" id="add-device-error"></p>
      </div>
    </div>
  </section>

</main>

<script>
function show(id) {
  for (const el of document.querySelectorAll('main > section')) el.hidden = (el.id !== id);
}

function b64urlToBuf(s) {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function bufToB64url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
}

async function api(path, options) {
  const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || ('Error ' + res.status));
  }
  return res.status === 204 ? null : res.json();
}

async function doBootstrap() {
  const secret = document.getElementById('bootstrap-secret').value;
  const deviceName = document.getElementById('bootstrap-device-name').value || 'Dispositivo';
  const errorEl = document.getElementById('bootstrap-error');
  errorEl.textContent = '';
  try {
    const options = await api('/admin/api/webauthn/register-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bootstrap-secret': secret },
    });
    const credential = await navigator.credentials.create({
      publicKey: Object.assign({}, options, {
        challenge: b64urlToBuf(options.challenge),
        user: Object.assign({}, options.user, { id: b64urlToBuf(options.user.id) }),
      }),
    });
    const payload = {
      id: credential.id,
      rawId: bufToB64url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufToB64url(credential.response.clientDataJSON),
        attestationObject: bufToB64url(credential.response.attestationObject),
      },
      deviceName,
    };
    await api('/admin/api/webauthn/register-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bootstrap-secret': secret },
      body: JSON.stringify(payload),
    });
    await boot();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

async function doAddDevice() {
  const deviceName = document.getElementById('add-device-name').value || 'Dispositivo';
  const errorEl = document.getElementById('add-device-error');
  errorEl.textContent = '';
  try {
    const options = await api('/admin/api/webauthn/register-options', { method: 'POST' });
    const credential = await navigator.credentials.create({
      publicKey: Object.assign({}, options, {
        challenge: b64urlToBuf(options.challenge),
        user: Object.assign({}, options.user, { id: b64urlToBuf(options.user.id) }),
      }),
    });
    await api('/admin/api/webauthn/register-verify', {
      method: 'POST',
      body: JSON.stringify({
        id: credential.id,
        rawId: bufToB64url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: bufToB64url(credential.response.clientDataJSON),
          attestationObject: bufToB64url(credential.response.attestationObject),
        },
        deviceName,
      }),
    });
    await loadDevices();
    document.getElementById('add-device-name').value = '';
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

async function doLogin() {
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';
  try {
    const options = await api('/admin/api/webauthn/login-options', { method: 'POST' });
    const credential = await navigator.credentials.get({
      publicKey: Object.assign({}, options, {
        challenge: b64urlToBuf(options.challenge),
        allowCredentials: options.allowCredentials.map((c) => Object.assign({}, c, { id: b64urlToBuf(c.id) })),
      }),
    });
    await api('/admin/api/webauthn/login-verify', {
      method: 'POST',
      body: JSON.stringify({
        id: credential.id,
        rawId: bufToB64url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: bufToB64url(credential.response.clientDataJSON),
          authenticatorData: bufToB64url(credential.response.authenticatorData),
          signature: bufToB64url(credential.response.signature),
        },
      }),
    });
    await boot();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

function eur(cents) {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function renderEdiciones(ediciones) {
  const list = document.getElementById('ediciones-list');
  list.innerHTML = '';
  for (const e of ediciones) {
    const djTotal = e.djs.reduce((sum, dj) => sum + dj.cachet_cents, 0);
    const resultado = e.fee_venue_cents - djTotal - e.fotografo_cents - e.pauta_cents;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML =
      '<div class="row"><strong>RANDOM #' + e.numero + ' — ' + e.venue + '</strong><span class="muted">' + e.fecha + '</span></div>' +
      '<div class="row" style="margin-top:8px">' +
        '<span class="muted">Fee ' + eur(e.fee_venue_cents) + ' · Fotógrafo ' + eur(e.fotografo_cents) + ' · Pauta ' + eur(e.pauta_cents) + '</span>' +
        '<strong style="color:' + (resultado >= 0 ? '#38c172' : '#ff4d4d') + '">' + eur(resultado) + '</strong>' +
      '</div>' +
      '<div class="inline-form">' +
        '<input type="number" class="asistencia-input" placeholder="Asistencia" value="' + (e.asistencia ?? '') + '" style="max-width:120px">' +
        '<input type="number" class="fotografo-input" placeholder="Fotógrafo €" value="' + (e.fotografo_cents / 100) + '" style="max-width:120px">' +
        '<input type="number" class="pauta-input" placeholder="Pauta €" value="' + (e.pauta_cents / 100) + '" style="max-width:120px">' +
        '<button class="secondary save-btn">Guardar</button>' +
      '</div>' +
      '<table style="margin-top:12px"><thead><tr><th>DJ</th><th>Cachet</th><th>Pago</th><th></th></tr></thead><tbody></tbody></table>' +
      '<div class="inline-form">' +
        '<input class="dj-nombre" placeholder="Nombre del DJ">' +
        '<input class="dj-cachet" type="number" placeholder="Cachet €" value="70" style="max-width:100px">' +
        '<button class="secondary add-dj-btn">Agregar DJ</button>' +
      '</div>';

    const tbody = card.querySelector('tbody');
    for (const dj of e.djs) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + dj.nombre + '</td>' +
        '<td>' + eur(dj.cachet_cents) + '</td>' +
        '<td><span class="pill ' + (dj.pagado ? 'pagado' : 'pendiente') + '">' + (dj.pagado ? 'Pagado' : 'Pendiente') + '</span></td>' +
        '<td><a class="link toggle-pago">' + (dj.pagado ? 'Marcar pendiente' : 'Marcar pagado') + '</a> · <a class="link quitar-dj">Quitar</a></td>';
      tr.querySelector('.toggle-pago').onclick = async () => {
        await api('/admin/api/djs/' + dj.id + '/pago', { method: 'PATCH', body: JSON.stringify({ pagado: !dj.pagado, pagadoPor: 'Matías' }) });
        await loadEdiciones();
      };
      tr.querySelector('.quitar-dj').onclick = async () => {
        await api('/admin/api/djs/' + dj.id, { method: 'DELETE' });
        await loadEdiciones();
      };
      tbody.appendChild(tr);
    }

    card.querySelector('.save-btn').onclick = async () => {
      const asistencia = card.querySelector('.asistencia-input').value;
      const fotografo = card.querySelector('.fotografo-input').value;
      const pauta = card.querySelector('.pauta-input').value;
      await api('/admin/api/ediciones/' + e.id, {
        method: 'PATCH',
        body: JSON.stringify({
          asistencia: asistencia === '' ? null : Number(asistencia),
          fotografo_cents: Math.round(Number(fotografo || 0) * 100),
          pauta_cents: Math.round(Number(pauta || 0) * 100),
        }),
      });
      await loadEdiciones();
    };

    card.querySelector('.add-dj-btn').onclick = async () => {
      const nombre = card.querySelector('.dj-nombre').value.trim();
      const cachet = card.querySelector('.dj-cachet').value;
      if (!nombre) return;
      await api('/admin/api/ediciones/' + e.id + '/djs', {
        method: 'POST',
        body: JSON.stringify({ nombre, cachetCents: Math.round(Number(cachet || 70) * 100) }),
      });
      await loadEdiciones();
    };

    list.appendChild(card);
  }
}

async function loadEdiciones() {
  const ediciones = await api('/admin/api/ediciones');
  renderEdiciones(ediciones);
}

async function loadCaja() {
  const data = await api('/admin/api/caja');
  document.getElementById('caja-saldo').textContent = eur(data.saldoCents);
  document.getElementById('caja-saldo').className = 'stat ' + (data.saldoCents >= 50000 ? 'positive' : '');
  document.getElementById('caja-objetivo').textContent = 'Objetivo: 500 €' + (data.saldoCents >= 50000 ? ' — alcanzado' : ' · faltan ' + eur(50000 - data.saldoCents));
  const tbody = document.querySelector('#caja-tabla tbody');
  tbody.innerHTML = '';
  for (const m of data.movimientos) {
    const tr = document.createElement('tr');
    const fecha = new Date(m.created_at).toLocaleDateString('es-ES');
    tr.innerHTML = '<td>' + fecha + '</td><td>' + m.motivo + '</td><td style="text-align:right; color:' + (m.monto_cents >= 0 ? '#38c172' : '#ff4d4d') + '">' + eur(m.monto_cents) + '</td>';
    tbody.appendChild(tr);
  }
}

async function loadDevices() {
  const devices = await api('/admin/api/passkeys');
  const tbody = document.querySelector('#dispositivos-tabla tbody');
  tbody.innerHTML = '';
  for (const d of devices) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + d.device_name + '</td><td>' + new Date(d.created_at).toLocaleDateString('es-ES') + '</td>';
    tbody.appendChild(tr);
  }
}

function setupApp() {
  document.getElementById('logout-btn').hidden = false;
  document.getElementById('logout-btn').onclick = async () => {
    await api('/admin/api/logout', { method: 'POST' });
    location.reload();
  };
  for (const tab of document.querySelectorAll('.tab')) {
    tab.onclick = () => {
      for (const t of document.querySelectorAll('.tab')) t.classList.remove('active');
      tab.classList.add('active');
      for (const id of ['ediciones', 'caja', 'dispositivos']) {
        document.getElementById('tab-' + id).hidden = id !== tab.dataset.tab;
      }
    };
  }
  document.getElementById('new-edicion-btn').onclick = async () => {
    const errorEl = document.getElementById('ediciones-error');
    errorEl.textContent = '';
    try {
      const numero = Number(document.getElementById('new-numero').value);
      const fecha = document.getElementById('new-fecha').value;
      const venue = document.getElementById('new-venue').value || 'LEVEL';
      if (!numero || !fecha) { errorEl.textContent = 'Número y fecha son obligatorios'; return; }
      await api('/admin/api/ediciones', { method: 'POST', body: JSON.stringify({ numero, fecha, venue }) });
      document.getElementById('new-numero').value = '';
      document.getElementById('new-fecha').value = '';
      await loadEdiciones();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  };
  document.getElementById('caja-add-btn').onclick = async () => {
    const errorEl = document.getElementById('caja-error');
    errorEl.textContent = '';
    try {
      const monto = Number(document.getElementById('caja-monto').value);
      const motivo = document.getElementById('caja-motivo').value.trim();
      if (!monto || !motivo) { errorEl.textContent = 'Monto y motivo son obligatorios'; return; }
      await api('/admin/api/caja', { method: 'POST', body: JSON.stringify({ montoCents: Math.round(monto * 100), motivo }) });
      document.getElementById('caja-monto').value = '';
      document.getElementById('caja-motivo').value = '';
      await loadCaja();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  };
  document.getElementById('add-device-btn').onclick = doAddDevice;
  loadEdiciones();
  loadCaja();
  loadDevices();
}

async function boot() {
  show('screen-loading');
  const session = await api('/admin/api/session').catch(() => ({ authenticated: false }));
  if (session.authenticated) {
    show('screen-app');
    setupApp();
    return;
  }
  const status = await api('/admin/api/bootstrap-status');
  if (status.hasPasskeys) {
    show('screen-login');
    document.getElementById('login-btn').onclick = doLogin;
  } else {
    show('screen-bootstrap');
    document.getElementById('bootstrap-btn').onclick = doBootstrap;
  }
}

boot();
</script>
</body>
</html>`;
}
