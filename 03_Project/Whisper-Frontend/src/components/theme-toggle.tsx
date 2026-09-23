"use client";

import { useTheme } from "next-themes";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { useMounted } from "@/lib/hooks/use-mounted";

// Defaults to system preference (see Providers) and next-themes persists any
// explicit override to localStorage itself. resolvedTheme is only known
// after mount, so render a neutral placeholder until then to avoid a
// server/client mismatch.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      className="text-foreground/80 hover:text-foreground"
    >
      <Icon name={mounted ? (isDark ? "light_mode" : "dark_mode") : "brightness_auto"} className="text-[18px]" />
    </Button>
  );
}
