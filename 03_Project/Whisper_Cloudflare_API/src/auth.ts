// PII encryption (AES-256-GCM), an email blind-index (HMAC-SHA256), and
// the stateless signed session token - see DESIGN_SYSTEM.md's "Real
// authentication" section for why each of these exists. All via Web
// Crypto's SubtleCrypto (no dependency).
//
// Password auth (PBKDF2 hash/verify) used to live here before Google
// OAuth2 replaced it entirely - see git history if that's ever needed
// again. user_account.password_hash stays in the schema, unused.

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function base64url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return fromBase64(b64);
}

async function importAesKey(base64Key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromBase64(base64Key), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function importHmacKey(base64Key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    fromBase64(base64Key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** AES-256-GCM encrypt; IV is random per call (required for semantic
 * security) and prepended to the ciphertext, both base64-encoded together
 * so decryptPII() only needs the one string back. */
export async function encryptPII(plaintext: string, key: string): Promise<string> {
  const cryptoKey = await importAesKey(key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, new TextEncoder().encode(plaintext)),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return toBase64(combined);
}

export async function decryptPII(encoded: string, key: string): Promise<string> {
  const cryptoKey = await importAesKey(key);
  const combined = fromBase64(encoded);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, ciphertext);
  return new TextDecoder().decode(plaintext);
}

/** Deterministic HMAC-SHA256 of a lowercased/trimmed email - this is what
 * every email lookup and the uniqueness constraint actually run against,
 * since AES-GCM's random IV means email_encrypted can't be equality-matched
 * directly. One-way: cannot be reversed back to the email. */
export async function emailLookupHash(email: string, key: string): Promise<string> {
  const cryptoKey = await importHmacKey(key);
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(email.trim().toLowerCase()),
  );
  return toBase64(new Uint8Array(sig));
}

interface SessionPayload {
  userId: string;
  teamId: string;
  exp: number;
}

const SESSION_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

/** Signed `payload.signature` bearer token, both base64url. No session
 * table - verifySessionToken() only needs the same secret, not a DB round
 * trip. teamId rides along in the payload too (personal teams never
 * change), so per-request handlers don't need a team_member lookup either -
 * see DESIGN_SYSTEM.md 5b-ii. */
export async function signSessionToken(userId: string, teamId: string, secret: string): Promise<string> {
  const payload: SessionPayload = {
    userId,
    teamId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
  };
  const payloadB64 = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${base64url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<{ userId: string; teamId: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  const key = await importHmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64urlToBytes(sigB64),
    new TextEncoder().encode(payloadB64),
  );
  if (!valid) return null;

  try {
    const payload: SessionPayload = JSON.parse(new TextDecoder().decode(base64urlToBytes(payloadB64)));
    if (
      typeof payload.userId !== "string" ||
      typeof payload.teamId !== "string" ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return { userId: payload.userId, teamId: payload.teamId };
  } catch {
    return null;
  }
}
