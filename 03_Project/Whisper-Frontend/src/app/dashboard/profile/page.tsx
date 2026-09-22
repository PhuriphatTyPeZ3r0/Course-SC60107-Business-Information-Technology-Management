"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import { api } from "@/lib/api/client";
import type { UsageStatus } from "@/lib/types";

export default function ProfilePage() {
  const { t } = useLanguage();
  const { session, updateUser } = useAuth();
  const [displayName, setDisplayName] = useState(session?.user.displayName ?? "");
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    api
      .getProfile()
      .then(({ user, usage }) => {
        setDisplayName(user.displayName);
        setUsage(usage);
        updateUser(user);
      })
      .catch(() => {});
    // Only ever needs to run once on mount - updateUser/session would
    // otherwise re-trigger this on every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initials = session?.user.displayName?.slice(0, 2).toUpperCase() ?? "??";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed || trimmed.length > 100) return;

    setIsSaving(true);
    try {
      const { user, usage } = await api.updateDisplayName(trimmed);
      updateUser(user);
      setUsage(usage);
      toast.success(t.profile.saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSaving(false);
    }
  }

  if (!session) return null;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{t.profile.title}</h1>
      <p className="mb-8 text-sm text-muted-foreground">{t.profile.subtitle}</p>

      <Card className="glass-panel mb-6">
        <CardContent className="flex items-center gap-4 pt-6">
          <Avatar size="lg">
            {session.user.avatarUrl && <AvatarImage src={session.user.avatarUrl} alt={session.user.displayName} />}
            <AvatarFallback className="bg-primary/20 text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{session.user.displayName}</p>
            <p className="text-sm text-muted-foreground">{session.user.email}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t.profile.displayNameLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="displayName">{t.profile.displayNameLabel}</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={100}
                required
              />
            </div>
            <Button type="submit" disabled={isSaving || !displayName.trim()}>
              {t.profile.save}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base">{t.profile.usageTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {usage && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t.profile.usagePersonal}</span>
                <span className="font-medium">
                  {usage.personal.used} / {usage.personal.limit}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t.profile.usageGlobal}</span>
                <span className="font-medium">
                  {usage.global.used} / {usage.global.limit}
                </span>
              </div>
            </>
          )}
          <p className="text-xs text-muted-foreground">{t.profile.usageResetNote}</p>
        </CardContent>
      </Card>
    </div>
  );
}
