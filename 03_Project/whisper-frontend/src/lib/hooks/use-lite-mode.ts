"use client";

import { useEffect, useState } from "react";

/**
 * True on small screens or when the user prefers reduced motion — the
 * signal the landing hero uses to swap the live 3D scene for the
 * lightweight fallback (per the "mobile gets a lighter fallback" decision).
 */
export function useLiteMode() {
  const [liteMode, setLiteMode] = useState(false);

  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 767px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const update = () => setLiteMode(narrow.matches || reducedMotion.matches);
    update();

    narrow.addEventListener("change", update);
    reducedMotion.addEventListener("change", update);
    return () => {
      narrow.removeEventListener("change", update);
      reducedMotion.removeEventListener("change", update);
    };
  }, []);

  return liteMode;
}
