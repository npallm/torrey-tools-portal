import { Badge, statusTone } from "@/components/Badge";
import { PageHeader } from "@/components/PageHeader";
import { employeeName, ptoRequests } from "@/lib/data";

export default function PtoPage() {
  const pending = ptoRequests.filter((r) => r.status === "Pending");
  const decided = ptoRequests.filter((r) => r.status !== "Pending");

  return (
    <div>
      <PageHeader
        title="Time Off"
        subtitle="Review PTO requests and recent decisions."
      />

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Needs approval
      </h2>
      <div className="mb-8 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Dates</th>
              <th className="px-4 py-3">Days</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pending.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium">
                  {employeeName(r.employeeId)}
                </td>
                <td className="px-4 py-3">{r.type}</td>
                <td className="px-4 py-3">
                  {r.startDate} → {r.endDate}
                </td>
                <td className="px-4 py-3">{r.days}</td>
                <td className="px-4 py-3 text-slate-500">{r.note ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Decided
      </h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Dates</th>
              <th className="px-4 py-3">Days</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {decided.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium">
                  {employeeName(r.employeeId)}
                </td>
                <td className="px-4 py-3">{r.type}</td>
                <td className="px-4 py-3">
                  {r.startDate} → {r.endDate}
                </td>
                <td className="px-4 py-3">{r.days}</td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
