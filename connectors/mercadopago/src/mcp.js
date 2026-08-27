/*
 * El protocolo MCP, escrito a mano.
 *
 * MCP sobre HTTP es JSON-RPC 2.0 en un POST. Traer el SDK oficial para eso
 * significaría un node_modules, un bundler y un paso de build en un proyecto
 * que hoy no tiene ninguno de los tres. Son cinco métodos: initialize,
 * tools/list, tools/call, ping y el aviso de que el cliente arrancó.
 *
 * La respuesta puede ir como JSON pelado o envuelta en Server-Sent Events. El
 * protocolo deja elegir al servidor, pero algunos clientes se llevan mejor con
 * SSE, así que se usa SSE cuando el cliente dice aceptarlo.
 */

import { ErrorMercadoPago } from "./mercadopago.js";
import { catalogo, ejecutar, existe } from "./herramientas.js";

const VERSIONES = ["2025-06-18", "2025-03-26", "2024-11-05"];
const VERSION_PREFERIDA = VERSIONES[0];

export const INFO = { name: "mercadopago", title: "Mercado Pago", version: "1.0.0" };

const INSTRUCCIONES = [
  "Herramientas para leer y operar una cuenta de Mercado Pago.",
  "Los montos vienen en la moneda de la cuenta y las comisiones ya están descontadas en el campo 'neto'.",
  "Las fechas se escriben AAAA-MM-DD y se interpretan en el huso de la cuenta.",
  "Antes de dar cifras de un período conviene usar resumen_de_ventas en vez de sumar a mano los resultados de buscar_pagos."
].join(" ");

function respuesta(id, resultado) {
  return { jsonrpc: "2.0", id, result: resultado };
}

function falla(id, codigo, mensaje, datos) {
  const error = { code: codigo, message: mensaje };
  if (datos !== undefined) error.data = datos;
  return { jsonrpc: "2.0", id: id ?? null, error };
}

async function despachar(mensaje, env, cache) {
  const { id, method, params } = mensaje || {};

  switch (method) {
    case "initialize": {
      const pedida = params?.protocolVersion;
      return respuesta(id, {
        protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSION_PREFERIDA,
        capabilities: { tools: { listChanged: false } },
        serverInfo: INFO,
        instructions: INSTRUCCIONES
      });
    }

    case "ping":
      return respuesta(id, {});

    case "tools/list":
      return respuesta(id, { tools: catalogo });

    /* Clientes que no leen las capabilities igual preguntan por estos dos. */
    case "resources/list":
      return respuesta(id, { resources: [] });

    case "resources/templates/list":
      return respuesta(id, { resourceTemplates: [] });

    case "prompts/list":
      return respuesta(id, { prompts: [] });

    case "tools/call": {
      const nombre = params?.name;
      if (!existe(nombre)) return falla(id, -32602, `No existe la herramienta "${nombre}".`);

      try {
        const resultado = await ejecutar(nombre, params?.arguments, env, cache);
        return respuesta(id, {
          content: [{ type: "text", text: JSON.stringify(resultado, null, 2) }],
          structuredContent: resultado
        });
      } catch (error) {
        /*
         * Un error de Mercado Pago no es un error del protocolo: el modelo
         * tiene que poder leerlo y decidir qué hacer, así que viaja como
         * resultado con isError en vez de romper la llamada.
         */
        const mensaje =
          error instanceof ErrorMercadoPago
            ? error.message
            : "Error inesperado ejecutando la herramienta: " + (error?.message || String(error));
        return respuesta(id, { content: [{ type: "text", text: mensaje }], isError: true });
      }
    }

    default:
      /* Los avisos (notifications/*) no llevan id y no esperan respuesta. */
      if (id === undefined || id === null) return null;
      return falla(id, -32601, `Método no soportado: ${method}`);
  }
}

function comoSse(cuerpo) {
  return new Response(`event: message\ndata: ${JSON.stringify(cuerpo)}\n\n`, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive"
    }
  });
}

function comoJson(cuerpo, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export async function manejarMcp(peticion, env) {
  let mensaje;
  try {
    mensaje = await peticion.json();
  } catch {
    return comoJson(falla(null, -32700, "El cuerpo no es JSON válido."), 400);
  }

  /* Una caché por request: /users/me se pide en casi todas las herramientas. */
  const cache = {};
  const aceptaSse = (peticion.headers.get("accept") || "").includes("text/event-stream");

  /* El protocolo viejo permitía mandar varios mensajes en un array. */
  if (Array.isArray(mensaje)) {
    const salidas = [];
    for (const item of mensaje) {
      const salida = await despachar(item, env, cache);
      if (salida) salidas.push(salida);
    }
    if (!salidas.length) return new Response(null, { status: 202 });
    return aceptaSse ? comoSse(salidas) : comoJson(salidas);
  }

  const salida = await despachar(mensaje, env, cache);
  if (!salida) return new Response(null, { status: 202 });
  return aceptaSse ? comoSse(salida) : comoJson(salida);
}
