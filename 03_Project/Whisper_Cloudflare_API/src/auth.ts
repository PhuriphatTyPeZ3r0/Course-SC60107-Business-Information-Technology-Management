// Password hashing via Web Crypto's PBKDF2 (no pgcrypto/bcrypt on D1/Workers,
// per CLAUDE.md). Stored as "iterations:saltHex:hashHex".
//
// Matches the local Postgres backend's "real user records, no real password
// verification on login" simplification (see FRONTEND_HANDOFF.md): this
// module hashes real passwords on signup, but /api/auth/login only looks
// the account up by email and never calls verifyPassword().

const ITERATIONS = 100_000;
const HASH_BITS = 256;

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

async function derive(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, keyMaterial, HASH_BITS,
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return `${ITERATIONS}:${toHex(salt.buffer as ArrayBuffer)}:${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [iterationsStr, saltHex, hashHex] = stored.split(":");
  const salt = fromHex(saltHex);
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: Number(iterationsStr), hash: "SHA-256" },
    keyMaterial, HASH_BITS,
  );
  return toHex(hash) === hashHex;
}
