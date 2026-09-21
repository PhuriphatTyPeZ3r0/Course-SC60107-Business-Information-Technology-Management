"use client";

import { createContext, useContext, useMemo } from "react";
import { api, type AuthedUser } from "@/lib/api/client";
import { useLocalStorageRaw, writeLocalStorage } from "@/lib/hooks/use-local-storage";
import { useMounted } from "@/lib/hooks/use-mounted";

const STORAGE_KEY = "sarup.session";

interface Session {
  token: string;
  user: AuthedUser;
}

interface AuthContextValue {
  session: Session | null;
  isHydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string) => Promise<void>;
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
  const raw = useLocalStorageRaw(STORAGE_KEY);
  const isHydrated = useMounted();
  const session = parseSession(raw);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isHydrated,
      login: async (email, password) => {
        const result = await api.login(email, password);
        writeLocalStorage(STORAGE_KEY, JSON.stringify(result));
      },
      signup: async (email, password, displayName) => {
        const result = await api.signup(email, password, displayName);
        writeLocalStorage(STORAGE_KEY, JSON.stringify(result));
      },
      logout: () => writeLocalStorage(STORAGE_KEY, null),
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
