import type { NextConfig } from "next";

// STATIC_EXPORT=1 is set only for the Cloudflare Pages build (see
// scripts/build-static.sh) - Cloudflare Pages serves this as a static site,
// not via Next.js SSR, so the app/api/** mock route handlers (server-only,
// unused once NEXT_PUBLIC_API_BASE_URL points at a real backend anyway) get
// physically moved out of the tree for that build; `output: "export"`
// wouldn't build successfully with them present.
const nextConfig: NextConfig = {
  ...(process.env.STATIC_EXPORT === "1" ? { output: "export" } : {}),
};

export default nextConfig;
