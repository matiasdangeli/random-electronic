/*
 * Las herramientas que ve ChatGPT.
 *
 * Criterio para elegirlas: lo que Mati mira o hace de verdad en Mercado Pago
 * —cuánto entró, de quién, y armar un link para cobrar una entrada— y nada
 * más. Cada herramienta que existe es una que el modelo puede llamar sola, así
 * que la lista corta no es pereza: es la superficie de riesgo.
 *
 * Las descripciones están en español porque son el único manual que lee el
 * modelo a la hora de elegir cuál usar.
 */

import {
  ErrorMercadoPago,
  comision,
  cuenta,
  instante,
  linkDelPago,
  llamar,
  pais,
  redondear,
  resumirPago
} from "./mercadopago.js";

const ESTADOS = [
  "approved",
  "pending",
  "in_process",
  "rejected",
  "cancelled",
  "refunded",
  "charged_back"
];

const TOPE_DE_PAGINAS = 10;

function texto(valor) {
  if (valor === undefined || valor === null) return null;
  const limpio = String(valor).trim();
  return limpio === "" ? null : limpio;
}

function numero(valor, nombre) {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new ErrorMercadoPago(`"${nombre}" tiene que ser un número.`, 0, null);
  return n;
}

function obligatorio(valor, nombre) {
  const limpio = texto(valor);
  if (!limpio) throw new ErrorMercadoPago(`Falta "${nombre}".`, 0, null);
  return limpio;
}

function entre(valor, minimo, maximo, porDefecto) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(maximo, Math.max(minimo, Math.trunc(n)));
}

/*
 * Mercado Pago rechaza una back_url que no sea una dirección web, pero el
 * error que devuelve no dice cuál de los campos estaba mal. Conviene atajarlo
 * acá, donde se sabe.
 */
function direccionWeb(valor, nombre) {
  const limpio = texto(valor);
  if (!limpio) return null;
  let url;
  try {
    url = new URL(limpio);
  } catch {
    throw new ErrorMercadoPago(`"${nombre}" tiene que ser una dirección web completa, con https://`, 0, null);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ErrorMercadoPago(`"${nombre}" tiene que empezar con https://`, 0, null);
  }
  return url.toString();
}

function validarEstado(valor) {
  const limpio = texto(valor);
  if (!limpio) return null;
  if (!ESTADOS.includes(limpio)) {
    throw new ErrorMercadoPago(
      `Estado desconocido: "${limpio}". Los válidos son ${ESTADOS.join(", ")}.`,
      0,
      null
    );
  }
  return limpio;
}

async function buscarPagosCrudo(env, cache, args) {
  const huso = env.ZONA_HORARIA || "-03:00";
  const rango = texto(args.rango) === "date_approved" ? "date_approved" : "date_created";

  return llamar(env, "/v1/payments/search", {
    query: {
      sort: rango,
      criteria: "desc",
      range: rango,
      begin_date: instante(args.desde, huso, false),
      end_date: instante(args.hasta, huso, true),
      status: validarEstado(args.estado),
      "payer.email": texto(args.email_del_pagador),
      external_reference: texto(args.referencia_externa),
      limit: args.limite,
      offset: args.desplazamiento || 0
    }
  });
}

/* ------------------------------------------------------------------ */

