-- Esquema del panel de administración de RANDOM.
-- Aplicar con: wrangler d1 execute random-electronic-admin --remote --file=migrations/0001_init.sql

CREATE TABLE passkeys (
  credential_id TEXT PRIMARY KEY,
  public_key_jwk TEXT NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0,
  device_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Challenges de WebAuthn en curso (registro o login). Vencen solos: se
-- descartan si createdAt tiene más de 5 minutos, sin necesidad de un cron.
CREATE TABLE webauthn_challenges (
  challenge TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login')),
  created_at INTEGER NOT NULL
);

-- Sesiones de admin. El cookie solo guarda el id; todo lo demás vive acá.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL REFERENCES passkeys(credential_id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE ediciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero INTEGER NOT NULL UNIQUE,
  fecha TEXT NOT NULL,
  venue TEXT NOT NULL DEFAULT 'LEVEL',
  fee_venue_cents INTEGER NOT NULL DEFAULT 41000,
  fotografo_cents INTEGER NOT NULL DEFAULT 0,
  pauta_cents INTEGER NOT NULL DEFAULT 0,
  asistencia INTEGER,
  notas TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE edicion_djs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edicion_id INTEGER NOT NULL REFERENCES ediciones(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  cachet_cents INTEGER NOT NULL DEFAULT 7000,
  pagado INTEGER NOT NULL DEFAULT 0,
  pagado_por TEXT,
  pagado_at INTEGER
);
CREATE INDEX idx_edicion_djs_edicion ON edicion_djs(edicion_id);

-- Movimientos de la caja de RANDOM (objetivo: >= 500 € permanentes desde
-- diciembre de 2026). monto_cents positivo = entra a la caja, negativo = sale.
CREATE TABLE caja_movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monto_cents INTEGER NOT NULL,
  motivo TEXT NOT NULL,
  edicion_id INTEGER REFERENCES ediciones(id),
  created_at INTEGER NOT NULL
);
