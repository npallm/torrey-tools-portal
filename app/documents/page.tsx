import { Badge } from "@/components/Badge";
import { PageHeader } from "@/components/PageHeader";
import { documents } from "@/lib/data";

const categoryTone: Record<string, "blue" | "green" | "yellow" | "slate" | "red"> =
  {
    Policy: "blue",
    Handbook: "green",
    Form: "yellow",
    Template: "slate",
    Compliance: "red",
  };

export default function DocumentsPage() {
  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Policies, forms, templates, and compliance records."
      />
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Last updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {documents.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{d.title}</td>
                <td className="px-4 py-3">
                  <Badge tone={categoryTone[d.category] ?? "slate"}>
                    {d.category}
                  </Badge>
                </td>
                <td className="px-4 py-3">{d.owner}</td>
                <td className="px-4 py-3 text-slate-500">{d.updatedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
