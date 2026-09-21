"use client";

import { useCallback, useSyncExternalStore } from "react";

// A tiny external store over localStorage, read via useSyncExternalStore
// instead of "read in an effect, then setState" (which
// react-hooks/set-state-in-effect flags, correctly: it causes an extra
// render pass and a hydration-mismatch flash). Same-tab writers call
// writeLocalStorage(), which notifies subscribers directly; the native
// "storage" event only fires for other tabs, so both are wired up.

const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach((cb) => cb());
}

function subscribe(key: string, callback: () => void) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(callback);

  const onStorage = (e: StorageEvent) => {
    if (e.key === key) callback();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.get(key)?.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function writeLocalStorage(key: string, value: string | null) {
  if (value === null) {
    window.localStorage.removeItem(key);
  } else {
    window.localStorage.setItem(key, value);
  }
  notify(key);
}

function getServerSnapshot() {
  return null;
}

/** The raw string stored at `key`, or null (both when absent and during SSR). */
export function useLocalStorageRaw(key: string): string | null {
  return useSyncExternalStore(
    useCallback((callback) => subscribe(key, callback), [key]),
    () => window.localStorage.getItem(key),
    getServerSnapshot,
  );
}
