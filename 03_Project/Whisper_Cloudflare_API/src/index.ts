import * as db from "./db";
import { runMeetingPipeline } from "./pipeline";
import { signSessionToken, verifySessionToken } from "./auth";
import type { ActionItemStatus, Env } from "./types";

// Matches Whisper_Backend_API's Process/Service.py persistence-backed API
// exactly (see FRONTEND_HANDOFF.md there) - paths and camelCase JSON shapes
// are the same contract, so whisper-frontend needs zero changes, only
// NEXT_PUBLIC_API_BASE_URL pointed at this Worker's URL.
//
// Auth: Google OAuth2 only (see DESIGN_SYSTEM.md's "Real authentication"
// section) - every route except /health and the callback itself requires a
// valid `Authorization: Bearer <token>`, verified via requireAuth() below.
// userId/teamId come from the token, not a hardcoded demo account.
//
// No framework (Hono etc.) on purpose: keeping the bundle to just this
// project's own code - no bundled dependency tree - matters for how it's
// shipped, not just size. (Originally deployed via the raw Cloudflare API;
// now deployed with `npm run deploy` / `wrangler deploy` now that wrangler
// is authenticated on the dev machine - see README's "Deployment" note.)

const VALID_ACTION_ITEM_STATUSES: ActionItemStatus[] = ["open", "in_progress", "done", "cancelled"];
const ALLOWED_EXTENSIONS = [".wav", ".mp3", ".m4a", ".flac", ".ogg", ".webm"];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function json(data: unknown, status = 200, corsOrigin?: string): Response {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (corsOrigin) headers.set("Access-Control-Allow-Origin", corsOrigin);
  return new Response(JSON.stringify(data), { status, headers });
}

function errorJson(code: string, message: string, status: number, corsOrigin?: string): Response {
  return json({ error: { code, message } }, status, corsOrigin);
}

interface ActionItemPatchBody {
  status?: string;
  description?: string;
  assigneeName?: string | null;
  dueDate?: string | null;
}
interface ActionItemCreateBody {
  description?: string;
  assigneeName?: string | null;
  dueDate?: string | null;
}
interface MeetingPatchBody {
  title?: string;
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

interface Auth {
  userId: string;
  teamId: string;
}

async function requireAuth(request: Request, env: Env): Promise<Auth | null> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return verifySessionToken(header.slice("Bearer ".length), env.AUTH_SECRET);
}

// --- Google OAuth2 ---------------------------------------------------------

interface GoogleTokenResponse {
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleIdTokenPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/** No JWKS signature check - this id_token came from a direct
 * server-to-server HTTPS call to Google's own token endpoint (not handed to
 * us by the browser), so decoding the payload without also verifying its
 * signature is an accepted scope cut for this project, not an oversight -
 * see DESIGN_SYSTEM.md 5b-i. */
function decodeGoogleIdToken(jwt: string): GoogleIdTokenPayload {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("Malformed id_token");
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (parts[1].length % 4)) % 4);
  return JSON.parse(atob(b64));
}

function base64UrlEncodeJson(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** GET /api/auth/google/callback?code=...&state=... - Google redirects
 * here after the user consents. Exchanges the code for tokens (needs
 * client_secret, so this must happen server-side - the frontend is a
 * static export with nowhere to keep a secret), finds-or-creates the user
 * and their personal team, then redirects to the frontend with the new
 * session token in the URL fragment (never a query string, so it never
 * hits server logs or Referer headers). `state` is checked for presence
 * only, not cryptographically verified - matches the id_token scope cut
 * above; see DESIGN_SYSTEM.md 5b-i for why a stateless Worker can't verify
 * it any more strictly without an extra round trip. */
async function handleGoogleCallback(request: Request, env: Env, origin: string): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return errorJson("INVALID_REQUEST", "Missing code or state", 400, origin);

  const redirectUri = `${url.origin}/api/auth/google/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenBody = await tokenRes.json<GoogleTokenResponse>();
  if (!tokenRes.ok || !tokenBody.id_token) {
    console.error("Google token exchange failed", tokenBody);
    return errorJson("OAUTH_ERROR", tokenBody.error_description ?? "Google sign-in failed", 401, origin);
  }

  let payload: GoogleIdTokenPayload;
  try {
    payload = decodeGoogleIdToken(tokenBody.id_token);
  } catch {
    return errorJson("OAUTH_ERROR", "Could not read Google's response", 401, origin);
  }
  if (!payload.email || payload.email_verified === false) {
    return errorJson("OAUTH_ERROR", "Google account has no verified email", 401, origin);
  }

  const user = await db.findOrCreateGoogleUser(
    env.DB,
    {
      googleSub: payload.sub,
      email: payload.email,
      displayName: payload.name ?? payload.email,
      avatarUrl: payload.picture ?? null,
    },
    { encryptionKey: env.PII_ENCRYPTION_KEY, hmacKey: env.PII_LOOKUP_HMAC_KEY },
  );

  const token = await signSessionToken(user.id, user.teamId, env.AUTH_SECRET);
  const userBlob = base64UrlEncodeJson({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  });
  const location = `${env.CORS_ORIGIN}/auth/callback#token=${encodeURIComponent(token)}&user=${encodeURIComponent(userBlob)}`;
  return new Response(null, { status: 302, headers: { Location: location } });
}

