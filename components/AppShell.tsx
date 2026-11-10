"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const publicSurveyRoute = pathname.startsWith("/s/") || pathname.startsWith("/r/");

  return (
    <div className="flex min-h-screen">
      {!publicSurveyRoute && <Sidebar />}
      <main className={`flex-1 ${publicSurveyRoute ? "p-4 sm:p-8" : "p-8"}`}>
        {children}
      </main>
    </div>
  );
}
