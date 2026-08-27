/*
 * Pruebas del conector, sin desplegar nada.
 *
 * El Worker es una función que recibe un Request y devuelve un Response, así
 * que se la puede llamar desde Node igual que la llamaría Cloudflare. Lo único
 * que se reemplaza es fetch: en vez de salir a Mercado Pago, responde lo que
 * diga cada prueba. Eso permite ejercitar el baile completo de OAuth y las
 * herramientas sin tocar una cuenta real.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";
import { desafioPkce } from "../src/firmas.js";

const ORIGEN = "https://conector.ejemplo.workers.dev";
const RETORNO = "https://chatgpt.com/connector_platform_oauth_redirect";

const env = {
  MP_ACCESS_TOKEN: "APP_USR-token-de-prueba",
  CONNECTOR_PASSWORD: "clave-secreta",
  ZONA_HORARIA: "-03:00",
  PERMITIR_DEVOLUCIONES: "false"
};

const fetchOriginal = globalThis.fetch;
let respuestasFalsas = [];
let llamadas = [];

function responderCon(coincide, cuerpo, estado = 200) {
  respuestasFalsas.push({ coincide, cuerpo, estado });
}

before(() => {
  globalThis.fetch = async (url, opciones = {}) => {
    const direccion = String(url);
    llamadas.push({ url: direccion, ...opciones });
    const falsa = respuestasFalsas.find((item) => direccion.includes(item.coincide));
    if (!falsa) throw new Error("Llamada no esperada a " + direccion);
    return new Response(JSON.stringify(falsa.cuerpo), {
      status: falsa.estado,
      headers: { "Content-Type": "application/json" }
    });
  };
});

after(() => {
  globalThis.fetch = fetchOriginal;
});

function pedir(ruta, opciones = {}) {
  return worker.fetch(new Request(ORIGEN + ruta, { redirect: "manual", ...opciones }), env);
}

async function rpc(token, cuerpo, accept = "application/json") {
  const respuesta = await pedir("/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: accept, Authorization: "Bearer " + token },
    body: JSON.stringify(cuerpo)
  });
  return respuesta;
}

/* Hace el baile completo de OAuth y devuelve un access token utilizable. */
async function conectar(contrasena = "clave-secreta") {
  const registro = await (
    await pedir("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uris: [RETORNO], client_name: "ChatGPT" })
    })
  ).json();

  const verificador = "verificador-de-prueba-con-largo-suficiente-123456";
  const desafio = await desafioPkce(verificador);
  const parametros = new URLSearchParams({
    response_type: "code",
    client_id: registro.client_id,
    redirect_uri: RETORNO,
    code_challenge: desafio,
    code_challenge_method: "S256",
    state: "abc123"
  });

  const formulario = new URLSearchParams(parametros);
  formulario.set("contrasena", contrasena);
  const autorizacion = await pedir("/oauth/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formulario.toString()
  });

  return { registro, verificador, parametros, autorizacion };
}

async function tokenValido() {
  const { registro, verificador, autorizacion } = await conectar();
  const codigo = new URL(autorizacion.headers.get("location")).searchParams.get("code");
  const respuesta = await pedir("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: codigo,
      redirect_uri: RETORNO,
      client_id: registro.client_id,
      code_verifier: verificador
    }).toString()
  });
  return (await respuesta.json()).access_token;
}

describe("portada y descubrimiento", () => {
  it("la portada muestra la dirección que se pega en ChatGPT", async () => {
    const respuesta = await pedir("/");
    const cuerpo = await respuesta.text();
    assert.equal(respuesta.status, 200);
    assert.ok(cuerpo.includes(ORIGEN + "/mcp"));
  });

  it("publica los metadatos del servidor de autorización", async () => {
    const datos = await (await pedir("/.well-known/oauth-authorization-server")).json();
    assert.equal(datos.issuer, ORIGEN);
    assert.equal(datos.authorization_endpoint, ORIGEN + "/oauth/authorize");
    assert.deepEqual(datos.code_challenge_methods_supported, ["S256"]);
  });

  it("publica los metadatos del recurso protegido, con o sin el recurso pegado", async () => {
    for (const ruta of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp"
    ]) {
      const datos = await (await pedir(ruta)).json();
      assert.equal(datos.resource, ORIGEN + "/mcp");
      assert.deepEqual(datos.authorization_servers, [ORIGEN]);
    }
  });

  it("/health informa qué falta configurar", async () => {
    const datos = await (await pedir("/health")).json();
    assert.deepEqual(datos, { ok: true, access_token: true, contrasena: true, devoluciones: false });
  });
});

