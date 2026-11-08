import Link from "next/link";
import { Badge, statusTone } from "@/components/Badge";
import { PageHeader } from "@/components/PageHeader";
import {
  documents,
  employeeName,
  employees,
  onboardingTasks,
  ptoRequests,
  reviews,
} from "@/lib/data";

export default function Dashboard() {
  const pendingPto = ptoRequests.filter((r) => r.status === "Pending");
  const openTasks = onboardingTasks.filter((t) => !t.done);
  const openReviews = reviews.filter((r) => r.status !== "Complete");

  const cards = [
    { label: "Employees", value: employees.length, href: "/employees" },
    { label: "Pending PTO", value: pendingPto.length, href: "/pto" },
    { label: "Open onboarding tasks", value: openTasks.length, href: "/onboarding" },
    { label: "Reviews due", value: openReviews.length, href: "/reviews" },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="A quick view of your people operations."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-lg border border-slate-200 bg-white p-5 hover:border-brand-500"
          >
            <p className="text-3xl font-semibold text-brand-700">{c.value}</p>
            <p className="mt-1 text-sm text-slate-600">{c.label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            PTO awaiting approval
          </h2>
          <ul className="divide-y divide-slate-100">
            {pendingPto.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">{employeeName(r.employeeId)}</p>
                  <p className="text-xs text-slate-500">
                    {r.type} · {r.startDate} → {r.endDate} ({r.days}d)
                  </p>
                </div>
                <Badge tone={statusTone(r.status)}>{r.status}</Badge>
              </li>
            ))}
            {pendingPto.length === 0 && (
              <li className="py-2 text-sm text-slate-500">Nothing pending.</li>
            )}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recent documents
          </h2>
          <ul className="divide-y divide-slate-100">
            {documents.slice(0, 4).map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2">
                <p className="text-sm font-medium">{d.title}</p>
                <p className="text-xs text-slate-500">{d.updatedAt}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
