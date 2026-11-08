import Link from "next/link";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/employees", label: "Employee Directory" },
  { href: "/requests", label: "Change Requests" },
  { href: "/pto", label: "Time Off" },
  { href: "/analytics", label: "Analytics" },
  { href: "/integrations", label: "Integrations" },
  { href: "/documents", label: "Documents" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/reviews", label: "Reviews" },
];

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white">
      <div className="px-6 py-5">
        <p className="text-lg font-semibold text-brand-700">Torrey Tools</p>
        <p className="text-xs text-slate-500">Client Portal</p>
      </div>
      <nav className="flex flex-col px-3">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
