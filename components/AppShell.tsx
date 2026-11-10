"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const publicLinkRoute = pathname.startsWith("/s/")
    || pathname.startsWith("/r/")
    || (pathname.startsWith("/approvals/") && pathname !== "/approvals/templates");

  return (
    <div className="flex min-h-screen">
      {!publicLinkRoute && <Sidebar />}
      <main className={`flex-1 ${publicLinkRoute ? "p-4 sm:p-8" : "p-8"}`}>
        {children}
      </main>
    </div>
  );
}
