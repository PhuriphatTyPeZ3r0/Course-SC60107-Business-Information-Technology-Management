"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useLanguage } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";

export function SiteHeader() {
  const { t } = useLanguage();
  const { session } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {t.brand}
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageToggle />
          <Link href={session ? "/dashboard" : "/login"} className={buttonVariants({ size: "sm" })}>
            {session ? t.nav.dashboard : t.nav.login}
          </Link>
        </div>
      </div>
    </header>
  );
}
