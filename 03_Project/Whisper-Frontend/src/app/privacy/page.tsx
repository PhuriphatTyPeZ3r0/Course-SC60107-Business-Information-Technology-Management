"use client";

import { SiteHeader } from "@/components/site-header";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/lib/i18n/context";

export default function PrivacyPage() {
  const { t } = useLanguage();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <h1 className="mb-1 text-3xl font-bold tracking-tight">{t.privacy.title}</h1>
        <p className="mb-8 text-sm text-muted-foreground">{t.privacy.updated}</p>

        <Card className="glass-panel">
          <CardContent className="space-y-6 pt-6 text-sm leading-relaxed">
            <p>{t.privacy.intro}</p>

            <div>
              <h2 className="mb-2 font-semibold">{t.privacy.dataTitle}</h2>
              <p className="text-muted-foreground">{t.privacy.dataBody}</p>
            </div>

            <div>
              <h2 className="mb-2 font-semibold">{t.privacy.useTitle}</h2>
              <p className="text-muted-foreground">{t.privacy.useBody}</p>
            </div>

            <div>
              <h2 className="mb-2 font-semibold">{t.privacy.contactTitle}</h2>
              <p className="text-muted-foreground">{t.privacy.contactBody}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