describe("OAuth", () => {
  it("rechaza registrar una dirección de retorno insegura", async () => {
    const respuesta = await pedir("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["http://atacante.example/callback"] })
    });
    assert.equal(respuesta.status, 400);
    assert.equal((await respuesta.json()).error, "invalid_redirect_uri");
  });

  it("muestra el formulario de contraseña", async () => {
    const { registro } = await conectar();
    const parametros = new URLSearchParams({
      response_type: "code",
      client_id: registro.client_id,
      redirect_uri: RETORNO,
      code_challenge: await desafioPkce("x".repeat(50)),
      code_challenge_method: "S256",
      state: "abc123"
    });
    const respuesta = await pedir("/oauth/authorize?" + parametros.toString());
    const cuerpo = await respuesta.text();
    assert.equal(respuesta.status, 200);
    assert.ok(cuerpo.includes('name="contrasena"'));
    assert.ok(cuerpo.includes('value="abc123"'));
  });

  it("no deja pasar con la contraseña equivocada", async () => {
    const { autorizacion } = await conectar("no-es-esta");
    assert.equal(autorizacion.status, 401);
    assert.ok((await autorizacion.text()).includes("no coincide"));
  });

  it("con la contraseña correcta vuelve con código y state", async () => {
    const { autorizacion } = await conectar();
    assert.equal(autorizacion.status, 302);
    const destino = new URL(autorizacion.headers.get("location"));
    assert.equal(destino.origin + destino.pathname, RETORNO);
    assert.ok(destino.searchParams.get("code"));
    assert.equal(destino.searchParams.get("state"), "abc123");
  });

  it("no acepta un client_id manipulado", async () => {
    const { registro } = await conectar();
    const parametros = new URLSearchParams({
      response_type: "code",
      client_id: registro.client_id.slice(0, -4) + "aaaa",
      redirect_uri: RETORNO,
      code_challenge: await desafioPkce("x".repeat(50)),
      code_challenge_method: "S256"
    });
    const respuesta = await pedir("/oauth/authorize?" + parametros.toString());
    assert.equal(respuesta.status, 400);
    assert.ok((await respuesta.text()).includes("no está registrado"));
  });

  it("exige PKCE S256", async () => {
    const { registro } = await conectar();
    const parametros = new URLSearchParams({
      response_type: "code",
      client_id: registro.client_id,
      redirect_uri: RETORNO,
      code_challenge: "loquesea",
      code_challenge_method: "plain"
    });
    const respuesta = await pedir("/oauth/authorize?" + parametros.toString());
    assert.equal(respuesta.status, 302);
    assert.ok(respuesta.headers.get("location").includes("error=invalid_request"));
  });

  it("canjea el código por un token y rechaza el verificador equivocado", async () => {
    const { registro, verificador, autorizacion } = await conectar();
    const codigo = new URL(autorizacion.headers.get("location")).searchParams.get("code");

    const conVerificadorMalo = await pedir("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: codigo,
        redirect_uri: RETORNO,
        code_verifier: "otro-verificador-cualquiera"
      }).toString()
    });
    assert.equal(conVerificadorMalo.status, 400);
    assert.equal((await conVerificadorMalo.json()).error, "invalid_grant");

    const respuesta = await pedir("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: codigo,
        redirect_uri: RETORNO,
        client_id: registro.client_id,
        code_verifier: verificador
      }).toString()
    });
    const datos = await respuesta.json();
    assert.equal(respuesta.status, 200);
    assert.equal(datos.token_type, "Bearer");
    assert.ok(datos.access_token);
    assert.ok(datos.refresh_token);

    const refrescado = await pedir("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: datos.refresh_token
      }).toString()
    });
    assert.equal(refrescado.status, 200);
    assert.ok((await refrescado.json()).access_token);
  });
});

