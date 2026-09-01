// Verificación mínima de WebAuthn (passkeys) para un solo usuario administrador.
// Sin dependencias externas: todo con Web Crypto, que ya trae el runtime de Workers.
// Soporta únicamente ES256 (P-256) porque es lo que usan Face ID, Touch ID y
// Windows Hello — los tres autenticadores de plataforma reales de este panel.

export function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomChallenge() {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

// Decodificador CBOR de propósito general, suficiente para attestationObject
// y claves COSE. Solo longitudes definidas: es lo único que emiten los
// autenticadores de plataforma reales para estas estructuras.
function decodeCbor(buf, offset = 0) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  function readLength(addInfo, off) {
    if (addInfo < 24) return { value: addInfo, next: off };
    if (addInfo === 24) return { value: view.getUint8(off), next: off + 1 };
    if (addInfo === 25) return { value: view.getUint16(off), next: off + 2 };
    if (addInfo === 26) return { value: view.getUint32(off), next: off + 4 };
    if (addInfo === 27) {
      const hi = view.getUint32(off);
      const lo = view.getUint32(off + 4);
      return { value: hi * 2 ** 32 + lo, next: off + 8 };
    }
    throw new Error("CBOR: longitud indefinida no soportada");
  }

  function decode(off) {
    const first = view.getUint8(off);
    const majorType = first >> 5;
    const addInfo = first & 0x1f;
    off += 1;
    switch (majorType) {
      case 0: {
        const { value, next } = readLength(addInfo, off);
        return { value, next };
      }
      case 1: {
        const { value, next } = readLength(addInfo, off);
        return { value: -1 - value, next };
      }
      case 2: {
        const { value: len, next } = readLength(addInfo, off);
        return { value: buf.slice(next, next + len), next: next + len };
      }
      case 3: {
        const { value: len, next } = readLength(addInfo, off);
        const bytes = buf.slice(next, next + len);
        return { value: new TextDecoder().decode(bytes), next: next + len };
      }
      case 4: {
        const { value: len, next } = readLength(addInfo, off);
        let cur = next;
        const arr = [];
        for (let i = 0; i < len; i++) {
          const r = decode(cur);
          arr.push(r.value);
          cur = r.next;
        }
        return { value: arr, next: cur };
      }
      case 5: {
        const { value: len, next } = readLength(addInfo, off);
        let cur = next;
        const map = new Map();
        for (let i = 0; i < len; i++) {
          const k = decode(cur);
          const v = decode(k.next);
          map.set(k.value, v.value);
          cur = v.next;
        }
        return { value: map, next: cur };
      }
      case 6: {
        const { next } = readLength(addInfo, off);
        return decode(next);
      }
      case 7: {
        if (addInfo === 20) return { value: false, next: off };
        if (addInfo === 21) return { value: true, next: off };
        if (addInfo === 22) return { value: null, next: off };
        throw new Error("CBOR: tipo simple no soportado");
      }
      default:
        throw new Error("CBOR: major type desconocido");
    }
  }

  return decode(offset);
}

function parseAuthenticatorData(bytes) {
  if (bytes.length < 37) throw new Error("authenticatorData demasiado corto");
  const rpIdHash = bytes.slice(0, 32);
  const flags = bytes[32];
  const signCount = new DataView(bytes.buffer, bytes.byteOffset + 33, 4).getUint32(0);
  const result = {
    rpIdHash,
    flags,
    userPresent: (flags & 0x01) !== 0,
    userVerified: (flags & 0x04) !== 0,
    attestedCredentialDataIncluded: (flags & 0x40) !== 0,
    signCount,
  };
  let offset = 37;
  if (result.attestedCredentialDataIncluded) {
    offset += 16; // aaguid
    const credentialIdLength = new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0);
    offset += 2;
    result.credentialId = bytes.slice(offset, offset + credentialIdLength);
    offset += credentialIdLength;
    const decoded = decodeCbor(bytes, offset);
    result.credentialPublicKeyMap = decoded.value;
    offset = decoded.next;
  }
  return result;
}

function coseKeyToJwk(map) {
  const kty = map.get(1);
  const alg = map.get(3);
  if (kty !== 2 || alg !== -7) {
    throw new Error("Solo se admite ES256 (P-256) — usá Face ID, Touch ID o Windows Hello");
  }
  const x = map.get(-2);
  const y = map.get(-3);
  return {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(x),
    y: base64UrlEncode(y),
    ext: true,
  };
}