// --- Profile / usage ---------------------------------------------------------

interface ProfilePatchBody {
  displayName?: string;
}

async function handleGetProfile(auth: Auth, env: Env, origin: string): Promise<Response> {
  const [user, usage] = await Promise.all([
    db.getUserById(env.DB, auth.userId, env.PII_ENCRYPTION_KEY),
    db.getUsageStatus(env.DB, auth.userId),
  ]);
  if (!user) return errorJson("NOT_FOUND", "User not found", 404, origin);
  return json({ user, usage }, 200, origin);
}

async function handlePatchProfile(request: Request, auth: Auth, env: Env, origin: string): Promise<Response> {
  const body = await readJson<ProfilePatchBody>(request);
  const displayName = body.displayName?.trim();
  if (!displayName || displayName.length > 100) {
    return errorJson("INVALID_REQUEST", "displayName must be 1-100 characters", 400, origin);
  }

  await db.updateDisplayName(env.DB, auth.userId, displayName, env.PII_ENCRYPTION_KEY);
  const [user, usage] = await Promise.all([
    db.getUserById(env.DB, auth.userId, env.PII_ENCRYPTION_KEY),
    db.getUsageStatus(env.DB, auth.userId),
  ]);
  if (!user) return errorJson("NOT_FOUND", "User not found", 404, origin);
  return json({ user, usage }, 200, origin);
}

async function handleGetUsage(auth: Auth, env: Env, origin: string): Promise<Response> {
  const usage = await db.getUsageStatus(env.DB, auth.userId);
  return json({ usage }, 200, origin);
}

// --- Meetings / action items -----------------------------------------------

async function handleListMeetings(auth: Auth, env: Env, origin: string): Promise<Response> {
  const meetings = await db.listTeamMeetings(env.DB, auth.teamId);
  return json({ meetings }, 200, origin);
}

async function handleGetMeeting(meetingId: string, auth: Auth, env: Env, origin: string): Promise<Response> {
  const meeting = await db.getMeetingFull(env.DB, meetingId, auth.teamId);
  if (!meeting) return errorJson("NOT_FOUND", "Meeting not found", 404, origin);
  return json({ meeting }, 200, origin);
}

async function handleCreateMeeting(request: Request, auth: Auth, env: Env, origin: string): Promise<Response> {
  const formData = await request.formData();
  const title = typeof formData.get("title") === "string" ? (formData.get("title") as string).trim() : "";
  const file = formData.get("file");

  if (!title) return errorJson("INVALID_REQUEST", "Title is required", 400, origin);
  if (!(file instanceof File)) return errorJson("INVALID_REQUEST", "Audio file is required", 400, origin);

  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return errorJson("UNSUPPORTED_FORMAT", `Unsupported extension '${ext}'`, 415, origin);
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return errorJson("FILE_TOO_LARGE", `File exceeds ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`, 413, origin);
  }

  // Checked (and incremented) before the AI pipeline runs, not after -
  // Neurons are spent the moment transcription/summarization is attempted,
  // so the cap has to gate entry, not just record outcome. See
  // DESIGN_SYSTEM.md's rate-limit grilling session.
  const usageCheck = await db.checkAndIncrementUsage(env.DB, auth.userId);
  if (!usageCheck.allowed) {
    const message =
      usageCheck.reason === "global"
        ? "ระบบเต็มชั่วคราว โควตาการประมวลผลของวันนี้หมดแล้ว กรุณาลองใหม่พรุ่งนี้"
        : "คุณใช้โควตาการประชุมของวันนี้ครบแล้ว กรุณาลองใหม่พรุ่งนี้";
    return json({ error: { code: "RATE_LIMITED", reason: usageCheck.reason, message }, usage: usageCheck.status }, 429, origin);
  }

  const audio = await file.arrayBuffer();
  const { meetingId, jobIds } = await db.createMeetingWithJobs(env.DB, auth.teamId, auth.userId, title, file.name);

  // Deliberately awaited, not fire-and-forget via waitUntil(): waitUntil only
  // buys ~30s of extra runtime after the response is sent, nowhere near
  // enough for real transcription. A Workers Free request has no wall-clock
  // limit while the client stays connected, so run the whole pipeline inline
  // instead - the frontend just waits longer for this one response. This is
  // the "smaller working slice first" MVP; true background processing needs
  // Cloudflare Queues (see CLAUDE.md) so it survives past this request's
  // lifetime, planned as the next slice for longer recordings.
  await runMeetingPipeline(env, meetingId, jobIds, audio);

  const meeting = await db.getMeetingFull(env.DB, meetingId, auth.teamId);
  return json({ meeting }, 201, origin);
}

