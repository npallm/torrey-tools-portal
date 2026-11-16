import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { ReviewTemplateEditor } from "@/components/reviews/ReviewTemplateEditor";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getReviewTemplates } from "@/lib/server/reviews";
import { requireRole } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ReviewTemplatesPage() {
  await requireRole("client_admin", "consultant");
  try {
    const templates = await getReviewTemplates();
    return <div><PageHeader title="Review templates" subtitle="Rating scales, weighted items and goal settings." />
      <div className="space-y-6">{templates.map((template) => <details key={template.id} className="rounded-lg border bg-white p-4"><summary className="cursor-pointer font-semibold">{template.name}</summary><div className="mt-4"><ReviewTemplateEditor template={template} /></div></details>)}</div>
      <h2 className="mb-3 mt-8 text-lg font-semibold">New template</h2><ReviewTemplateEditor />
    </div>;
  } catch (error) {
    if (isDatabaseRequiredError(error)) return <DatabaseNotice />;
    throw error;
  }
}
