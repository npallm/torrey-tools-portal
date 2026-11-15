"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/employees", label: "Employee Directory" },
  { href: "/requests", label: "Change Requests" },
  { href: "/pto", label: "Time Off" },
  { href: "/analytics", label: "Analytics" },
  { href: "/integrations", label: "Integrations" },
  { href: "/documents", label: "Documents" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/surveys", label: "Surveys" },
  { href: "/outbox", label: "Outbox" },
  { href: "/reviews", label: "Reviews" },
  { href: "/one-on-ones", label: "1:1s" },
  { href: "/succession", label: "Succession" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white">
      <div className="px-6 py-5">
        <p className="text-lg font-semibold text-brand-700">Torrey Tools</p>
        <p className="text-xs text-slate-500">Client Portal</p>
      </div>
      <nav className="flex flex-col px-3">
        {nav.map((item) => {
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
    </aside>
  );
}
