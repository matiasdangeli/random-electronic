/*
 * Firmas: todo lo que este Worker "recuerda" viaja firmado, no guardado.
 *
 * Un servidor OAuth normal guarda en una base los códigos de autorización y
 * los tokens que emitió. Acá no hay base de datos a propósito: cada código y
 * cada token es un JSON firmado con HMAC-SHA256 que el propio Worker vuelve a
 * verificar cuando se lo devuelven. Sin infraestructura extra, sin nada que
 * mantener, y si alguien cambia una letra la firma no cierra.
 *
 * Lo que se pierde es poder invalidar un token puntual antes de que venza.
 * Para eso está cambiar CONNECTOR_PASSWORD: la clave de firma se deriva de
 * ella, así que cambiarla invalida de una todos los tokens vivos.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function aBase64Url(bytes) {
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function desdeBase64Url(texto) {
  const normalizado = String(texto).replace(/-/g, "+").replace(/_/g, "/");
  const relleno = normalizado + "=".repeat((4 - (normalizado.length % 4)) % 4);
  const binario = atob(relleno);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/*
 * La clave de firma sale de TOKEN_SECRET si está puesta; si no, se deriva de
 * la contraseña del conector. Derivarla no debilita nada: quien conoce la
 * contraseña ya puede pedir un token por la puerta de adelante.
 */
export function claveDeFirma(env) {
  if (env.TOKEN_SECRET) return String(env.TOKEN_SECRET);
  return "random-mercadopago/v1:" + String(env.CONNECTOR_PASSWORD || "");
}

async function claveHmac(secreto) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function firmar(datos, secreto) {
  const cuerpo = aBase64Url(enc.encode(JSON.stringify(datos)));
  const clave = await claveHmac(secreto);
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", clave, enc.encode(cuerpo)));
  return cuerpo + "." + aBase64Url(firma);
}

/* Devuelve el contenido si la firma cierra y no venció; si no, null. */
export async function verificar(token, secreto) {
  if (typeof token !== "string") return null;
  const corte = token.lastIndexOf(".");
  if (corte <= 0) return null;

  const cuerpo = token.slice(0, corte);
  let firma;
  try {
    firma = desdeBase64Url(token.slice(corte + 1));
  } catch {
    return null;
  }

  const clave = await claveHmac(secreto);
  const valida = await crypto.subtle.verify("HMAC", clave, firma, enc.encode(cuerpo));
  if (!valida) return null;

  let datos;
  try {
    datos = JSON.parse(dec.decode(desdeBase64Url(cuerpo)));
  } catch {
    return null;
  }
  if (typeof datos.exp === "number" && datos.exp * 1000 <= Date.now()) return null;
  return datos;
}

/*
 * Comparar la contraseña con === filtra información por el tiempo que tarda.
 * Comparar dos HMAC de la misma clave efímera no: los dos digests miden lo
 * mismo y el XOR recorre siempre los 32 bytes.
 */
export async function igualSeguro(a, b) {
  const clave = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const ha = new Uint8Array(await crypto.subtle.sign("HMAC", clave, enc.encode(String(a))));
  const hb = new Uint8Array(await crypto.subtle.sign("HMAC", clave, enc.encode(String(b))));
  let diferencia = 0;
  for (let i = 0; i < ha.length; i++) diferencia |= ha[i] ^ hb[i];
  return diferencia === 0;
}

/* PKCE: el desafío que mandó el cliente tiene que ser el SHA-256 del verificador. */
export async function desafioPkce(verificador) {
  const resumen = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(verificador))));
  return aBase64Url(resumen);
}

export function idAlAzar(prefijo) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return prefijo + aBase64Url(bytes);
}
