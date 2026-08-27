/*
 * El servidor OAuth mínimo que pide ChatGPT.
 *
 * En el formulario de "Nuevo conector", ChatGPT ofrece OAuth o nada. "Nada"
 * quiere decir que cualquiera con la dirección entra a la cuenta de Mercado
 * Pago, así que hay OAuth. Pero acá no hay usuarios ni cuentas: hay una sola
 * persona y una contraseña. Entonces este servidor implementa lo justo del
 * estándar para que ChatGPT lo entienda —descubrimiento, registro dinámico,
 * código de autorización con PKCE y refresh— y del otro lado la "identidad"
 * es esa contraseña.
 *
 * No se confunda con el OAuth de Mercado Pago: eso es otra cosa, sirve para
 * operar cuentas ajenas. Este conector opera la propia, con su access token.
 */

import { claveDeFirma, desafioPkce, firmar, idAlAzar, igualSeguro, verificar } from "./firmas.js";
import { paginaDeContrasena, paginaDeError } from "./paginas.js";

const VIDA_DEL_CODIGO = 5 * 60;
const VIDA_DEL_ACCESO = 24 * 60 * 60;
const VIDA_DEL_REFRESCO = 90 * 24 * 60 * 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "WWW-Authenticate"
};

export function json(cuerpo, estado = 200, cabeceras = {}) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS,
      ...cabeceras
    }
  });
}

