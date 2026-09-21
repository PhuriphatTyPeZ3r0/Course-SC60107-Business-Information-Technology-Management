import * as db from "./db";
import { runMeetingPipeline } from "./pipeline";
import type { ActionItemStatus, Env } from "./types";

// Matches Whisper_Backend_API's Process/Service.py persistence-backed API
// exactly (see FRONTEND_HANDOFF.md there) - paths and camelCase JSON shapes
// are the same contract, so whisper-frontend needs zero changes, only
// NEXT_PUBLIC_API_BASE_URL pointed at this Worker's URL.
//
// Auth here is intentionally minimal, same as the local backend: real user
// rows with a real PBKDF2 hash (src/auth.ts), but /api/auth/login only
// looks the account up by email and never verifies the password. The
// frontend doesn't send its token back on later requests either, so
// there's no bearer-token verification to implement here.
//
// No framework (Hono etc.) on purpose: this Worker is deployed via the raw
// Cloudflare API (multipart script upload) rather than `wrangler deploy`
// (see README's "Deployment" note), so keeping the bundle to just this
// project's own code - no bundled dependency tree - matters for how it's
// shipped, not just size.

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

interface LoginBody {
  email?: string;
  password?: string;
}
interface SignupBody extends LoginBody {
  displayName?: string;
}
interface ActionItemStatusBody {
  meetingId?: string;
  status?: string;
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

async function handleLogin(request: Request, env: Env, origin: string): Promise<Response> {
  const body = await readJson<LoginBody>(request);
  if (!body.email) return errorJson("INVALID_REQUEST", "Email is required", 400, origin);

  const user = await db.getUserByEmail(env.DB, body.email);
  if (!user) return errorJson("INVALID_CREDENTIALS", "Invalid email or password", 401, origin);
  return json({ token: crypto.randomUUID(), user }, 200, origin);
}

async function handleSignup(request: Request, env: Env, origin: string): Promise<Response> {
  const body = await readJson<SignupBody>(request);
  if (!body.email || !body.password || !body.displayName) {
    return errorJson("INVALID_REQUEST", "Email, password, and display name are required", 400, origin);
  }

  try {
    const user = await db.createUserAccount(env.DB, body.email, body.password, body.displayName);
    return json({ token: crypto.randomUUID(), user }, 200, origin);
  } catch (err) {
    if (err instanceof db.DuplicateEmailError) {
      return errorJson("EMAIL_EXISTS", `Email already exists: ${body.email}`, 409, origin);
    }
    throw err;
  }
}

async function handleListMeetings(env: Env, origin: string): Promise<Response> {
  const meetings = await db.listTeamMeetings(env.DB);
  return json({ meetings }, 200, origin);
}

async function handleGetMeeting(meetingId: string, env: Env, origin: string): Promise<Response> {
  const meeting = await db.getMeetingFull(env.DB, meetingId);
  if (!meeting) return errorJson("NOT_FOUND", "Meeting not found", 404, origin);
  return json({ meeting }, 200, origin);
}

async function handleCreateMeeting(request: Request, env: Env, origin: string): Promise<Response> {
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

  const audio = await file.arrayBuffer();
  const demoUser = await db.getUserByEmail(env.DB, db.DEMO_USER_EMAIL);
  if (!demoUser) return errorJson("INTERNAL_ERROR", "Demo user not seeded", 500, origin);

  const { meetingId, jobIds } = await db.createMeetingWithJobs(env.DB, demoUser.id, title, file.name);

  // Deliberately awaited, not fire-and-forget via waitUntil(): waitUntil only
  // buys ~30s of extra runtime after the response is sent, nowhere near
  // enough for real transcription. A Workers Free request has no wall-clock
  // limit while the client stays connected, so run the whole pipeline inline
  // instead - the frontend just waits longer for this one response. This is
  // the "smaller working slice first" MVP; true background processing needs
  // Cloudflare Queues (see CLAUDE.md) so it survives past this request's
  // lifetime, planned as the next slice for longer recordings.
  await runMeetingPipeline(env, meetingId, jobIds, audio);

  const meeting = await db.getMeetingFull(env.DB, meetingId);
  return json({ meeting }, 201, origin);
}

async function handlePatchActionItem(actionItemId: string, request: Request, env: Env, origin: string): Promise<Response> {
  const body = await readJson<ActionItemStatusBody>(request);
  if (!body.status || !VALID_ACTION_ITEM_STATUSES.includes(body.status as ActionItemStatus)) {
    return errorJson("INVALID_STATUS", `Invalid status: ${body.status}`, 400, origin);
  }

  const actionItem = await db.updateActionItemStatus(env.DB, actionItemId, body.status as ActionItemStatus);
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
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    await db.ensureDemoSeed(env.DB);

    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      if (method === "GET" && pathname === "/health") return json({ status: "ok" }, 200, origin);
      if (method === "POST" && pathname === "/api/auth/login") return await handleLogin(request, env, origin);
      if (method === "POST" && pathname === "/api/auth/signup") return await handleSignup(request, env, origin);
      if (method === "GET" && pathname === "/api/meetings") return await handleListMeetings(env, origin);
      if (method === "POST" && pathname === "/api/meetings") return await handleCreateMeeting(request, env, origin);

      const meetingMatch = pathname.match(/^\/api\/meetings\/([^/]+)$/);
      if (method === "GET" && meetingMatch) return await handleGetMeeting(meetingMatch[1], env, origin);

      const actionItemMatch = pathname.match(/^\/api\/action-items\/([^/]+)$/);
      if (method === "PATCH" && actionItemMatch) {
        return await handlePatchActionItem(actionItemMatch[1], request, env, origin);
      }

      return errorJson("NOT_FOUND", "No such route", 404, origin);
    } catch (err) {
      console.error(err);
      return errorJson("INTERNAL_ERROR", "Unexpected server error", 500, origin);
    }
  },
};
