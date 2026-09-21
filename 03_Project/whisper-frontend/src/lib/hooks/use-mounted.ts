"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}
function getSnapshot() {
  return true;
}
function getServerSnapshot() {
  return false;
}

/**
 * True once the client has hydrated and painted. Needed because React
 * Strict Mode's dev-only mount->unmount->mount churn can cancel a Framer
 * Motion animation that starts inline via `animate` on first mount and
 * leave it stuck at its `initial` values (reproduced: landing hero text
 * rendered at opacity 0 forever in dev). Gate such props with
 * `animate={isMounted ? {...} : undefined}` instead of animating
 * unconditionally, so the transition only starts once, on the settled
 * mount. Implemented via useSyncExternalStore (server snapshot `false`,
 * client snapshot `true`) rather than a setState-in-effect, per
 * react-hooks/set-state-in-effect.
 */
export function useMounted() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
