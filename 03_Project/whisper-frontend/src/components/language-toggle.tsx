"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n/context";

export function LanguageToggle() {
  const { locale, toggleLocale } = useLanguage();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLocale}
      className="gap-1.5 text-foreground/80 hover:text-foreground"
      aria-label="Toggle language"
    >
      <Languages className="size-4" />
      {locale === "th" ? "ไทย" : "EN"}
    </Button>
  );
}