function html(cuerpo, estado = 200) {
  return new Response(cuerpo, {
    status: estado,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function errorOauth(codigo, descripcion, estado = 400) {
  return json({ error: codigo, error_description: descripcion }, estado);
}

export function metadatosDelServidor(origen) {
  return {
    issuer: origen,
    authorization_endpoint: `${origen}/oauth/authorize`,
    token_endpoint: `${origen}/oauth/token`,
    registration_endpoint: `${origen}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mercadopago"],
    service_documentation: `${origen}/`
  };
}

export function metadatosDelRecurso(origen) {
  return {
    resource: `${origen}/mcp`,
    authorization_servers: [origen],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mercadopago"]
  };
}

/* Una redirección solo vale si es https, o localhost mientras se prueba. */
function redireccionAceptable(valor) {
  let url;
  try {
    url = new URL(valor);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

export async function registrar(peticion, env) {
  let cuerpo;
  try {
    cuerpo = await peticion.json();
  } catch {
    return errorOauth("invalid_client_metadata", "El cuerpo del registro no es JSON válido.");
  }

  const redirecciones = Array.isArray(cuerpo?.redirect_uris) ? cuerpo.redirect_uris.filter(Boolean) : [];
  if (!redirecciones.length) {
    return errorOauth("invalid_redirect_uri", "Hay que declarar al menos un redirect_uri.");
  }
  if (!redirecciones.every(redireccionAceptable)) {
    return errorOauth("invalid_redirect_uri", "Los redirect_uri tienen que ser https (o localhost para pruebas).");
  }

  /*
   * No hay dónde guardar los clientes registrados, así que el client_id ES el
   * registro: lleva adentro sus redirect_uri, firmados. Si alguien lo edita
   * para colar otra dirección, la firma deja de cerrar.
   */
  const clientId = await firmar(
    { t: "cli", ru: redirecciones, n: idAlAzar(""), iat: Math.floor(Date.now() / 1000) },
    claveDeFirma(env)
  );

  return json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirecciones,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: cuerpo?.client_name || "Cliente MCP"
    },
    201
  );
}

async function leerPedidoDeAutorizacion(parametros, env) {
  const cliente = await verificar(parametros.get("client_id") || "", claveDeFirma(env));
  if (!cliente || cliente.t !== "cli") {
    return { error: "Este cliente no está registrado en el conector. Volvé a agregarlo desde cero." };
  }

  const redireccion = parametros.get("redirect_uri");
  if (!redireccion || !cliente.ru.includes(redireccion)) {
    return { error: "La dirección de retorno no coincide con la que registró el cliente." };
  }

  const desafio = parametros.get("code_challenge");
  const metodo = parametros.get("code_challenge_method");
  if (!desafio || metodo !== "S256") {
    return { error: "Falta PKCE con code_challenge_method=S256.", redireccion, oauth: "invalid_request" };
  }
  if (parametros.get("response_type") !== "code") {
    return { error: "Solo se admite response_type=code.", redireccion, oauth: "unsupported_response_type" };
  }

  return {
    clientId: parametros.get("client_id"),
    redireccion,
    desafio,
    estado: parametros.get("state") || "",
    recurso: parametros.get("resource") || "",
    alcance: parametros.get("scope") || ""
  };
}

function camposDelFormulario(pedido) {
  return {
    client_id: pedido.clientId,
    redirect_uri: pedido.redireccion,
    code_challenge: pedido.desafio,
    code_challenge_method: "S256",
    response_type: "code",
    state: pedido.estado,
    resource: pedido.recurso,
    scope: pedido.alcance
  };
}

function volverConError(redireccion, estado, codigo, descripcion) {
  const destino = new URL(redireccion);
  destino.searchParams.set("error", codigo);
  destino.searchParams.set("error_description", descripcion);
  if (estado) destino.searchParams.set("state", estado);
  return Response.redirect(destino.toString(), 302);
}

export async function mostrarAutorizacion(peticion, env) {
  const pedido = await leerPedidoDeAutorizacion(new URL(peticion.url).searchParams, env);
  if (pedido.error) {
    if (pedido.redireccion) {
      return volverConError(pedido.redireccion, "", pedido.oauth || "invalid_request", pedido.error);
    }
    return html(paginaDeError("No se puede conectar", pedido.error), 400);
  }
  if (!env.CONNECTOR_PASSWORD) {
    return html(
      paginaDeError(
        "Falta configurar el conector",
        "El Worker todavía no tiene contraseña. Configurala con: wrangler secret put CONNECTOR_PASSWORD"
      ),
      503
    );
  }
  return html(paginaDeContrasena({ campos: camposDelFormulario(pedido), error: null }));
}

export async function procesarAutorizacion(peticion, env) {
  const formulario = new URLSearchParams(await peticion.text());
  const pedido = await leerPedidoDeAutorizacion(formulario, env);
  if (pedido.error) {
    if (pedido.redireccion) {
      return volverConError(pedido.redireccion, "", pedido.oauth || "invalid_request", pedido.error);
    }
    return html(paginaDeError("No se puede conectar", pedido.error), 400);
  }

  const esperada = env.CONNECTOR_PASSWORD;
  if (!esperada || !(await igualSeguro(formulario.get("contrasena") || "", esperada))) {
    return html(
      paginaDeContrasena({ campos: camposDelFormulario(pedido), error: "La contraseña no coincide." }),
      401
    );
  }

  const codigo = await firmar(
    {
      t: "code",
      c: pedido.clientId,
      ru: pedido.redireccion,
      cc: pedido.desafio,
      n: idAlAzar(""),
      exp: Math.floor(Date.now() / 1000) + VIDA_DEL_CODIGO
    },
    claveDeFirma(env)
  );

  const destino = new URL(pedido.redireccion);
  destino.searchParams.set("code", codigo);
  if (pedido.estado) destino.searchParams.set("state", pedido.estado);
  return Response.redirect(destino.toString(), 302);
}

async function emitirPar(clientId, env) {
  const ahora = Math.floor(Date.now() / 1000);
  const secreto = claveDeFirma(env);

  return {
    access_token: await firmar({ t: "acc", c: clientId, exp: ahora + VIDA_DEL_ACCESO }, secreto),
    token_type: "Bearer",
    expires_in: VIDA_DEL_ACCESO,
    refresh_token: await firmar({ t: "ref", c: clientId, exp: ahora + VIDA_DEL_REFRESCO }, secreto),
    scope: "mercadopago"
  };
}

export async function emitirTokens(peticion, env) {
  const tipo = peticion.headers.get("content-type") || "";
  let campos;
  if (tipo.includes("application/json")) {
    try {
      campos = new URLSearchParams(Object.entries(await peticion.json()).map(([k, v]) => [k, String(v)]));
    } catch {
      return errorOauth("invalid_request", "El cuerpo no es JSON válido.");
    }
  } else {
    campos = new URLSearchParams(await peticion.text());
  }

  const secreto = claveDeFirma(env);
  const tipoDeConcesion = campos.get("grant_type");

  if (tipoDeConcesion === "refresh_token") {
    const refresco = await verificar(campos.get("refresh_token") || "", secreto);
    if (!refresco || refresco.t !== "ref") {
      return errorOauth("invalid_grant", "El refresh token no es válido o venció.");
    }
    return json(await emitirPar(refresco.c, env));
  }

  if (tipoDeConcesion !== "authorization_code") {
    return errorOauth("unsupported_grant_type", `grant_type no soportado: ${tipoDeConcesion}`);
  }

  const codigo = await verificar(campos.get("code") || "", secreto);
  if (!codigo || codigo.t !== "code") {
    return errorOauth("invalid_grant", "El código de autorización no es válido o venció.");
  }
  if (campos.get("redirect_uri") && campos.get("redirect_uri") !== codigo.ru) {
    return errorOauth("invalid_grant", "El redirect_uri no coincide con el del código.");
  }
  if (campos.get("client_id") && campos.get("client_id") !== codigo.c) {
    return errorOauth("invalid_grant", "El client_id no coincide con el del código.");
  }

  const verificador = campos.get("code_verifier");
  if (!verificador || (await desafioPkce(verificador)) !== codigo.cc) {
    return errorOauth("invalid_grant", "El code_verifier de PKCE no coincide.");
  }

  return json(await emitirPar(codigo.c, env));
}

/* Devuelve el contenido del token si el pedido trae uno válido. */
export async function autenticar(peticion, env) {
  const cabecera = peticion.headers.get("authorization") || "";
  const [esquema, valor] = cabecera.split(" ");
  if (!valor || esquema.toLowerCase() !== "bearer") return null;
  const datos = await verificar(valor, claveDeFirma(env));
  return datos && datos.t === "acc" ? datos : null;
}

export function pedirAutenticacion(origen) {
  return json({ error: "invalid_token", error_description: "Falta un access token válido." }, 401, {
    "WWW-Authenticate": `Bearer resource_metadata="${origen}/.well-known/oauth-protected-resource"`
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: { ...CORS, "Access-Control-Max-Age": "86400" } });
}

export { CORS };
