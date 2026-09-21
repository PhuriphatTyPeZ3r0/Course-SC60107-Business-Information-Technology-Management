"use client";

import { createContext, useContext, useMemo } from "react";
import { type Dictionary, type Locale, dictionary } from "./dictionaries";
import { useLocalStorageRaw, writeLocalStorage } from "@/lib/hooks/use-local-storage";

const STORAGE_KEY = "whisper.locale";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: Dictionary;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const raw = useLocalStorageRaw(STORAGE_KEY);
  const locale: Locale = raw === "en" ? "en" : "th";

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale: (next) => writeLocalStorage(STORAGE_KEY, next),
      toggleLocale: () => writeLocalStorage(STORAGE_KEY, locale === "th" ? "en" : "th"),
      t: dictionary[locale],
    }),
    [locale],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
