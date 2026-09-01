const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function countPasskeys(db) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM passkeys").first();
  return row.n;
}

export async function insertPasskey(db, { credentialId, publicKeyJwk, signCount, deviceName }) {
  await db
    .prepare(
      "INSERT INTO passkeys (credential_id, public_key_jwk, sign_count, device_name, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(credentialId, JSON.stringify(publicKeyJwk), signCount, deviceName, Date.now())
    .run();
}

export async function getPasskey(db, credentialId) {
  const row = await db.prepare("SELECT * FROM passkeys WHERE credential_id = ?").bind(credentialId).first();
  if (!row) return null;
  return { ...row, public_key_jwk: JSON.parse(row.public_key_jwk) };
}

export async function listPasskeys(db) {
  const { results } = await db.prepare("SELECT credential_id, device_name, created_at FROM passkeys ORDER BY created_at").all();
  return results;
}

export async function updateSignCount(db, credentialId, signCount) {
  await db.prepare("UPDATE passkeys SET sign_count = ? WHERE credential_id = ?").bind(signCount, credentialId).run();
}

export async function createChallenge(db, challenge, purpose) {
  await db.batch([
    db.prepare("DELETE FROM webauthn_challenges WHERE created_at < ?").bind(Date.now() - CHALLENGE_TTL_MS),
    db.prepare("INSERT INTO webauthn_challenges (challenge, purpose, created_at) VALUES (?, ?, ?)").bind(challenge, purpose, Date.now()),
  ]);
}

export async function consumeChallenge(db, challenge, purpose) {
  const row = await db
    .prepare("SELECT * FROM webauthn_challenges WHERE challenge = ? AND purpose = ? AND created_at >= ?")
    .bind(challenge, purpose, Date.now() - CHALLENGE_TTL_MS)
    .first();
  if (!row) return false;
  await db.prepare("DELETE FROM webauthn_challenges WHERE challenge = ?").bind(challenge).run();
  return true;
}

export async function createSession(db, credentialId) {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    db.prepare("INSERT INTO sessions (id, credential_id, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(id, credentialId, now, now + SESSION_TTL_MS),
  ]);
  return id;
}

export async function getSession(db, sessionId) {
  if (!sessionId) return null;
  const row = await db.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at >= ?").bind(sessionId, Date.now()).first();
  return row || null;
}

export async function deleteSession(db, sessionId) {
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
}

const FEE_VENUE_DEFAULT_CENTS = 41000;
const DJ_CACHET_DEFAULT_CENTS = 7000;

export async function listEdiciones(db) {
  const { results } = await db.prepare("SELECT * FROM ediciones ORDER BY numero DESC").all();
  const djsByEdicion = await db.prepare("SELECT * FROM edicion_djs ORDER BY id").all();
  const grouped = new Map();
  for (const dj of djsByEdicion.results) {
    if (!grouped.has(dj.edicion_id)) grouped.set(dj.edicion_id, []);
    grouped.get(dj.edicion_id).push(dj);
  }
  return results.map((edicion) => ({ ...edicion, djs: grouped.get(edicion.id) || [] }));
}

export async function createEdicion(db, { numero, fecha, venue, feeVenueCents, notas }) {
  const now = Date.now();
  const result = await db
    .prepare(
      "INSERT INTO ediciones (numero, fecha, venue, fee_venue_cents, notas, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(numero, fecha, venue || "LEVEL", feeVenueCents ?? FEE_VENUE_DEFAULT_CENTS, notas || "", now, now)
    .run();
  return result.meta.last_row_id;
}

export async function updateEdicion(db, id, fields) {
  const allowed = ["fecha", "venue", "fee_venue_cents", "fotografo_cents", "pauta_cents", "asistencia", "notas"];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (key in fields) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (sets.length === 0) return;
  sets.push("updated_at = ?");
  values.push(Date.now());
  values.push(id);
  await db.prepare(`UPDATE ediciones SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
}

export async function deleteEdicion(db, id) {
  await db.prepare("DELETE FROM ediciones WHERE id = ?").bind(id).run();
}

export async function addDj(db, edicionId, nombre, cachetCents) {
  await db
    .prepare("INSERT INTO edicion_djs (edicion_id, nombre, cachet_cents) VALUES (?, ?, ?)")
    .bind(edicionId, nombre, cachetCents ?? DJ_CACHET_DEFAULT_CENTS)
    .run();
}

export async function setDjPagado(db, djId, pagado, pagadoPor) {
  await db
    .prepare("UPDATE edicion_djs SET pagado = ?, pagado_por = ?, pagado_at = ? WHERE id = ?")
    .bind(pagado ? 1 : 0, pagado ? pagadoPor : null, pagado ? Date.now() : null, djId)
    .run();
}

export async function removeDj(db, djId) {
  await db.prepare("DELETE FROM edicion_djs WHERE id = ?").bind(djId).run();
}

export async function listCajaMovimientos(db) {
  const { results } = await db.prepare("SELECT * FROM caja_movimientos ORDER BY created_at DESC").all();
  return results;
}

export async function cajaSaldoCents(db) {
  const row = await db.prepare("SELECT COALESCE(SUM(monto_cents), 0) AS saldo FROM caja_movimientos").first();
  return row.saldo;
}

export async function addCajaMovimiento(db, { montoCents, motivo, edicionId }) {
  await db
    .prepare("INSERT INTO caja_movimientos (monto_cents, motivo, edicion_id, created_at) VALUES (?, ?, ?, ?)")
    .bind(montoCents, motivo, edicionId ?? null, Date.now())
    .run();
}
