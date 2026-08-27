/*
 * Cliente de la API de Mercado Pago.
 *
 * Una sola función hace todas las llamadas para que el manejo de errores viva
 * en un lugar. Mercado Pago devuelve los errores en un formato propio
 * ({ message, error, cause: [...] }) que sin traducir llega a ChatGPT como
 * ruido; acá se convierte en una frase que se entiende leyéndola.
 */

const API = "https://api.mercadopago.com";

export class ErrorMercadoPago extends Error {
  constructor(mensaje, estado, detalle) {
    super(mensaje);
    this.name = "ErrorMercadoPago";
    this.estado = estado;
    this.detalle = detalle;
  }
}

function leerMensaje(estado, cuerpo) {
  const causas = Array.isArray(cuerpo?.cause)
    ? cuerpo.cause.map((c) => c?.description || c?.message || c?.code).filter(Boolean)
    : [];
  const base = cuerpo?.message || cuerpo?.error || "";

  if (estado === 401) {
    return "Mercado Pago rechazó el access token (401). Revisá que MP_ACCESS_TOKEN esté puesto y vigente.";
  }
  if (estado === 403) {
    return "Mercado Pago no autoriza esta operación con este access token (403). Suele faltar un permiso de la aplicación." +
      (base ? " Dijo: " + base : "");
  }
  if (estado === 404) {
    return "Mercado Pago no encontró ese recurso (404)." + (base ? " Dijo: " + base : "");
  }
  if (estado === 429) {
    return "Mercado Pago está limitando la cantidad de pedidos (429). Esperá unos segundos y probá de nuevo.";
  }

  const partes = [base || `Mercado Pago respondió ${estado}.`];
  if (causas.length) partes.push("Causa: " + causas.join("; ") + ".");
  return partes.join(" ");
}

export async function llamar(env, ruta, opciones = {}) {
  const token = env.MP_ACCESS_TOKEN;
  if (!token) {
    throw new ErrorMercadoPago(
      "Falta el access token. Configuralo con: wrangler secret put MP_ACCESS_TOKEN",
      0,
      null
    );
  }

  const url = new URL(ruta.startsWith("http") ? ruta : API + ruta);
  for (const [clave, valor] of Object.entries(opciones.query || {})) {
    if (valor === undefined || valor === null || valor === "") continue;
    url.searchParams.set(clave, String(valor));
  }

  const cabeceras = {
    Authorization: "Bearer " + token,
    Accept: "application/json"
  };
  if (opciones.cuerpo !== undefined) cabeceras["Content-Type"] = "application/json";
  if (opciones.idempotencia) cabeceras["X-Idempotency-Key"] = opciones.idempotencia;

  let respuesta;
  try {
    respuesta = await fetch(url.toString(), {
      method: opciones.metodo || "GET",
      headers: cabeceras,
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo)
    });
  } catch (error) {
    throw new ErrorMercadoPago("No se pudo contactar a Mercado Pago: " + error.message, 0, null);
  }

  const texto = await respuesta.text();
  let datos = null;
  if (texto) {
    try {
      datos = JSON.parse(texto);
    } catch {
      datos = { message: texto.slice(0, 500) };
    }
  }

  if (!respuesta.ok) throw new ErrorMercadoPago(leerMensaje(respuesta.status, datos), respuesta.status, datos);
  return datos;
}

/*
 * Cada país tiene su dominio y su moneda. Se usa para armar los links al panel
 * y para no obligar a escribir la moneda en cada link de pago.
 */
const PAISES = {
  MLA: { dominio: "mercadopago.com.ar", moneda: "ARS", nombre: "Argentina" },
  MLB: { dominio: "mercadopago.com.br", moneda: "BRL", nombre: "Brasil" },
  MLM: { dominio: "mercadopago.com.mx", moneda: "MXN", nombre: "México" },
  MLC: { dominio: "mercadopago.cl", moneda: "CLP", nombre: "Chile" },
  MCO: { dominio: "mercadopago.com.co", moneda: "COP", nombre: "Colombia" },
  MLU: { dominio: "mercadopago.com.uy", moneda: "UYU", nombre: "Uruguay" },
  MPE: { dominio: "mercadopago.com.pe", moneda: "PEN", nombre: "Perú" }
};

export function pais(siteId) {
  return PAISES[siteId] || PAISES.MLA;
}

export function linkDelPago(id, siteId) {
  return `https://www.${pais(siteId).dominio}/activities/detail/${id}`;
}

/* Una sola consulta a /users/me por request; se pide bastante seguido. */
export async function cuenta(env, cache) {
  if (cache && cache.cuenta) return cache.cuenta;
  const datos = await llamar(env, "/users/me");
  if (cache) cache.cuenta = datos;
  return datos;
}

/*
 * Mercado Pago quiere fechas ISO con huso. Acá se aceptan tres formas de
 * escribirlas —"2026-08-01", "2026-08-01T14:30" o el ISO completo— porque el
 * modelo manda cualquiera de las tres y no tiene sentido rechazar una fecha
 * por el formato.
 */
export function instante(valor, husoHorario, finDelDia) {
  if (!valor) return null;
  const texto = String(valor).trim();
  const huso = husoHorario || "-03:00";

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return texto + (finDelDia ? "T23:59:59.999" : "T00:00:00.000") + huso;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(texto)) return texto + ":00.000" + huso;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(texto)) return texto + ".000" + huso;
  return texto;
}

export function redondear(numero) {
  if (typeof numero !== "number" || !Number.isFinite(numero)) return null;
  return Math.round(numero * 100) / 100;
}

export function comision(pago) {
  const detalles = Array.isArray(pago?.fee_details) ? pago.fee_details : [];
  const total = detalles.reduce((suma, item) => suma + (Number(item?.amount) || 0), 0);
  return redondear(total) ?? 0;
}

/*
 * El pago crudo de Mercado Pago trae más de cien campos. Mandarlos enteros
 * gasta contexto de ChatGPT sin agregar nada, así que queda lo que se mira:
 * cuánto entró, cuándo, de quién y por qué medio.
 */
export function resumirPago(pago, siteId) {
  const bruto = Number(pago?.transaction_amount) || 0;
  const cobrado = comision(pago);
  const neto = pago?.transaction_details?.net_received_amount;

  return {
    id: pago?.id,
    estado: pago?.status,
    detalle_del_estado: pago?.status_detail,
    fecha: pago?.date_created,
    fecha_de_acreditacion: pago?.date_approved || null,
    monto: redondear(bruto),
    comision: cobrado,
    neto: redondear(typeof neto === "number" ? neto : bruto - cobrado),
    moneda: pago?.currency_id,
    descripcion: pago?.description || null,
    medio_de_pago: pago?.payment_method_id || null,
    tipo_de_medio: pago?.payment_type_id || null,
    cuotas: pago?.installments ?? null,
    pagador: {
      nombre: [pago?.payer?.first_name, pago?.payer?.last_name].filter(Boolean).join(" ") || null,
      email: pago?.payer?.email || null,
      identificacion: pago?.payer?.identification?.number || null
    },
    referencia_externa: pago?.external_reference || null,
    devuelto: redondear(Number(pago?.transaction_amount_refunded) || 0),
    link: pago?.id ? linkDelPago(pago.id, siteId) : null
  };
}
