"use client";

import { motion } from "framer-motion";
import { useMounted } from "@/lib/hooks/use-mounted";

/**
 * Landing hero visual: a coded animated glass/gradient scene. A real Spline
 * scene (@splinetool/react-spline) was the original plan (see grilling
 * session notes), but designing one requires Spline's own GUI editor, and
 * the library pulls in ~5MB of WASM (physics/geometry engines) that goes
 * entirely unused without an actual scene configured — not worth bundling
 * on every deploy for a dependency nothing renders yet. Re-add it once a
 * real scene exists.
 */
export function HeroScene() {
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
