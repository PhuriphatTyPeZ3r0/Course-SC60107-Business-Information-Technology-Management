import type { Transition } from "framer-motion";

/** Shared spring feel for glass-surface motion (card entry, tab switches,
 * the trash view, etc.) instead of every component hand-tuning its own. */
export const glassSpring: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
};
