"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/icon";
import { useLanguage } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import { useMounted } from "@/lib/hooks/use-mounted";
import { api } from "@/lib/api/client";

// Real Google sign-in needs a redirect_uri Google Cloud Console has
// registered - only the deployed Worker's URL is registered (see
// DESIGN_SYSTEM.md 5b-iv), so it can't work against localhost. The mock
// backend (no NEXT_PUBLIC_API_BASE_URL) short-circuits to an instant local
// session instead - see api.mockGoogleSignIn().
const IS_MOCK_BACKEND = !process.env.NEXT_PUBLIC_API_BASE_URL;

export default function LoginPage() {
  const { t } = useLanguage();
  const { setSession } = useAuth();
  const router = useRouter();
  const mounted = useMounted();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleGoogleSignIn() {
    if (!IS_MOCK_BACKEND) {
      window.location.href = api.googleSignInUrl();
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await api.mockGoogleSignIn();
      setSession(result);
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 size-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={mounted ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-sm"
      >
        <Link href="/" className="mb-6 block text-center text-lg font-semibold">
          {t.brand}
        </Link>
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>{t.auth.loginTitle}</CardTitle>
            <p className="text-sm text-muted-foreground">{t.auth.loginSubtitle}</p>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              className="w-full"
              disabled={isSubmitting}
              onClick={handleGoogleSignIn}
            >
              <Icon name="login" className="mr-2 text-[18px]" />
              {t.auth.googleSignIn}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
