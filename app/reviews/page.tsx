import { Badge, statusTone } from "@/components/Badge";
import { PageHeader } from "@/components/PageHeader";
import { employeeName, reviews } from "@/lib/data";

export default function ReviewsPage() {
  return (
    <div>
      <PageHeader
        title="Performance Reviews"
        subtitle="Review cycles, statuses, and ratings."
      />
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Rating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reviews.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">
                  {employeeName(r.employeeId)}
                </td>
                <td className="px-4 py-3">{r.period}</td>
                <td className="px-4 py-3">{r.dueDate}</td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                </td>
                <td className="px-4 py-3">{r.rating ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
