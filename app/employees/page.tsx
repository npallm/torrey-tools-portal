import { Badge, statusTone } from "@/components/Badge";
import { PageHeader } from "@/components/PageHeader";
import { employees } from "@/lib/data";

export default function EmployeesPage() {
  return (
    <div>
      <PageHeader
        title="Employee Directory"
        subtitle="Everyone on the team, their role, and their status."
      />
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Start date</th>
              <th className="px-4 py-3">Manager</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium">{e.name}</p>
                  <p className="text-xs text-slate-500">{e.email}</p>
                </td>
                <td className="px-4 py-3">{e.title}</td>
                <td className="px-4 py-3">{e.department}</td>
                <td className="px-4 py-3">{e.employmentType}</td>
                <td className="px-4 py-3">{e.location}</td>
                <td className="px-4 py-3">{e.startDate}</td>
                <td className="px-4 py-3">{e.manager ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone(e.status)}>{e.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
