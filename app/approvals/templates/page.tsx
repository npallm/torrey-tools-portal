import Link from "next/link";
import { ApprovalTemplateEditor } from "@/components/approvals/ApprovalTemplateEditor";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { PageHeader } from "@/components/PageHeader";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getApprovalTemplates, getChangeRequestFormData } from "@/lib/server/changeRequests";
import { requireRole } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ApprovalTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[]; archived?: string | string[] }>;
}) {
  await requireRole("client_admin", "consultant");
  const query = await searchParams;
  const error = typeof query.error === "string" ? query.error : null;
  const saved = typeof query.saved === "string";
  const archived = typeof query.archived === "string";
  try {
    const data = await getChangeRequestFormData();
    const allTemplates = await getApprovalTemplates(true);
    return (
      <div className="space-y-6">
        <PageHeader title="Approval templates" subtitle="Maintain reusable sequential chains for employee changes." />
        <Link href="/requests" className="text-sm text-brand-700 underline">← Back to requests</Link>
        {error && <p role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        {saved && <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Template saved.</p>}
        {archived && <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Template archived.</p>}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Create template</h2>
          <ApprovalTemplateEditor people={data.people.map(({ id, name }) => ({ id, name }))} positions={data.positions} />
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Existing templates</h2>
          {allTemplates.map((template) => (
            <div key={template.id}>
              <h3 className="mb-2 font-medium">{template.name}{template.isDefault ? " · Default" : ""}</h3>
              <ApprovalTemplateEditor
                template={template}
                people={data.people.map(({ id, name }) => ({ id, name }))}
                positions={data.positions}
              />
            </div>
          ))}
          {!allTemplates.length && <p className="rounded border bg-white p-4 text-sm text-slate-500">No templates yet.</p>}
        </section>
      </div>
    );
  } catch (loadError) {
    if (isDatabaseRequiredError(loadError)) return <DatabaseNotice />;
    throw loadError;
  }
}
