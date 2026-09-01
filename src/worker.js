import { adminPage } from "./admin-ui.js";
import * as db from "./db.js";
import * as webauthn from "./webauthn.js";

const SESSION_COOKIE = "random_admin_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init && init.headers) },
  });
}

function errorResponse(message, status) {
  return json({ error: message }, { status });
}

function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

function sessionCookieHeader(sessionId, requestUrl) {
  const secure = requestUrl.protocol === "https:" ? "Secure; " : "";
  return `${SESSION_COOKIE}=${sessionId}; Path=/admin; HttpOnly; ${secure}SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

function clearCookieHeader(requestUrl) {
  const secure = requestUrl.protocol === "https:" ? "Secure; " : "";
  return `${SESSION_COOKIE}=; Path=/admin; HttpOnly; ${secure}SameSite=Strict; Max-Age=0`;
}

async function requireSession(request, database) {
  const sessionId = readCookie(request, SESSION_COOKIE);
  const session = await db.getSession(database, sessionId);
  if (!session) throw Object.assign(new Error("no autenticado"), { status: 401 });
  return session;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error("body inválido"), { status: 400 });
  }
}

async function handleAdminApi(request, env, url) {
  const database = env.DB;
  const path = url.pathname.replace(/^\/admin\/api/, "") || "/";
  const method = request.method;
  const origin = url.origin;
  const rpId = url.hostname;

  if (path === "/bootstrap-status" && method === "GET") {
    const count = await db.countPasskeys(database);
    return json({ hasPasskeys: count > 0 });
  }

  if (path === "/session" && method === "GET") {
    const sessionId = readCookie(request, SESSION_COOKIE);
    const session = await db.getSession(database, sessionId);
    return json({ authenticated: !!session });
  }

  if (path === "/webauthn/register-options" && method === "POST") {
    const count = await db.countPasskeys(database);
    if (count === 0) {
      const secret = request.headers.get("x-bootstrap-secret") || "";
      if (!env.BOOTSTRAP_SECRET || secret !== env.BOOTSTRAP_SECRET) {
        return errorResponse("clave de arranque inválida", 401);
      }
    } else {
      await requireSession(request, database);
    }
    const challenge = webauthn.randomChallenge();
    await db.createChallenge(database, challenge, "register");
    const userId = webauthn.base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
    return json(
      webauthn.registrationOptions({ rpName: "RANDOM", rpId, userId, userName: "admin@random", challenge })
    );
  }

  if (path === "/webauthn/register-verify" && method === "POST") {
    const count = await db.countPasskeys(database);
    let bootstrapping = false;
    if (count === 0) {
      const secret = request.headers.get("x-bootstrap-secret") || "";
      if (!env.BOOTSTRAP_SECRET || secret !== env.BOOTSTRAP_SECRET) {
        return errorResponse("clave de arranque inválida", 401);
      }
      bootstrapping = true;
    } else {
      await requireSession(request, database);
    }
    const body = await readJson(request);
    const clientData = JSON.parse(atob(body.response.clientDataJSON.replace(/-/g, "+").replace(/_/g, "/")));
    const validConsumed = await db.consumeChallenge(database, clientData.challenge, "register");
    if (!validConsumed) return errorResponse("challenge expirado o inválido", 400);
    const result = await webauthn.verifyRegistration({
      credential: body,
      expectedChallenge: clientData.challenge,
      expectedOrigin: origin,
      expectedRpId: rpId,
    });
    await db.insertPasskey(database, {
      credentialId: result.credentialId,
      publicKeyJwk: result.publicKeyJwk,
      signCount: result.signCount,
      deviceName: body.deviceName || "Dispositivo",
    });
    if (bootstrapping) {
      const sessionId = await db.createSession(database, result.credentialId);
      return json({ ok: true }, { headers: { "set-cookie": sessionCookieHeader(sessionId, url) } });
    }
    return json({ ok: true });
  }

  if (path === "/webauthn/login-options" && method === "POST") {
    const passkeys = await db.listPasskeys(database);
    if (passkeys.length === 0) return errorResponse("no hay dispositivos registrados", 400);
    const challenge = webauthn.randomChallenge();
    await db.createChallenge(database, challenge, "login");
    return json(
      webauthn.authenticationOptions({
        rpId,
        challenge,
        allowCredentialIds: passkeys.map((p) => p.credential_id),
      })
    );
  }

  if (path === "/webauthn/login-verify" && method === "POST") {
    const body = await readJson(request);
    const clientData = JSON.parse(atob(body.response.clientDataJSON.replace(/-/g, "+").replace(/_/g, "/")));
    const validConsumed = await db.consumeChallenge(database, clientData.challenge, "login");
    if (!validConsumed) return errorResponse("challenge expirado o inválido", 400);
    const credentialId = body.id;
    const passkey = await db.getPasskey(database, credentialId);
    if (!passkey) return errorResponse("credential desconocido", 401);
    const result = await webauthn.verifyAuthentication({
      credential: body,
      expectedChallenge: clientData.challenge,
      expectedOrigin: origin,
      expectedRpId: rpId,
      publicKeyJwk: passkey.public_key_jwk,
      previousSignCount: passkey.sign_count,
    });
    await db.updateSignCount(database, credentialId, result.signCount);
    const sessionId = await db.createSession(database, credentialId);
    return json({ ok: true }, { headers: { "set-cookie": sessionCookieHeader(sessionId, url) } });
  }

  if (path === "/logout" && method === "POST") {
    const sessionId = readCookie(request, SESSION_COOKIE);
    if (sessionId) await db.deleteSession(database, sessionId);
    return json({ ok: true }, { headers: { "set-cookie": clearCookieHeader(url) } });
  }

  // Todo lo que sigue requiere sesión activa.
  await requireSession(request, database);

  if (path === "/passkeys" && method === "GET") {
    return json(await db.listPasskeys(database));
  }

  if (path === "/ediciones" && method === "GET") {
    return json(await db.listEdiciones(database));
  }

  if (path === "/ediciones" && method === "POST") {
    const body = await readJson(request);
    if (!body.numero || !body.fecha) return errorResponse("numero y fecha son obligatorios", 400);
    const id = await db.createEdicion(database, body);
    return json({ id }, { status: 201 });
  }

  let match = path.match(/^\/ediciones\/(\d+)$/);
  if (match && method === "PATCH") {
    const body = await readJson(request);
    await db.updateEdicion(database, Number(match[1]), body);
    return json({ ok: true });
  }
  if (match && method === "DELETE") {
    await db.deleteEdicion(database, Number(match[1]));
    return json({ ok: true });
  }

  match = path.match(/^\/ediciones\/(\d+)\/djs$/);
  if (match && method === "POST") {
    const body = await readJson(request);
    if (!body.nombre) return errorResponse("nombre es obligatorio", 400);
    await db.addDj(database, Number(match[1]), body.nombre, body.cachetCents);
    return json({ ok: true }, { status: 201 });
  }

  match = path.match(/^\/djs\/(\d+)\/pago$/);
  if (match && method === "PATCH") {
    const body = await readJson(request);
    await db.setDjPagado(database, Number(match[1]), !!body.pagado, body.pagadoPor || null);
    return json({ ok: true });
  }

  match = path.match(/^\/djs\/(\d+)$/);
  if (match && method === "DELETE") {
    await db.removeDj(database, Number(match[1]));
    return json({ ok: true });
  }

  if (path === "/caja" && method === "GET") {
    const [saldoCents, movimientos] = await Promise.all([
      db.cajaSaldoCents(database),
      db.listCajaMovimientos(database),
    ]);
    return json({ saldoCents, movimientos });
  }

  if (path === "/caja" && method === "POST") {
    const body = await readJson(request);
    if (!body.montoCents || !body.motivo) return errorResponse("monto y motivo son obligatorios", 400);
    await db.addCajaMovimiento(database, body);
    return json({ ok: true }, { status: 201 });
  }

  return errorResponse("no encontrado", 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      return new Response(adminPage(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (url.pathname.startsWith("/admin/api/")) {
      try {
        return await handleAdminApi(request, env, url);
      } catch (err) {
        return errorResponse(err.message || "error interno", err.status || 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