async function handlePatchMeeting(
  meetingId: string,
  request: Request,
  auth: Auth,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = await readJson<MeetingPatchBody>(request);
  const title = body.title?.trim();
  if (!title) return errorJson("INVALID_REQUEST", "Title is required", 400, origin);

  const updated = await db.updateMeetingTitle(env.DB, meetingId, auth.teamId, title);
  if (!updated) return errorJson("NOT_FOUND", "Meeting not found", 404, origin);
  const meeting = await db.getMeetingFull(env.DB, meetingId, auth.teamId);
  if (!meeting) return errorJson("NOT_FOUND", "Meeting not found", 404, origin);
  return json({ meeting }, 200, origin);
}

async function handleCreateActionItem(
  meetingId: string,
  request: Request,
  auth: Auth,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = await readJson<ActionItemCreateBody>(request);
  const description = body.description?.trim();
  if (!description) return errorJson("INVALID_REQUEST", "Description is required", 400, origin);

  const meeting = await db.getMeetingFull(env.DB, meetingId, auth.teamId);
  if (!meeting) return errorJson("NOT_FOUND", "Meeting not found", 404, origin);

  const actionItem = await db.createActionItem(env.DB, meetingId, auth.teamId, {
    description,
    assigneeName: body.assigneeName?.trim() || null,
    dueDate: body.dueDate || null,
  });
  return json({ actionItem }, 201, origin);
}

async function handlePatchActionItem(
  actionItemId: string,
  request: Request,
  auth: Auth,
  env: Env,
  origin: string,
): Promise<Response> {
  const body = await readJson<ActionItemPatchBody>(request);
  if (body.status !== undefined && !VALID_ACTION_ITEM_STATUSES.includes(body.status as ActionItemStatus)) {
    return errorJson("INVALID_STATUS", `Invalid status: ${body.status}`, 400, origin);
  }
  if (
    body.description === undefined &&
    body.assigneeName === undefined &&
    body.dueDate === undefined &&
    body.status === undefined
  ) {
    return errorJson("INVALID_REQUEST", "No fields to update", 400, origin);
  }

  const actionItem = await db.updateActionItem(env.DB, actionItemId, auth.teamId, {
    description: body.description?.trim(),
    assigneeName: body.assigneeName === undefined ? undefined : body.assigneeName?.trim() || null,
    dueDate: body.dueDate,
    status: body.status as ActionItemStatus | undefined,
  });
  if (!actionItem) return errorJson("NOT_FOUND", "Action item not found", 404, origin);
  return json({ actionItem }, 200, origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = env.CORS_ORIGIN;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      if (method === "GET" && pathname === "/health") return json({ status: "ok" }, 200, origin);
      if (method === "GET" && pathname === "/api/auth/google/callback") {
        return await handleGoogleCallback(request, env, origin);
      }

      const auth = await requireAuth(request, env);
      if (!auth) return errorJson("UNAUTHORIZED", "Missing or invalid session", 401, origin);

      if (method === "GET" && pathname === "/api/profile") return await handleGetProfile(auth, env, origin);
      if (method === "PATCH" && pathname === "/api/profile") return await handlePatchProfile(request, auth, env, origin);
      if (method === "GET" && pathname === "/api/usage/today") return await handleGetUsage(auth, env, origin);

      if (method === "GET" && pathname === "/api/meetings") return await handleListMeetings(auth, env, origin);
      if (method === "POST" && pathname === "/api/meetings") return await handleCreateMeeting(request, auth, env, origin);

      const meetingMatch = pathname.match(/^\/api\/meetings\/([^/]+)$/);
      if (method === "GET" && meetingMatch) return await handleGetMeeting(meetingMatch[1], auth, env, origin);
      if (method === "PATCH" && meetingMatch) return await handlePatchMeeting(meetingMatch[1], request, auth, env, origin);

      const meetingActionItemsMatch = pathname.match(/^\/api\/meetings\/([^/]+)\/action-items$/);
      if (method === "POST" && meetingActionItemsMatch) {
        return await handleCreateActionItem(meetingActionItemsMatch[1], request, auth, env, origin);
      }

      const actionItemMatch = pathname.match(/^\/api\/action-items\/([^/]+)$/);
      if (method === "PATCH" && actionItemMatch) {
        return await handlePatchActionItem(actionItemMatch[1], request, auth, env, origin);
      }

      return errorJson("NOT_FOUND", "No such route", 404, origin);
    } catch (err) {
      console.error(err);
      return errorJson("INTERNAL_ERROR", "Unexpected server error", 500, origin);
    }
  },
};
