"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth/context";
import type { AuthedUser } from "@/lib/api/client";

// Reverses index.ts's base64UrlEncodeJson() (Whisper_Cloudflare_API) - see
// DESIGN_SYSTEM.md 5b-i for why this rides in the URL fragment (never a
// query string, so it never hits server logs or Referer headers) rather
// than a second round trip to fetch the user.
function base64UrlDecodeJson<T>(value: string): T {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export default function AuthCallbackPage() {
  const { setSession } = useAuth();
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("token");
    const userBlob = params.get("user");

    if (!token || !userBlob) {
      toast.error("Sign-in failed - missing session data");
      router.replace("/login");
      return;
    }

    try {
      const user = base64UrlDecodeJson<AuthedUser>(userBlob);
      setSession({ token, user });
      router.replace("/dashboard");
    } catch {
      toast.error("Sign-in failed - could not read session data");
      router.replace("/login");
    }
  }, [router, setSession]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <Skeleton className="h-8 w-48" />
    </div>
  );
}
