"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import type { CurrentUser } from "@/lib/auth/session-core";

export function AppShell({ children, user }: { children: React.ReactNode; user: CurrentUser | null }) {
  const pathname = usePathname();
  const publicLinkRoute = pathname === "/login"
    || pathname.startsWith("/s/")
    || pathname.startsWith("/r/")
    || pathname.startsWith("/f/")
    || (pathname.startsWith("/approvals/") && pathname !== "/approvals/templates");

  return (
    <div className="flex min-h-screen">
      {!publicLinkRoute && <Sidebar user={user} />}
      <main className={`flex-1 ${publicLinkRoute ? "p-4 sm:p-8" : "p-8"}`}>
        {children}
      </main>
    </div>
  );
}
