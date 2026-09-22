import type { ActionItem, ActionItemStatus, Meeting, MeetingSummaryView, UsageStatus, User } from "@/lib/types";

// Every call goes through this base URL. It defaults to "" (same-origin),
// which hits the mock Next.js Route Handlers under app/api/**. Once the
// real Cloudflare Worker is deployed, set NEXT_PUBLIC_API_BASE_URL to its
// URL and every call below starts hitting the real backend instead —
// no call-site changes needed.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// Not secret - Client IDs are embedded in every OAuth frontend's bundle
// regardless of language/framework. See DESIGN_SYSTEM.md 5b-iv for where
// this came from and wrangler.jsonc (Whisper_Cloudflare_API) for the
// matching backend-side var.
const GOOGLE_CLIENT_ID = "737639598890-3r5gtcebdhn2je2uq5rtld2lj86oc323.apps.googleusercontent.com";

export const SESSION_STORAGE_KEY = "whisper.session";

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return (JSON.parse(raw) as { token?: string }).token ?? null;
  } catch {
    return null;
  }
}

function clearSessionAndRedirectToLogin() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.location.href = "/login";
}

// Carries the structured error body (code/reason/usage) alongside the
// message, so callers like the new-meeting page can branch on RATE_LIMITED
// vs any other failure and read the fresh usage snapshot the 429 body
// includes, instead of making a second request just to re-fetch it.
export class ApiError extends Error {
  status: number;
  code?: string;
  reason?: string;
  usage?: UsageStatus;
  constructor(message: string, status: number, code?: string, reason?: string, usage?: UsageStatus) {
    super(message);
    this.status = status;
    this.code = code;
    this.reason = reason;
    this.usage = usage;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Don't force a JSON content-type on FormData bodies — the browser needs
  // to set its own multipart boundary.
  const isFormData = init?.body instanceof FormData;
  const token = getStoredToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    // Session expired/invalid - same handling as an explicit logout, plus
    // a redirect, since whatever the caller was about to do can't proceed.
    clearSessionAndRedirectToLogin();
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body?.error?.message ?? body?.error ?? `Request failed: ${res.status}`,
      res.status,
      body?.error?.code,
      body?.error?.reason,
      body?.usage,
    );
  }

  return res.json() as Promise<T>;
}

export interface AuthedUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export const api = {
  /** Builds Google's authorization URL for a full-page redirect - see
   * DESIGN_SYSTEM.md 5b-i for the rest of the flow (the callback lands on
   * the Worker, not here, since only it can hold the client secret). */
  googleSignInUrl: () => {
    const redirectUri = `${API_BASE_URL}/api/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: crypto.randomUUID(),
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  /** Local-dev-only shortcut (mock backend, no NEXT_PUBLIC_API_BASE_URL):
   * real Google sign-in can't work against localhost (the registered
   * redirect URI is the deployed Worker's), so this hits the mock's login
   * route directly instead of redirecting to Google at all. */
  mockGoogleSignIn: () => request<{ token: string; user: AuthedUser }>("/api/auth/login", { method: "POST" }),

  getProfile: () => request<{ user: User; usage: UsageStatus }>("/api/profile"),

  updateDisplayName: (displayName: string) =>
    request<{ user: User; usage: UsageStatus }>("/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ displayName }),
    }),

  getUsageToday: () => request<{ usage: UsageStatus }>("/api/usage/today"),

  listMeetings: () => request<{ meetings: MeetingSummaryView[] }>("/api/meetings"),

  createMeeting: (title: string, file: File) => {
    const formData = new FormData();
    formData.append("title", title);
    formData.append("file", file);
    return request<{ meeting: Meeting }>("/api/meetings", { method: "POST", body: formData });
  },

  getMeeting: (id: string) => request<{ meeting: Meeting }>(`/api/meetings/${id}`),

  renameMeeting: (id: string, title: string) =>
    request<{ meeting: Meeting }>(`/api/meetings/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),

  createActionItem: (
    meetingId: string,
    input: { description: string; assigneeName?: string | null; dueDate?: string | null },
  ) =>
    request<{ actionItem: ActionItem }>(`/api/meetings/${meetingId}/action-items`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateActionItem: (
    meetingId: string,
    actionItemId: string,
    patch: {
      description?: string;
      assigneeName?: string | null;
      dueDate?: string | null;
      status?: ActionItemStatus;
    },
  ) =>
    request<{ actionItem: ActionItem }>(`/api/action-items/${actionItemId}`, {
      method: "PATCH",
      body: JSON.stringify({ meetingId, ...patch }),
    }),
};