// Las firmas WebAuthn vienen en DER; Web Crypto espera r‖s "raw" de 64 bytes.
function derSignatureToRaw(der) {
  let offset = 0;
  if (der[offset++] !== 0x30) throw new Error("firma DER inválida");
  let seqLen = der[offset++];
  if (seqLen & 0x80) {
    const extraBytes = seqLen & 0x7f;
    seqLen = 0;
    for (let i = 0; i < extraBytes; i++) seqLen = (seqLen << 8) | der[offset++];
  }
  function readInt() {
    if (der[offset++] !== 0x02) throw new Error("firma DER inválida");
    const len = der[offset++];
    let bytes = der.slice(offset, offset + len);
    offset += len;
    while (bytes.length > 32 && bytes[0] === 0) bytes = bytes.slice(1);
    if (bytes.length < 32) {
      const padded = new Uint8Array(32);
      padded.set(bytes, 32 - bytes.length);
      bytes = padded;
    }
    return bytes;
  }
  const r = readInt();
  const s = readInt();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function registrationOptions({ rpName, rpId, userId, userName, challenge }) {
  return {
    challenge,
    rp: { name: rpName, id: rpId },
    user: { id: userId, name: userName, displayName: userName },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred",
    },
    attestation: "none",
    timeout: 60000,
  };
}

export function authenticationOptions({ rpId, challenge, allowCredentialIds }) {
  return {
    challenge,
    rpId,
    allowCredentials: allowCredentialIds.map((id) => ({ type: "public-key", id })),
    userVerification: "required",
    timeout: 60000,
  };
}

export async function verifyRegistration({ credential, expectedChallenge, expectedOrigin, expectedRpId }) {
  const clientDataBytes = base64UrlDecode(credential.response.clientDataJSON);
  const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
  if (clientData.type !== "webauthn.create") throw new Error("tipo de clientData inválido");
  if (clientData.challenge !== expectedChallenge) throw new Error("challenge no coincide");
  if (clientData.origin !== expectedOrigin) throw new Error("origin no coincide");

  const attestationBytes = base64UrlDecode(credential.response.attestationObject);
  const { value: attestationMap } = decodeCbor(attestationBytes);
  const authData = parseAuthenticatorData(attestationMap.get("authData"));

  const expectedRpIdHash = await sha256(new TextEncoder().encode(expectedRpId));
  if (!bytesEqual(authData.rpIdHash, expectedRpIdHash)) throw new Error("rpIdHash no coincide");
  if (!authData.userPresent || !authData.userVerified) throw new Error("el autenticador no verificó presencia/identidad");
  if (!authData.credentialPublicKeyMap) throw new Error("falta la clave pública del credential");

  const publicKeyJwk = coseKeyToJwk(authData.credentialPublicKeyMap);
  return {
    credentialId: base64UrlEncode(authData.credentialId),
    publicKeyJwk,
    signCount: authData.signCount,
  };
}

export async function verifyAuthentication({ credential, expectedChallenge, expectedOrigin, expectedRpId, publicKeyJwk, previousSignCount }) {
  const clientDataBytes = base64UrlDecode(credential.response.clientDataJSON);
  const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
  if (clientData.type !== "webauthn.get") throw new Error("tipo de clientData inválido");
  if (clientData.challenge !== expectedChallenge) throw new Error("challenge no coincide");
  if (clientData.origin !== expectedOrigin) throw new Error("origin no coincide");

  const authDataBytes = base64UrlDecode(credential.response.authenticatorData);
  const authData = parseAuthenticatorData(authDataBytes);

  const expectedRpIdHash = await sha256(new TextEncoder().encode(expectedRpId));
  if (!bytesEqual(authData.rpIdHash, expectedRpIdHash)) throw new Error("rpIdHash no coincide");
  if (!authData.userPresent || !authData.userVerified) throw new Error("el autenticador no verificó presencia/identidad");

  // Face ID y Touch ID suelen no incrementar el contador (queda en 0):
  // el chequeo de clonado solo aplica cuando el autenticador sí lo usa.
  if (authData.signCount !== 0 && previousSignCount !== 0 && authData.signCount <= previousSignCount) {
    throw new Error("posible credential clonado: el contador no avanzó");
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    publicKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  const clientDataHash = await sha256(clientDataBytes);
  const signedData = new Uint8Array(authDataBytes.length + clientDataHash.length);
  signedData.set(authDataBytes, 0);
  signedData.set(clientDataHash, authDataBytes.length);

  const signature = derSignatureToRaw(base64UrlDecode(credential.response.signature));
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signature, signedData);
  if (!valid) throw new Error("firma inválida");

  return { signCount: authData.signCount };
}
