"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { motion } from "framer-motion";
import { useMounted } from "@/lib/hooks/use-mounted";

const Spline = dynamic(() => import("@splinetool/react-spline"), { ssr: false });

const SPLINE_SCENE_URL = process.env.NEXT_PUBLIC_SPLINE_SCENE_URL;

/**
 * Landing hero visual. Renders a real Spline scene when
 * NEXT_PUBLIC_SPLINE_SCENE_URL is set (design that scene visually at
 * https://spline.design — it's a GUI tool, not something scriptable here).
 * Until then, falls back to a coded animated glass/gradient scene so the
 * landing still looks intentional out of the box, and on mobile/reduced-
 * motion where the live WebGL scene is skipped for performance.
 */
export function HeroScene({ forceFallback = false }: { forceFallback?: boolean }) {
  if (SPLINE_SCENE_URL && !forceFallback) {
    return (
      <Suspense fallback={<FallbackScene />}>
        <Spline scene={SPLINE_SCENE_URL} className="h-full w-full" />
      </Suspense>
    );
  }

  return <FallbackScene />;
}

function FallbackScene() {
  const mounted = useMounted();

  return (
    <div className="relative h-full w-full overflow-hidden">
      <motion.div
        className="absolute left-1/2 top-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/30 blur-3xl"
        animate={mounted ? { scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] } : undefined}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-[65%] top-[35%] size-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/30 blur-3xl"
        animate={mounted ? { scale: [1.1, 0.9, 1.1], opacity: [0.4, 0.7, 0.4] } : undefined}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
      />
      <motion.div
        className="absolute left-[30%] top-[65%] size-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-3/20 blur-3xl"
        animate={mounted ? { scale: [0.95, 1.1, 0.95], opacity: [0.3, 0.6, 0.3] } : undefined}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="glass-panel absolute rounded-2xl"
          style={{
            width: 60 + i * 14,
            height: 60 + i * 14,
            left: `${15 + i * 13}%`,
            top: `${20 + ((i * 17) % 55)}%`,
          }}
          animate={mounted ? { y: [0, -18, 0], rotate: [0, 6, 0] } : undefined}
          transition={{
            duration: 5 + i,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.4,
          }}
        />
      ))}
    </div>
  );
}
