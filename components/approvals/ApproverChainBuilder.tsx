"use client";

import { useState } from "react";
import { validateChain, type ApproverRef } from "@/lib/approvals/workflow";
import type { PositionOption } from "@/lib/server/changeRequests";

type PersonOption = { id: string; name: string };

export function ApproverChainBuilder({
  people,
  positions,
  initialSteps,
  fieldName = "approvers",
  deferErrorsUntilInteraction = false,
}: {
  people: PersonOption[];
  positions: PositionOption[];
  initialSteps: ApproverRef[];
  fieldName?: string;
  deferErrorsUntilInteraction?: boolean;
}) {
  const [steps, setSteps] = useState<ApproverRef[]>(initialSteps);
  const [hasInteracted, setHasInteracted] = useState(false);
  const error = deferErrorsUntilInteraction && !hasInteracted ? null : validateChain(steps);

  function update(index: number, next: ApproverRef) {
    setHasInteracted(true);
    setSteps((current) => current.map((step, position) => position === index ? next : step));
  }

  function move(index: number, direction: -1 | 1) {
    setHasInteracted(true);
    setSteps((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={fieldName} value={JSON.stringify(steps)} />
      <div className="space-y-2">
        {steps.map((step, index) => (
          <div key={`${index}-${step.kind}`} className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[100px_minmax(0,1fr)_auto]">
            <span className="self-center text-xs font-medium uppercase tracking-wide text-slate-500">
              Step {index + 1}
            </span>
            <div className="flex flex-wrap gap-2">
              <select
                aria-label={`Step ${index + 1} approver kind`}
                value={step.kind}
                onChange={(event) => update(
                  index,
                  event.target.value === "position"
                    ? { kind: "position", positionId: positions[0]?.id ?? "" }
                    : { kind: "worker", workerId: people[0]?.id ?? "" },
                )}
                className="min-w-28 rounded border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="worker">Person</option>
                <option value="position">Position</option>
              </select>
              {step.kind === "worker" ? (
                <select
                  aria-label={`Step ${index + 1} person`}
                  value={step.workerId}
                  onChange={(event) => update(index, { kind: "worker", workerId: event.target.value })}
                  className="min-w-48 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Choose a person</option>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              ) : (
                <select
                  aria-label={`Step ${index + 1} position`}
                  value={step.positionId}
                  onChange={(event) => update(index, { kind: "position", positionId: event.target.value })}
                  className="min-w-56 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Choose a position</option>
                  {positions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.positionCode ?? "Uncoded"} · {position.title} · {position.currentHolderName ?? "Vacant"}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex items-center justify-end gap-1">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move step ${index + 1} up`} className="rounded border px-2 py-1 text-sm disabled:opacity-40">↑</button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === steps.length - 1} aria-label={`Move step ${index + 1} down`} className="rounded border px-2 py-1 text-sm disabled:opacity-40">↓</button>
              <button type="button" onClick={() => { setHasInteracted(true); setSteps((current) => current.filter((_, position) => position !== index)); }} aria-label={`Remove step ${index + 1}`} className="rounded border px-2 py-1 text-sm text-rose-700">Remove</button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setHasInteracted(true);
            setSteps((current) => current.length >= 6 ? current : [...current, { kind: "worker", workerId: people[0]?.id ?? "" }]);
          }}
          disabled={steps.length >= 6}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Add approver step
        </button>
        <span className="text-xs text-slate-500">{steps.length} of 6 steps</span>
      </div>
      {error && <p className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}
