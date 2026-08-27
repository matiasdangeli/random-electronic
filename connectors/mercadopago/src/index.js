/*
 * Conector de Mercado Pago para ChatGPT.
 *
 * Un solo Worker con tres cosas adentro: un servidor MCP en /mcp, el OAuth
 * mínimo que ChatGPT necesita para llegar hasta ahí, y una portada que sirve
 * para confirmar de un vistazo que el deploy salió bien.
 *
 * La dirección que se pega en ChatGPT es https://<worker>/mcp
 */

import { manejarMcp } from "./mcp.js";
import {
  CORS,
  autenticar,
  emitirTokens,
  json,
  metadatosDelRecurso,
  metadatosDelServidor,
  mostrarAutorizacion,
  pedirAutenticacion,
  preflight,
  procesarAutorizacion,
  registrar
} from "./oauth.js";
import { paginaDeInicio } from "./paginas.js";

/* Los clientes MCP prueban la ruta pelada y también con el recurso pegado. */
function esWellKnown(ruta, nombre) {
  return ruta === `/.well-known/${nombre}` || ruta.startsWith(`/.well-known/${nombre}/`);
}

function texto(cuerpo, estado) {
  return new Response(cuerpo, {
    status: estado,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS }
  });
}

export default {
  async fetch(peticion, env) {
    const url = new URL(peticion.url);
    const origen = url.origin;
    const ruta = url.pathname.replace(/\/+$/, "") || "/";
    const metodo = peticion.method.toUpperCase();

    if (metodo === "OPTIONS") return preflight();

    if (ruta === "/" && metodo === "GET") {
      const configurado = Boolean(env.MP_ACCESS_TOKEN && env.CONNECTOR_PASSWORD);
      return new Response(paginaDeInicio(origen, configurado), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    if (ruta === "/health") {
      return json({
        ok: true,
        access_token: Boolean(env.MP_ACCESS_TOKEN),
        contrasena: Boolean(env.CONNECTOR_PASSWORD),
        devoluciones: String(env.PERMITIR_DEVOLUCIONES).toLowerCase() === "true"
      });
    }

    if (esWellKnown(ruta, "oauth-authorization-server") || esWellKnown(ruta, "openid-configuration")) {
      return json(metadatosDelServidor(origen));
    }
    if (esWellKnown(ruta, "oauth-protected-resource")) {
      return json(metadatosDelRecurso(origen));
    }

    if (ruta === "/oauth/register" && metodo === "POST") return registrar(peticion, env);
    if (ruta === "/oauth/authorize" && metodo === "GET") return mostrarAutorizacion(peticion, env);
    if (ruta === "/oauth/authorize" && metodo === "POST") return procesarAutorizacion(peticion, env);
    if (ruta === "/oauth/token" && metodo === "POST") return emitirTokens(peticion, env);

    if (ruta === "/mcp" || ruta === "/sse" || ruta === "/messages") {
      if (metodo !== "POST") {
        /*
         * El transporte viejo abría un stream con GET /sse. Este Worker no lo
         * implementa: mantener ese stream abierto exigiría estado compartido
         * entre pedidos, y el transporte nuevo —POST con la respuesta en el
         * mismo pedido— hace lo mismo sin nada de eso.
         */
        return texto("Este servidor habla MCP por Streamable HTTP. Usá POST " + origen + "/mcp", 405);
      }

      /*
       * Sin contraseña configurada no hay forma de distinguir a Mati de
       * cualquiera, así que el conector se niega a atender en vez de quedar
       * abierto.
       */
      if (!env.CONNECTOR_PASSWORD) {
        return json(
          {
            error: "sin_configurar",
            error_description:
              "El conector no tiene contraseña. Configurala con: wrangler secret put CONNECTOR_PASSWORD"
          },
          503
        );
      }

      if (!(await autenticar(peticion, env))) return pedirAutenticacion(origen);
      return manejarMcp(peticion, env);
    }

    return texto("No existe esa ruta. El servidor MCP está en " + origen + "/mcp", 404);
  }
};
