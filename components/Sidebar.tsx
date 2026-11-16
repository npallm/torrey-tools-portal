"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAdmin } from "@/lib/auth/permissions";
import type { CurrentUser } from "@/lib/auth/session-core";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/employees", label: "Employee Directory" },
  { href: "/requests", label: "Change Requests", roles: ["client_admin", "consultant", "manager"] },
  { href: "/pto", label: "Time Off" },
  { href: "/analytics", label: "Analytics", admin: true },
  { href: "/integrations", label: "Integrations", admin: true },
  { href: "/documents", label: "Documents" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/surveys", label: "Surveys", admin: true },
  { href: "/outbox", label: "Outbox", admin: true },
  { href: "/reviews", label: "Reviews", admin: true },
  { href: "/reviews/mine", label: "My reviews", roles: ["manager", "employee"] },
  { href: "/one-on-ones", label: "1:1s" },
  { href: "/feedback", label: "Peer feedback", roles: ["client_admin", "consultant", "manager"] },
  { href: "/succession", label: "Succession", admin: true },
  { href: "/settings/sso", label: "Settings", admin: true },
];

export function Sidebar({ user }: { user: CurrentUser | null }) {
  const pathname = usePathname();
  const admin = isAdmin(user);
  const visibleNav = nav.filter((item) =>
    admin || (!item.admin && (!item.roles || (user && item.roles.includes(user.role)))),
  );
  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white">
      <div className="px-6 py-5">
        <p className="text-lg font-semibold text-brand-700">Torrey Tools</p>
        <p className="text-xs text-slate-500">Client Portal</p>
      </div>
      <nav className="flex flex-col px-3">
        {visibleNav.map((item) => {
          const active = item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm font-medium hover:bg-brand-50 hover:text-brand-700 ${active ? "bg-brand-50 text-brand-700" : "text-slate-700"}`}
          >
            {item.label}
          </Link>
          );
        })}
      </nav>
      {user && (
        <div className="mt-6 border-t px-6 py-4">
          <p className="text-xs text-slate-500">Signed in as</p>
          <p className="truncate text-sm font-medium">{user.displayName ?? user.email}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
          <form action="/api/auth/logout" method="post" className="mt-3">
            <button className="text-sm text-brand-700 underline">Sign out</button>
          </form>
        </div>
      )}
    </aside>
  );
}
