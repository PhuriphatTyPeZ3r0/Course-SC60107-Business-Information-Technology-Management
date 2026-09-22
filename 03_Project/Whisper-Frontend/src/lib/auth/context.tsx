"use client";

import { createContext, useContext, useMemo } from "react";
import { SESSION_STORAGE_KEY, type AuthedUser } from "@/lib/api/client";
import { useLocalStorageRaw, writeLocalStorage } from "@/lib/hooks/use-local-storage";
import { useMounted } from "@/lib/hooks/use-mounted";

interface Session {
  token: string;
  user: AuthedUser;
}

interface AuthContextValue {
  session: Session | null;
  isHydrated: boolean;
  /** Called by /auth/callback once it's parsed the token+user out of the
   * Google redirect's URL fragment - see DESIGN_SYSTEM.md 5b-i. */
  setSession: (session: Session) => void;
  /** Patches just the user portion of the current session (e.g. after
   * editing display name on /profile) - keeps the same token. */
  updateUser: (user: AuthedUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// useSyncExternalStore requires getSnapshot to return a referentially
// stable value when the underlying data hasn't changed (otherwise it
// re-renders forever). Cache the last parse so unrelated re-renders reuse
// the same object instead of producing a fresh one from JSON.parse.
let parseCache: { raw: string | null; session: Session | null } = { raw: null, session: null };

function parseSession(raw: string | null): Session | null {
  if (raw === parseCache.raw) return parseCache.session;
  let session: Session | null = null;
  if (raw) {
    try {
      session = JSON.parse(raw);
    } catch {
      session = null;
    }
  }
  parseCache = { raw, session };
  return session;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const raw = useLocalStorageRaw(SESSION_STORAGE_KEY);
  const isHydrated = useMounted();
  const session = parseSession(raw);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isHydrated,
      setSession: (next) => writeLocalStorage(SESSION_STORAGE_KEY, JSON.stringify(next)),
      updateUser: (user) => {
        if (!session) return;
        writeLocalStorage(SESSION_STORAGE_KEY, JSON.stringify({ ...session, user }));
      },
      logout: () => writeLocalStorage(SESSION_STORAGE_KEY, null),
    }),
    [session, isHydrated],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