const definiciones = [
  {
    name: "ver_cuenta",
    title: "Ver la cuenta",
    description:
      "Muestra de qué cuenta de Mercado Pago se están leyendo los datos: usuario, país, mail y si el access token es de producción o de prueba. Sirve para confirmar que el conector apunta a la cuenta correcta antes de mirar plata.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    soloLectura: true,
    async ejecutar(env, cache) {
      const yo = await cuenta(env, cache);
      const modo = String(env.MP_ACCESS_TOKEN || "").startsWith("TEST-") ? "prueba" : "producción";
      return {
        id: yo.id,
        usuario: yo.nickname,
        nombre: [yo.first_name, yo.last_name].filter(Boolean).join(" ") || null,
        email: yo.email,
        pais: pais(yo.site_id).nombre,
        site_id: yo.site_id,
        moneda: pais(yo.site_id).moneda,
        modo_del_token: modo
      };
    }
  },

  {
    name: "ver_saldo",
    title: "Ver el saldo",
    description:
      "Saldo actual de la cuenta de Mercado Pago: disponible para usar y total incluyendo lo que todavía no se liberó.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    soloLectura: true,
    async ejecutar(env, cache) {
      const yo = await cuenta(env, cache);
      const saldo = await llamar(env, `/users/${yo.id}/mercadopago_account/balance`);
      return {
        disponible: redondear(Number(saldo?.available_balance)),
        total: redondear(Number(saldo?.total_balance)),
        no_disponible: redondear(Number(saldo?.unavailable_balance)),
        moneda: pais(yo.site_id).moneda
      };
    }
  },

  {
    name: "buscar_pagos",
    title: "Buscar pagos",
    description:
      "Lista los pagos recibidos, del más nuevo al más viejo. Se puede filtrar por rango de fechas, estado, mail de quien pagó o referencia externa. Devuelve monto, comisión, neto, medio de pago y pagador de cada uno.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Fecha de inicio, AAAA-MM-DD (o ISO completo). Inclusive." },
        hasta: { type: "string", description: "Fecha de fin, AAAA-MM-DD (o ISO completo). Inclusive." },
        estado: { type: "string", enum: ESTADOS, description: "Estado del pago. Vacío = todos." },
        email_del_pagador: { type: "string", description: "Mail exacto de quien pagó." },
        referencia_externa: { type: "string", description: "external_reference con el que se creó el cobro." },
        rango: {
          type: "string",
          enum: ["date_created", "date_approved"],
          description: "Sobre qué fecha filtrar: cuándo se creó el pago (default) o cuándo se acreditó."
        },
        limite: { type: "integer", minimum: 1, maximum: 50, description: "Cuántos traer. Default 20, máximo 50." },
        desplazamiento: { type: "integer", minimum: 0, description: "Cuántos saltear, para pedir la página siguiente." }
      },
      additionalProperties: false
    },
    soloLectura: true,
    async ejecutar(env, cache, args) {
      const yo = await cuenta(env, cache);
      const limite = entre(args.limite, 1, 50, 20);
      const datos = await buscarPagosCrudo(env, cache, { ...args, limite });
      const resultados = Array.isArray(datos?.results) ? datos.results : [];

      return {
        total_encontrados: datos?.paging?.total ?? resultados.length,
        mostrados: resultados.length,
        desplazamiento: datos?.paging?.offset ?? 0,
        pagos: resultados.map((pago) => resumirPago(pago, yo.site_id))
      };
    }
  },

  {
    name: "ver_pago",
    title: "Ver un pago",
    description: "Todo el detalle de un pago puntual a partir de su ID, incluyendo devoluciones y contracargos.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "ID del pago en Mercado Pago." } },
      required: ["id"],
      additionalProperties: false
    },
    soloLectura: true,
    async ejecutar(env, cache, args) {
      const yo = await cuenta(env, cache);
      const pago = await llamar(env, `/v1/payments/${encodeURIComponent(obligatorio(args.id, "id"))}`);
      const resumen = resumirPago(pago, yo.site_id);

      return {
        ...resumen,
        detalle_de_comisiones: (pago.fee_details || []).map((item) => ({
          tipo: item.type,
          monto: redondear(Number(item.amount)),
          quien_paga: item.fee_payer
        })),
        devoluciones: (pago.refunds || []).map((item) => ({
          id: item.id,
          monto: redondear(Number(item.amount)),
          fecha: item.date_created,
          estado: item.status
        })),
        cuotas: pago.installments ?? null,
        monto_por_cuota: redondear(Number(pago.transaction_details?.installment_amount)),
        orden: pago.order?.id || null,
        metadata: pago.metadata && Object.keys(pago.metadata).length ? pago.metadata : null
      };
    }
  },

  {
    name: "resumen_de_ventas",
    title: "Resumen de ventas",
    description:
      "Suma los pagos de un período y devuelve el total bruto, las comisiones, el neto, el promedio, el desglose por día y por medio de pago. Es la herramienta para preguntas como “cuánto entró este mes” o “cómo vino la fecha del viernes”.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Fecha de inicio, AAAA-MM-DD. Inclusive." },
        hasta: { type: "string", description: "Fecha de fin, AAAA-MM-DD. Inclusive." },
        estado: {
          type: "string",
          enum: ESTADOS,
          description: "Estado a sumar. Default approved, que es la plata que efectivamente entró."
        },
        referencia_externa: { type: "string", description: "Para sumar solo los cobros de un evento puntual." }
      },
      required: ["desde", "hasta"],
      additionalProperties: false
    },
    soloLectura: true,
    async ejecutar(env, cache, args) {
      const yo = await cuenta(env, cache);
      const estado = validarEstado(args.estado) || "approved";
      const pagos = [];
      let total = 0;
      let truncado = false;

      for (let pagina = 0; pagina < TOPE_DE_PAGINAS; pagina++) {
        const datos = await buscarPagosCrudo(env, cache, {
          ...args,
          estado,
          limite: 100,
          desplazamiento: pagina * 100
        });
        const lote = Array.isArray(datos?.results) ? datos.results : [];
        pagos.push(...lote);
        total = datos?.paging?.total ?? pagos.length;
        if (lote.length < 100 || pagos.length >= total) break;
        if (pagina === TOPE_DE_PAGINAS - 1) truncado = true;
      }

      const porDia = new Map();
      const porMedio = new Map();
      let bruto = 0;
      let comisiones = 0;

      for (const pago of pagos) {
        const monto = Number(pago.transaction_amount) || 0;
        const cobrado = comision(pago);
        bruto += monto;
        comisiones += cobrado;

        const dia = String(pago.date_approved || pago.date_created || "").slice(0, 10);
        porDia.set(dia, (porDia.get(dia) || 0) + monto);

        const medio = pago.payment_method_id || "desconocido";
        const acumulado = porMedio.get(medio) || { cantidad: 0, monto: 0 };
        acumulado.cantidad += 1;
        acumulado.monto += monto;
        porMedio.set(medio, acumulado);
      }

      return {
        periodo: { desde: args.desde, hasta: args.hasta, estado },
        cantidad_de_pagos: pagos.length,
        total_bruto: redondear(bruto),
        total_comisiones: redondear(comisiones),
        total_neto: redondear(bruto - comisiones),
        ticket_promedio: pagos.length ? redondear(bruto / pagos.length) : 0,
        moneda: pagos[0]?.currency_id || pais(yo.site_id).moneda,
        por_dia: [...porDia.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([dia, monto]) => ({ dia, monto: redondear(monto) })),
        por_medio_de_pago: [...porMedio.entries()]
          .sort((a, b) => b[1].monto - a[1].monto)
          .map(([medio, datos]) => ({ medio, cantidad: datos.cantidad, monto: redondear(datos.monto) })),
        aviso: truncado
          ? `El período tiene ${total} pagos y se sumaron los primeros ${pagos.length}. Partilo en rangos más cortos para tener el total exacto.`
          : null
      };
    }
  },

  {
    name: "crear_link_de_pago",
    title: "Crear un link de pago",
    description:
      "Genera un link de Mercado Pago para cobrar (Checkout Pro). Devuelve la dirección para mandar por WhatsApp o poner en la web. No cobra nada por sí solo: crea el link.",
    inputSchema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Lo que se cobra, como lo va a ver quien pague. Ej: “Entrada RANDOM #70”." },
        precio: { type: "number", exclusiveMinimum: 0, description: "Precio por unidad." },
        cantidad: { type: "integer", minimum: 1, description: "Unidades. Default 1." },
        moneda: { type: "string", description: "Código ISO. Default: la moneda del país de la cuenta." },
        descripcion: { type: "string", description: "Detalle opcional que se muestra en el checkout." },
        referencia_externa: {
          type: "string",
          description: "Etiqueta propia para después filtrar los pagos de este link. Ej: “random-70”."
        },
        vence_en_horas: { type: "number", minimum: 0.25, description: "Si se pone, el link deja de funcionar pasadas esas horas." },
        url_de_vuelta: { type: "string", description: "Adónde mandar a quien pagó cuando termina. Opcional." }
      },
      required: ["titulo", "precio"],
      additionalProperties: false
    },
    soloLectura: false,
    async ejecutar(env, cache, args) {
      const yo = await cuenta(env, cache);
      const titulo = obligatorio(args.titulo, "titulo");
      const precio = numero(args.precio, "precio");
      if (precio === null || precio <= 0) {
        throw new ErrorMercadoPago("El precio tiene que ser mayor a cero.", 0, null);
      }

      const cantidad = entre(args.cantidad, 1, 999999, 1);
      const moneda = texto(args.moneda) || pais(yo.site_id).moneda;
      const vuelta = direccionWeb(args.url_de_vuelta, "url_de_vuelta");
      const horas = numero(args.vence_en_horas, "vence_en_horas");

      const cuerpo = {
        items: [
          {
            title: titulo,
            description: texto(args.descripcion) || undefined,
            quantity: cantidad,
            unit_price: precio,
            currency_id: moneda
          }
        ],
        external_reference: texto(args.referencia_externa) || undefined,
        metadata: { origen: "conector-chatgpt" }
      };

      if (horas) {
        cuerpo.expires = true;
        cuerpo.expiration_date_to = new Date(Date.now() + horas * 3600 * 1000).toISOString();
      }
      if (vuelta) {
        cuerpo.back_urls = { success: vuelta, pending: vuelta, failure: vuelta };
        cuerpo.auto_return = "approved";
      }

      const preferencia = await llamar(env, "/checkout/preferences", { metodo: "POST", cuerpo });

      return {
        id: preferencia.id,
        link: preferencia.init_point,
        link_de_prueba: preferencia.sandbox_init_point || null,
        titulo,
        total: redondear(precio * cantidad),
        moneda,
        referencia_externa: cuerpo.external_reference || null,
        vence: cuerpo.expiration_date_to || null
      };
    }
  },

  {
    name: "ver_link_de_pago",
    title: "Ver un link de pago",
    description: "Estado de un link de pago ya creado, a partir del ID que devolvió crear_link_de_pago.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "ID de la preferencia." } },
      required: ["id"],
      additionalProperties: false
    },
    soloLectura: true,
    async ejecutar(env, cache, args) {
      const id = obligatorio(args.id, "id");
      const preferencia = await llamar(env, `/checkout/preferences/${encodeURIComponent(id)}`);
      const items = Array.isArray(preferencia.items) ? preferencia.items : [];

      return {
        id: preferencia.id,
        link: preferencia.init_point,
        items: items.map((item) => ({
          titulo: item.title,
          cantidad: item.quantity,
          precio: redondear(Number(item.unit_price)),
          moneda: item.currency_id
        })),
        total: redondear(items.reduce((suma, item) => suma + Number(item.unit_price || 0) * Number(item.quantity || 0), 0)),
        referencia_externa: preferencia.external_reference || null,
        vence: preferencia.expiration_date_to || null,
        creado: preferencia.date_created || null
      };
    }
  },

  {
    name: "devolver_pago",
    title: "Devolver un pago",
    description:
      "Devuelve la plata de un pago, entera o en parte. Es una operación que mueve dinero y no se puede deshacer. Viene deshabilitada: hay que prenderla a mano en la configuración del Worker.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "ID del pago a devolver." },
        monto: { type: "number", exclusiveMinimum: 0, description: "Monto a devolver. Si se omite, se devuelve todo." }
      },
      required: ["id"],
      additionalProperties: false
    },
    soloLectura: false,
    destructiva: true,
    async ejecutar(env, cache, args) {
      if (String(env.PERMITIR_DEVOLUCIONES).toLowerCase() !== "true") {
        throw new ErrorMercadoPago(
          "Las devoluciones están deshabilitadas en este conector. Para habilitarlas hay que poner PERMITIR_DEVOLUCIONES en \"true\" dentro de wrangler.jsonc y volver a deployar.",
          0,
          null
        );
      }

      const yo = await cuenta(env, cache);
      const id = obligatorio(args.id, "id");
      const monto = numero(args.monto, "monto");

      const respuesta = await llamar(env, `/v1/payments/${encodeURIComponent(id)}/refunds`, {
        metodo: "POST",
        cuerpo: monto ? { amount: monto } : {},
        idempotencia: crypto.randomUUID()
      });

      return {
        devolucion_id: respuesta.id,
        pago_id: respuesta.payment_id ?? id,
        monto_devuelto: redondear(Number(respuesta.amount)),
        estado: respuesta.status,
        fecha: respuesta.date_created,
        link: linkDelPago(id, yo.site_id)
      };
    }
  },

  /*
   * search y fetch existen porque el modo investigación de ChatGPT los busca
   * por nombre: sin ese par exacto no puede usar el conector. Por dentro son
   * los mismos pagos que devuelven las otras herramientas.
   */
  {
    name: "search",
    title: "Buscar (formato ChatGPT)",
    description:
      "Busca pagos en Mercado Pago y devuelve una lista de resultados con ID, título y link. Aceptado por el modo investigación de ChatGPT. Para uso normal conviene buscar_pagos.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Qué buscar: un mail, una referencia externa, un estado o un rango “AAAA-MM-DD a AAAA-MM-DD”." }
      },
      required: ["query"],
      additionalProperties: false
    },
    soloLectura: true,
    async ejecutar(env, cache, args) {
      const yo = await cuenta(env, cache);
      const consulta = obligatorio(args.query, "query");
      const fechas = consulta.match(/\d{4}-\d{2}-\d{2}/g) || [];

      const datos = await buscarPagosCrudo(env, cache, {
        desde: fechas[0] || null,
        hasta: fechas[1] || fechas[0] || null,
        estado: ESTADOS.find((estado) => consulta.includes(estado)) || null,
        email_del_pagador: (consulta.match(/[^\s]+@[^\s]+\.[^\s]+/) || [])[0] || null,
        limite: 20
      });

      const resultados = (Array.isArray(datos?.results) ? datos.results : []).map((pago) => ({
        id: String(pago.id),
        title: `${pago.currency_id} ${pago.transaction_amount} · ${pago.status} · ${
          pago.description || pago.payment_method_id || "pago"
        }`,
        url: linkDelPago(pago.id, yo.site_id)
      }));

      return { results: resultados };
    }
  },

  {
    name: "fetch",
    title: "Traer un pago (formato ChatGPT)",
    description:
      "Devuelve el contenido completo de un pago a partir del ID que entregó search. Aceptado por el modo investigación de ChatGPT.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "ID del pago." } },
      required: ["id"],
      additionalProperties: false
    },
    soloLectura: true,
    async ejecutar(env, cache, args) {
      const yo = await cuenta(env, cache);
      const id = obligatorio(args.id, "id");
      const pago = await llamar(env, `/v1/payments/${encodeURIComponent(id)}`);
      const resumen = resumirPago(pago, yo.site_id);

      return {
        id: String(id),
        title: `Pago ${id} · ${resumen.moneda} ${resumen.monto} · ${resumen.estado}`,
        text: JSON.stringify(resumen, null, 2),
        url: resumen.link,
        metadata: { estado: resumen.estado, fecha: resumen.fecha, moneda: resumen.moneda }
      };
    }
  }
];

export const catalogo = definiciones.map((herramienta) => ({
  name: herramienta.name,
  title: herramienta.title,
  description: herramienta.description,
  inputSchema: herramienta.inputSchema,
  annotations: {
    title: herramienta.title,
    readOnlyHint: Boolean(herramienta.soloLectura),
    destructiveHint: Boolean(herramienta.destructiva),
    idempotentHint: Boolean(herramienta.soloLectura),
    openWorldHint: true
  }
}));

const porNombre = new Map(definiciones.map((herramienta) => [herramienta.name, herramienta]));

export function existe(nombre) {
  return porNombre.has(nombre);
}

export async function ejecutar(nombre, argumentos, env, cache) {
  const herramienta = porNombre.get(nombre);
  if (!herramienta) throw new ErrorMercadoPago(`No existe la herramienta "${nombre}".`, 0, null);
  return herramienta.ejecutar(env, cache, argumentos || {});
}
