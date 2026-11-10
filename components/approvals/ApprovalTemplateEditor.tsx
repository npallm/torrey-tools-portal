import { archiveApprovalTemplateAction, saveApprovalTemplateAction } from "@/app/requests/actions";
import { ApproverChainBuilder } from "@/components/approvals/ApproverChainBuilder";
import { CHANGE_REQUEST_TYPES, type ApprovalTemplate, type PositionOption } from "@/lib/server/changeRequests";

type PersonOption = { id: string; name: string };

export function ApprovalTemplateEditor({
  people,
  positions,
  template,
}: {
  people: PersonOption[];
  positions: PositionOption[];
  template?: ApprovalTemplate;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5">
      <form action={saveApprovalTemplateAction} className="space-y-4">
        <input type="hidden" name="templateId" value={template?.id ?? ""} />
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Template name</span>
            <input name="name" required defaultValue={template?.name ?? ""} className="w-full rounded border border-slate-300 px-3 py-2" placeholder="e.g. Standard change" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Change type</span>
            <select name="changeType" defaultValue={template?.changeType ?? ""} className="w-full rounded border border-slate-300 px-3 py-2">
              <option value="">Any type</option>
              {CHANGE_REQUEST_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isDefault" defaultChecked={template?.isDefault} />
          Use as the default for this change type
        </label>
        <ApproverChainBuilder
          people={people}
          positions={positions}
          initialSteps={template?.steps ?? []}
          fieldName="steps"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Save template</button>
          {!template?.id && <span className="text-xs text-slate-500">Templates can have one to six sequential steps.</span>}
        </div>
      </form>
      {template?.id && (
        <form action={archiveApprovalTemplateAction} className="mt-3 border-t pt-3">
          <input type="hidden" name="templateId" value={template.id} />
          <button className="text-sm text-rose-700 underline">Archive template</button>
          {!template.active && <span className="ml-3 text-xs text-slate-500">Archived</span>}
        </form>
      )}
    </article>
  );
}
