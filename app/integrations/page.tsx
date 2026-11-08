import { Badge } from "@/components/Badge";
import { PageHeader } from "@/components/PageHeader";
import {
  finchConfigured,
  finchProviders,
  getFinchDirectory,
} from "@/lib/finch";
import { employees } from "@/lib/data";
import type { FinchDirectoryEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadDirectory(): Promise<{
  source: "finch" | "seed";
  rows: FinchDirectoryEntry[];
  error?: string;
}> {
  if (!finchConfigured()) {
    return {
      source: "seed",
      rows: employees.map((e) => ({
        id: e.id,
        firstName: e.name.split(" ")[0],
        lastName: e.name.split(" ").slice(1).join(" "),
        department: e.department,
        title: e.title,
        isActive: e.status !== "Offboarding",
      })),
    };
  }
  try {
    return { source: "finch", rows: await getFinchDirectory() };
  } catch (err) {
    return { source: "finch", rows: [], error: String(err) };
  }
}

export default async function IntegrationsPage() {
  const { source, rows, error } = await loadDirectory();

  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle="Connect your HRIS or payroll system through Finch to sync people data."
      />

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Finch</h2>
            <p className="mt-1 text-sm text-slate-500">
              Unified API for 200+ HRIS and payroll providers — directory,
              employment, and pay data through one token.
            </p>
          </div>
          <Badge tone={finchConfigured() ? "green" : "slate"}>
            {finchConfigured() ? "Connected" : "Not configured"}
          </Badge>
        </div>
        {!finchConfigured() && (
          <p className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
            Set <code>FINCH_API_TOKEN</code> to a Finch access token (use the
            sandbox provider to test). Optionally set{" "}
            <code>FINCH_API_URL</code> — defaults to api.tryfinch.com. The table
            below shows seed data until then.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-md bg-rose-50 p-3 text-xs text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {finchProviders.map((p) => (
            <div
              key={p.name}
              className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <p className="text-sm font-medium">{p.name}</p>
              <p className="text-xs text-slate-500">{p.category}</p>
            </div>
          ))}
        </div>
      </section>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Synced directory ({source === "finch" ? "via Finch" : "seed data"})
      </h2>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium">
                  {r.firstName} {r.lastName}
                </td>
                <td className="px-4 py-3">{r.department ?? "—"}</td>
                <td className="px-4 py-3">{r.title ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge tone={r.isActive ? "green" : "slate"}>
                    {r.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
