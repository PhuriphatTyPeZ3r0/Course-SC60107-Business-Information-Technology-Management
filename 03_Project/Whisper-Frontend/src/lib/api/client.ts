import type { ActionItemStatus, Meeting, MeetingSummaryView } from "@/lib/types";

// Every call goes through this base URL. It defaults to "" (same-origin),
// which hits the mock Next.js Route Handlers under app/api/**. Once the
// real Cloudflare Worker is deployed, set NEXT_PUBLIC_API_BASE_URL to its
// URL and every call below starts hitting the real backend instead —
// no call-site changes needed.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Don't force a JSON content-type on FormData bodies — the browser needs
  // to set its own multipart boundary.
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: isFormData ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? body?.error ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export interface AuthedUser {
  id: string;
  email: string;
  displayName: string;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: AuthedUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  signup: (email: string, password: string, displayName: string) =>
    request<{ token: string; user: AuthedUser }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName }),
    }),

  listMeetings: () => request<{ meetings: MeetingSummaryView[] }>("/api/meetings"),

  createMeeting: (title: string, file: File) => {
    const formData = new FormData();
    formData.append("title", title);
    formData.append("file", file);
    return request<{ meeting: Meeting }>("/api/meetings", { method: "POST", body: formData });
  },

  getMeeting: (id: string) => request<{ meeting: Meeting }>(`/api/meetings/${id}`),

  setActionItemStatus: (meetingId: string, actionItemId: string, status: ActionItemStatus) =>
    request<{ actionItem: unknown }>(`/api/action-items/${actionItemId}`, {
      method: "PATCH",
      body: JSON.stringify({ meetingId, status }),
    }),
};
