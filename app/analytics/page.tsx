import { Badge } from "@/components/Badge";
import { PageHeader } from "@/components/PageHeader";
import { BarChart } from "@/components/analytics/BarChart";
import {
  compaRatio,
  employees,
  ptoRequests,
  separations,
} from "@/lib/data";

function quarter(dateStr: string): string {
  const m = new Date(dateStr).getMonth();
  return `Q${Math.floor(m / 3) + 1}`;
}

export default function AnalyticsPage() {
  const headcount = employees.length;
  const ltmSeparations = separations.length; // seed set is all 2026
  const avgHeadcount = headcount + ltmSeparations / 2;
  const turnoverRate = ltmSeparations / avgHeadcount;

  const compaData = employees.map((e) => ({
    label: e.name.split(" ")[0],
    value: Math.round(compaRatio(e) * 100) / 100,
    hint: e.department,
  }));

  const sepsByQuarter = new Map<string, number>();
  for (const s of separations) {
    sepsByQuarter.set(quarter(s.endDate), (sepsByQuarter.get(quarter(s.endDate)) ?? 0) + 1);
  }
  const turnoverData = ["Q1", "Q2", "Q3", "Q4"].map((q) => ({
    label: q,
    value: sepsByQuarter.get(q) ?? 0,
  }));

  const ptoByType = new Map<string, number>();
  for (const r of ptoRequests.filter((r) => r.status === "Approved")) {
    ptoByType.set(r.type, (ptoByType.get(r.type) ?? 0) + r.days);
  }
  const ptoData = [...ptoByType.entries()].map(([label, value]) => ({
    label,
    value,
  }));

  const byDept = new Map<string, number>();
  for (const e of employees) {
    byDept.set(e.department, (byDept.get(e.department) ?? 0) + 1);
  }
  const headcountData = [...byDept.entries()].map(([label, value]) => ({
    label,
    value,
  }));

  const kpis = [
    { label: "Headcount", value: String(headcount) },
    { label: "Turnover (LTM)", value: `${(turnoverRate * 100).toFixed(1)}%` },
    {
      label: "Avg compa ratio",
      value: (
        employees.reduce((s, e) => s + compaRatio(e), 0) / headcount
      ).toFixed(2),
    },
    {
      label: "Separations (2026)",
      value: String(ltmSeparations),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Workforce metrics: turnover, compa ratio, headcount, PTO usage."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-lg border border-slate-200 bg-white p-5"
          >
            <p className="text-3xl font-semibold text-brand-700">{k.value}</p>
            <p className="mt-1 text-sm text-slate-600">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Compa ratio by employee
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Salary ÷ pay-range midpoint. 0.90–1.10 is the typical healthy band.
          </p>
          <BarChart data={compaData} format={(v) => v.toFixed(2)} />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Separations by quarter
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            2026 departures (voluntary, involuntary, contract end).
          </p>
          <BarChart data={turnoverData} color="#b45309" />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Headcount by department
          </h2>
          <BarChart data={headcountData} color="#0369a1" />
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Approved PTO days by type
          </h2>
          <BarChart data={ptoData} color="#6d28d9" />
        </section>
      </div>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Recent separations
        </h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {separations.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <span className="font-medium">{s.name}</span>
              <span className="text-slate-500">{s.department}</span>
              <span className="text-xs text-slate-500">{s.endDate}</span>
              <Badge tone={s.reason === "Voluntary" ? "yellow" : "slate"}>
                {s.reason}
              </Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
