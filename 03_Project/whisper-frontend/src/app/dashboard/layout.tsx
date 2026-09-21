"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardNav } from "@/components/dashboard-nav";
import { useAuth } from "@/lib/auth/context";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const { session, isHydrated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !session) {
      router.replace("/login");
    }
  }, [isHydrated, session, router]);

  if (!isHydrated || !session) {
    return <div className="min-h-screen" />;
  }

  return (
    <div className="min-h-screen">
      <DashboardNav />
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
