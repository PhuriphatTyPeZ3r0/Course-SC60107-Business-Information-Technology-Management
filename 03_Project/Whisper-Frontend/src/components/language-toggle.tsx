"use client";

import { Icon } from "@/components/icon";
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
      <Icon name="translate" className="text-[16px]" />
      {locale === "th" ? "ไทย" : "EN"}
    </Button>
  );
}
