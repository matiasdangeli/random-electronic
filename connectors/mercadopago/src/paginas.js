/*
 * Las dos únicas pantallas del conector: la de inicio y la de contraseña.
 *
 * La de contraseña es la que ve ChatGPT cuando abre la ventana de conexión, y
 * es lo único que separa la cuenta de Mercado Pago de cualquiera que tenga la
 * dirección del Worker. Por eso no dice qué cuenta hay del otro lado ni si la
 * contraseña existe: un error dice "no coincide" y nada más.
 */

export function escapar(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ESTILO = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    background: #0b0b0c;
    color: #f3f3f4;
    font: 400 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { width: 100%; max-width: 380px; }
  .marca {
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #8a8a90;
    margin: 0 0 28px;
  }
  h1 { font-size: 25px; line-height: 1.2; letter-spacing: -0.02em; margin: 0 0 10px; font-weight: 600; }
  p.ayuda { margin: 0 0 26px; color: #a1a1a8; font-size: 14px; }
  label { display: block; font-size: 13px; color: #a1a1a8; margin: 0 0 8px; }
  input {
    width: 100%;
    padding: 13px 14px;
    border-radius: 10px;
    border: 1px solid #2a2a2e;
    background: #151517;
    color: inherit;
    font: inherit;
  }
  input:focus-visible { outline: 2px solid #6f6ff5; outline-offset: 1px; border-color: transparent; }
  button {
    width: 100%;
    margin-top: 16px;
    padding: 13px 14px;
    border: 0;
    border-radius: 10px;
    background: #f3f3f4;
    color: #0b0b0c;
    font: 600 15px/1 inherit;
    cursor: pointer;
  }
  button:hover { background: #ffffff; }
  .error {
    margin: 0 0 20px;
    padding: 11px 13px;
    border-radius: 10px;
    border: 1px solid #5b2626;
    background: #241315;
    color: #f6b8b8;
    font-size: 14px;
  }
  .pie { margin: 26px 0 0; font-size: 12px; color: #6d6d74; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #c9c9d1; }
  @media (prefers-color-scheme: light) {
    body { background: #fbfbfc; color: #17171a; }
    .marca, p.ayuda, label { color: #6b6b73; }
    input { background: #ffffff; border-color: #dcdce2; }
    button { background: #17171a; color: #fbfbfc; }
    button:hover { background: #000000; }
    .error { border-color: #e8b4b4; background: #fdf2f2; color: #8a2020; }
    .pie { color: #8b8b93; }
    code { color: #45454d; }
  }
`;

function envoltura(titulo, cuerpo) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapar(titulo)}</title>
<style>${ESTILO}</style>
</head>
<body><main>${cuerpo}</main></body>
</html>`;
}

export function paginaDeContrasena({ campos, error }) {
  const ocultos = Object.entries(campos)
    .filter(([, valor]) => valor !== undefined && valor !== null && valor !== "")
    .map(([nombre, valor]) => `<input type="hidden" name="${escapar(nombre)}" value="${escapar(valor)}">`)
    .join("");

  return envoltura(
    "Conectar Mercado Pago",
    `<p class="marca">Conector · Mercado Pago</p>
     <h1>Contraseña del conector</h1>
     <p class="ayuda">La aplicación que te trajo hasta acá va a poder leer los pagos de tu cuenta de Mercado Pago.</p>
     ${error ? `<p class="error">${escapar(error)}</p>` : ""}
     <form method="post" action="/oauth/authorize">
       ${ocultos}
       <label for="contrasena">Contraseña</label>
       <input id="contrasena" name="contrasena" type="password" autocomplete="current-password" autofocus required>
       <button type="submit">Conectar</button>
     </form>
     <p class="pie">Si no fuiste vos quien abrió esta ventana, cerrala.</p>`
  );
}

export function paginaDeError(titulo, detalle) {
  return envoltura(
    titulo,
    `<p class="marca">Conector · Mercado Pago</p>
     <h1>${escapar(titulo)}</h1>
     <p class="ayuda">${escapar(detalle)}</p>`
  );
}

export function paginaDeInicio(origen, configurado) {
  return envoltura(
    "Conector de Mercado Pago",
    `<p class="marca">Conector · Mercado Pago</p>
     <h1>Servidor MCP en pie</h1>
     <p class="ayuda">Esta dirección no es para abrir en el navegador: se pega en ChatGPT, en Ajustes → Conectores → Nuevo conector.</p>
     <label>Dirección del servidor</label>
     <input value="${escapar(origen)}/mcp" readonly onclick="this.select()">
     <p class="pie">Autenticación: <code>OAuth</code>.<br>
     Estado: ${configurado ? "configurado" : "<strong>faltan secretos</strong> (MP_ACCESS_TOKEN y CONNECTOR_PASSWORD)"}.</p>`
  );
}