describe("acceso al servidor MCP", () => {
  it("sin token responde 401 y dice dónde está el servidor de autorización", async () => {
    const respuesta = await pedir("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    });
    assert.equal(respuesta.status, 401);
    assert.ok(respuesta.headers.get("www-authenticate").includes("oauth-protected-resource"));
  });

  it("con un token inventado también responde 401", async () => {
    const respuesta = await rpc("token.falso", { jsonrpc: "2.0", id: 1, method: "tools/list" });
    assert.equal(respuesta.status, 401);
  });

  it("GET /sse explica que hay que usar POST /mcp", async () => {
    const respuesta = await pedir("/sse");
    assert.equal(respuesta.status, 405);
    assert.ok((await respuesta.text()).includes("/mcp"));
  });
});

describe("protocolo MCP", () => {
  let token;

  before(async () => {
    token = await tokenValido();
  });

  it("initialize devuelve la versión pedida y las herramientas", async () => {
    const datos = await (
      await rpc(token, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "chatgpt" } }
      })
    ).json();
    assert.equal(datos.result.protocolVersion, "2025-03-26");
    assert.equal(datos.result.serverInfo.name, "mercadopago");
    assert.ok(datos.result.capabilities.tools);
  });

  it("una versión desconocida cae en la más nueva que soporta el servidor", async () => {
    const datos = await (
      await rpc(token, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } })
    ).json();
    assert.equal(datos.result.protocolVersion, "2025-06-18");
  });

  it("un aviso no genera respuesta", async () => {
    const respuesta = await rpc(token, { jsonrpc: "2.0", method: "notifications/initialized" });
    assert.equal(respuesta.status, 202);
    assert.equal(await respuesta.text(), "");
  });

  it("tools/list trae el catálogo completo con sus anotaciones", async () => {
    const datos = await (await rpc(token, { jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
    const nombres = datos.result.tools.map((h) => h.name);
    assert.deepEqual(nombres, [
      "ver_cuenta",
      "ver_saldo",
      "buscar_pagos",
      "ver_pago",
      "resumen_de_ventas",
      "crear_link_de_pago",
      "ver_link_de_pago",
      "devolver_pago",
      "search",
      "fetch"
    ]);
    const devolver = datos.result.tools.find((h) => h.name === "devolver_pago");
    assert.equal(devolver.annotations.destructiveHint, true);
    assert.equal(devolver.annotations.readOnlyHint, false);
  });

  it("responde en formato SSE cuando el cliente lo acepta", async () => {
    const respuesta = await rpc(token, { jsonrpc: "2.0", id: 3, method: "ping" }, "text/event-stream");
    assert.ok(respuesta.headers.get("content-type").startsWith("text/event-stream"));
    const cuerpo = await respuesta.text();
    assert.ok(cuerpo.startsWith("event: message\ndata: "));
    assert.deepEqual(JSON.parse(cuerpo.slice(cuerpo.indexOf("{"), cuerpo.lastIndexOf("}") + 1)).result, {});
  });

  it("un método inexistente devuelve error de JSON-RPC", async () => {
    const datos = await (await rpc(token, { jsonrpc: "2.0", id: 4, method: "no/existe" })).json();
    assert.equal(datos.error.code, -32601);
  });

  it("un cuerpo que no es JSON devuelve error de parseo", async () => {
    const respuesta = await pedir("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: "{no es json"
    });
    assert.equal(respuesta.status, 400);
    assert.equal((await respuesta.json()).error.code, -32700);
  });
});

describe("herramientas contra una API simulada", () => {
  let token;

  before(async () => {
    token = await tokenValido();
    respuestasFalsas = [];
    responderCon("/users/me", { id: 4321, nickname: "RANDOMEC", email: "mati@ejemplo.com", site_id: "MLA" });
  });

  async function llamar(nombre, argumentos = {}) {
    const datos = await (
      await rpc(token, { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: nombre, arguments: argumentos } })
    ).json();
    return datos.result;
  }

  it("ver_cuenta detecta que el token es de producción", async () => {
    const resultado = await llamar("ver_cuenta");
    assert.equal(resultado.structuredContent.usuario, "RANDOMEC");
    assert.equal(resultado.structuredContent.pais, "Argentina");
    assert.equal(resultado.structuredContent.moneda, "ARS");
    assert.equal(resultado.structuredContent.modo_del_token, "producción");
  });

  it("buscar_pagos arma el rango de fechas con el huso de la cuenta", async () => {
    respuestasFalsas = respuestasFalsas.filter((r) => r.coincide === "/users/me");
    responderCon("/v1/payments/search", {
      paging: { total: 1, offset: 0 },
      results: [
        {
          id: 111,
          status: "approved",
          date_created: "2026-08-01T21:10:00.000-03:00",
          transaction_amount: 12000,
          currency_id: "ARS",
          fee_details: [{ amount: 744, type: "mercadopago_fee" }],
          transaction_details: { net_received_amount: 11256 },
          description: "Entrada RANDOM #70",
          payment_method_id: "visa",
          payer: { first_name: "Ana", last_name: "Gomez", email: "ana@ejemplo.com" }
        }
      ]
    });
    llamadas = [];

    const resultado = await llamar("buscar_pagos", { desde: "2026-08-01", hasta: "2026-08-31", estado: "approved" });
    const busqueda = llamadas.find((l) => l.url.includes("/v1/payments/search"));
    assert.ok(busqueda.url.includes("begin_date=2026-08-01T00%3A00%3A00.000-03%3A00"));
    assert.ok(busqueda.url.includes("end_date=2026-08-31T23%3A59%3A59.999-03%3A00"));
    assert.ok(busqueda.url.includes("status=approved"));

    const pago = resultado.structuredContent.pagos[0];
    assert.equal(pago.monto, 12000);
    assert.equal(pago.comision, 744);
    assert.equal(pago.neto, 11256);
    assert.equal(pago.pagador.nombre, "Ana Gomez");
    assert.equal(pago.link, "https://www.mercadopago.com.ar/activities/detail/111");
  });

  it("un estado inventado se rechaza sin llamar a Mercado Pago", async () => {
    const resultado = await llamar("buscar_pagos", { estado: "aprobadisimo" });
    assert.equal(resultado.isError, true);
    assert.ok(resultado.content[0].text.includes("Estado desconocido"));
  });

  it("resumen_de_ventas suma, descuenta comisiones y agrupa por día y medio", async () => {
    respuestasFalsas = respuestasFalsas.filter((r) => r.coincide === "/users/me");
    responderCon("/v1/payments/search", {
      paging: { total: 3, offset: 0 },
      results: [
        {
          id: 1,
          transaction_amount: 10000,
          currency_id: "ARS",
          fee_details: [{ amount: 620 }],
          date_approved: "2026-08-01T22:00:00.000-03:00",
          payment_method_id: "visa"
        },
        {
          id: 2,
          transaction_amount: 10000,
          currency_id: "ARS",
          fee_details: [{ amount: 620 }],
          date_approved: "2026-08-01T23:30:00.000-03:00",
          payment_method_id: "account_money"
        },
        {
          id: 3,
          transaction_amount: 5000,
          currency_id: "ARS",
          fee_details: [{ amount: 310 }],
          date_approved: "2026-08-02T01:00:00.000-03:00",
          payment_method_id: "visa"
        }
      ]
    });

    const resultado = await llamar("resumen_de_ventas", { desde: "2026-08-01", hasta: "2026-08-02" });
    const datos = resultado.structuredContent;
    assert.equal(datos.cantidad_de_pagos, 3);
    assert.equal(datos.total_bruto, 25000);
    assert.equal(datos.total_comisiones, 1550);
    assert.equal(datos.total_neto, 23450);
    assert.deepEqual(datos.por_dia, [
      { dia: "2026-08-01", monto: 20000 },
      { dia: "2026-08-02", monto: 5000 }
    ]);
    assert.deepEqual(datos.por_medio_de_pago[0], { medio: "visa", cantidad: 2, monto: 15000 });
    assert.equal(datos.aviso, null);
  });

  it("crear_link_de_pago manda el ítem y devuelve la dirección para compartir", async () => {
    respuestasFalsas = respuestasFalsas.filter((r) => r.coincide === "/users/me");
    responderCon("/checkout/preferences", {
      id: "pref-123",
      init_point: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-123",
      sandbox_init_point: "https://sandbox.mercadopago.com.ar/checkout"
    });
    llamadas = [];

    const resultado = await llamar("crear_link_de_pago", {
      titulo: "Entrada RANDOM #70",
      precio: 12000,
      cantidad: 2,
      referencia_externa: "random-70"
    });

    const creacion = llamadas.find((l) => l.url.includes("/checkout/preferences"));
    const cuerpo = JSON.parse(creacion.body);
    assert.equal(cuerpo.items[0].title, "Entrada RANDOM #70");
    assert.equal(cuerpo.items[0].quantity, 2);
    assert.equal(cuerpo.items[0].currency_id, "ARS");
    assert.equal(cuerpo.external_reference, "random-70");
    assert.equal(resultado.structuredContent.total, 24000);
    assert.ok(resultado.structuredContent.link.includes("pref-123"));
  });

  it("un precio en cero no llega a Mercado Pago", async () => {
    const resultado = await llamar("crear_link_de_pago", { titulo: "Gratis", precio: 0 });
    assert.equal(resultado.isError, true);
    assert.ok(resultado.content[0].text.includes("mayor a cero"));
  });

  it("una url de vuelta que no es una dirección web se rechaza acá", async () => {
    const resultado = await llamar("crear_link_de_pago", {
      titulo: "Entrada",
      precio: 100,
      url_de_vuelta: "randomelectronic.com"
    });
    assert.equal(resultado.isError, true);
    assert.ok(resultado.content[0].text.includes("https://"));
  });

  it("con url de vuelta válida se manda back_urls y auto_return", async () => {
    llamadas = [];
    await llamar("crear_link_de_pago", {
      titulo: "Entrada",
      precio: 100,
      url_de_vuelta: "https://randomelectronic.com/gracias",
      vence_en_horas: 48
    });
    const cuerpo = JSON.parse(llamadas.find((l) => l.url.includes("/checkout/preferences")).body);
    assert.equal(cuerpo.back_urls.success, "https://randomelectronic.com/gracias");
    assert.equal(cuerpo.auto_return, "approved");
    assert.equal(cuerpo.expires, true);
    assert.ok(cuerpo.expiration_date_to);
  });

  it("devolver_pago está apagado y lo dice", async () => {
    const resultado = await llamar("devolver_pago", { id: "111" });
    assert.equal(resultado.isError, true);
    assert.ok(resultado.content[0].text.includes("PERMITIR_DEVOLUCIONES"));
  });

  it("un 401 de Mercado Pago se traduce a algo accionable", async () => {
    respuestasFalsas = [];
    responderCon("/users/me", { message: "invalid_token" }, 401);
    const resultado = await llamar("ver_cuenta");
    assert.equal(resultado.isError, true);
    assert.ok(resultado.content[0].text.includes("MP_ACCESS_TOKEN"));
    respuestasFalsas = [];
    responderCon("/users/me", { id: 4321, nickname: "RANDOMEC", site_id: "MLA" });
  });

  it("search y fetch hablan el formato que espera ChatGPT", async () => {
    responderCon("/v1/payments/search", {
      paging: { total: 1 },
      results: [{ id: 222, status: "approved", transaction_amount: 9000, currency_id: "ARS", description: "Remera" }]
    });
    const busqueda = await llamar("search", { query: "2026-08-01 a 2026-08-31 approved" });
    assert.equal(busqueda.structuredContent.results[0].id, "222");
    assert.ok(busqueda.structuredContent.results[0].title.includes("Remera"));
    assert.ok(busqueda.structuredContent.results[0].url.includes("222"));

    responderCon("/v1/payments/222", {
      id: 222,
      status: "approved",
      transaction_amount: 9000,
      currency_id: "ARS",
      fee_details: []
    });
    const traido = await llamar("fetch", { id: "222" });
    assert.equal(traido.structuredContent.id, "222");
    assert.ok(traido.structuredContent.text.includes("approved"));
  });
});
