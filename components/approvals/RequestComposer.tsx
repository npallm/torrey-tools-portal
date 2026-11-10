"use client";

import { useState } from "react";
import { ApproverChainBuilder } from "@/components/approvals/ApproverChainBuilder";
import type { ApproverRef } from "@/lib/approvals/workflow";
import type { ApprovalTemplate, ChangeType, PositionOption } from "@/lib/server/changeRequests";
import { submitChangeRequestAction } from "@/app/requests/actions";

const requestTypes: { value: ChangeType; label: string }[] = [
  { value: "title", label: "Title change" },
  { value: "compensation", label: "Compensation change" },
  { value: "department", label: "Department transfer" },
  { value: "schedule", label: "Schedule change" },
  { value: "manager", label: "Manager change" },
  { value: "status", label: "Status change" },
];

type Person = { id: string; name: string; department: string | null };

function defaultTemplate(templates: ApprovalTemplate[], changeType: ChangeType) {
  return templates.find((template) => template.isDefault && template.changeType === changeType)
    ?? templates.find((template) => template.isDefault && template.changeType === null)
    ?? null;
}

export function RequestComposer({
  people,
  positions,
  templates,
  effectiveDateDefault,
}: {
  people: Person[];
  positions: PositionOption[];
  templates: ApprovalTemplate[];
  effectiveDateDefault: string;
}) {
  const initialType: ChangeType = "title";
  const initialTemplate = defaultTemplate(templates, initialType);
  const fallbackApprovers: ApproverRef[] = people[0] ? [{ kind: "worker", workerId: people[0].id }] : [];
  const [changeType, setChangeType] = useState<ChangeType>(initialType);
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? "");
  const [chainVersion, setChainVersion] = useState(0);
  const [chain, setChain] = useState<ApproverRef[]>(initialTemplate?.steps ?? fallbackApprovers);

  function chooseTemplate(templateId: string) {
    setTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    if (template) setChain(template.steps);
    setChainVersion((version) => version + 1);
  }

  function chooseType(value: ChangeType) {
    setChangeType(value);
    const template = defaultTemplate(templates, value);
    setTemplateId(template?.id ?? "");
    setChain(template?.steps ?? fallbackApprovers);
    setChainVersion((version) => version + 1);
  }

  return (
    <form action={submitChangeRequestAction} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">New change request</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Employee</span>
          <select name="subjectWorkerId" required defaultValue={people[0]?.id ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2">
            <option value="">Choose an employee</option>
            {people.map((person) => <option key={person.id} value={person.id}>{person.name}{person.department ? ` · ${person.department}` : ""}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Submitted by</span>
          <select name="submittedByWorkerId" required defaultValue={people[0]?.id ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2">
            <option value="">Choose a submitter</option>
            {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Change type</span>
          <select name="changeType" value={changeType} onChange={(event) => chooseType(event.target.value as ChangeType)} className="w-full rounded-md border border-slate-300 px-3 py-2">
            {requestTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Effective date</span>
          <input name="effectiveDate" type="date" required defaultValue={effectiveDateDefault} className="w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Current value</span>
          <input name="currentValue" className="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Optional" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Requested value</span>
          <input name="requestedValue" required className="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="e.g. Senior HR Coordinator" />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Reason</span>
        <textarea name="reason" rows={2} className="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Optional context for approvers" />
      </label>
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold">Approval chain</h3>
          <p className="text-sm text-slate-500">Choose a template or build a sequential chain of up to six people or positions.</p>
        </div>
        <select aria-label="Prefill approval chain from a template" value={templateId} onChange={(event) => chooseTemplate(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">Custom chain</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}{template.isDefault ? " · Default" : ""}
            </option>
          ))}
        </select>
        <ApproverChainBuilder
          key={chainVersion}
          people={people.map(({ id, name }) => ({ id, name }))}
          positions={positions}
          initialSteps={chain}
        />
      </div>
      <input type="hidden" name="approvalTemplateId" value={templateId} />
      <button type="submit" disabled={!people.length} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
        Submit for approval
      </button>
    </form>
  );
}
