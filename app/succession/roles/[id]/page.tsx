import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { addCandidateAction, addDevelopmentActionAction, removeCandidateAction, updateCandidateAction, updateRoleAction } from "@/app/succession/actions";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getCriticalRoleDetail } from "@/lib/server/succession";
import { READINESS_LABELS } from "@/lib/talent/succession";
import { requireRole } from "@/lib/auth/session";

const actionTypeLabels = {
  experience: "Experience",
  exposure: "Exposure",
  education: "Education",
} as const;

const actionStatusLabels: Record<string, string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
};

export const dynamic="force-dynamic";

export default async function CriticalRolePage({params}:{params:Promise<{id:string}>}){
  await requireRole("client_admin", "consultant");
  const {id}=await params;
  try{
    const role=await getCriticalRoleDetail(id); if(!role)return <p>Critical role not found.</p>;
    const actionsByWorker = new Map<string, { name: string; actions: typeof role.developmentActions }>();
    for (const action of role.developmentActions) {
      const group = actionsByWorker.get(action.workerId) ?? { name: action.workerName, actions: [] };
      group.actions.push(action);
      actionsByWorker.set(action.workerId, group);
    }
    return <div><PageHeader title={role.title} subtitle={`${role.department??""} · incumbent ${role.incumbent??"not assigned"} · ${role.riskBand} risk`}/>
      <form action={updateRoleAction} className="mb-5 grid gap-3 rounded border bg-white p-4 sm:grid-cols-4"><input type="hidden" name="roleId" value={id}/><label className="text-sm">Impact of loss (1–5)<input name="impact" type="number" min="1" max="5" defaultValue={role.impactOfLoss} className="mt-1 block rounded border p-2"/></label><label className="text-sm">Probability of loss (1–5)<input name="probability" type="number" min="1" max="5" defaultValue={role.probabilityOfLoss} className="mt-1 block rounded border p-2"/>{role.suggestedProbability!==null&&<span className="text-xs text-slate-500">Suggested probability: {role.suggestedProbability}</span>}</label><label className="text-sm sm:col-span-2">Rationale<input name="rationale" defaultValue={role.rationale??""} className="mt-1 block w-full rounded border p-2"/></label><button className="rounded bg-brand-700 px-3 py-2 text-white">Save role</button><p className="text-sm">Bench summary: {role.bench.label}</p></form>
      <section className="space-y-3"><h2 className="font-semibold">Successor slate</h2>{role.candidates.map((candidate)=><article key={`${candidate.id}:${candidate.readiness}`} className="rounded border bg-white p-4"><p className="font-medium">{candidate.name} · {READINESS_LABELS[candidate.readiness]}</p><form action={updateCandidateAction} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="roleId" value={id}/><input type="hidden" name="candidateId" value={candidate.id}/><select name="readiness" defaultValue={candidate.readiness} className="rounded border p-2"><option value="ready_now">Ready now</option><option value="ready_1_2_years">1–2 years</option><option value="ready_3_plus_years">3+ years</option></select><input name="rank" type="number" defaultValue={candidate.rank??1} className="w-20 rounded border p-2"/><input name="skillGaps" defaultValue={candidate.skillGaps.join(", ")} className="min-w-40 rounded border p-2" placeholder="Skill gaps"/><label className="flex items-center gap-1 text-sm"><input name="emergencyBackup" type="checkbox" defaultChecked={candidate.isEmergencyBackup}/>Emergency backup</label><input name="notes" defaultValue={candidate.notes??""} className="rounded border p-2" placeholder="Notes"/><button className="rounded border px-3">Save</button></form><form action={removeCandidateAction} className="mt-2"><input type="hidden" name="roleId" value={id}/><input type="hidden" name="candidateId" value={candidate.id}/><button className="text-xs text-rose-700 underline">Remove candidate</button></form></article>)}</section>
      <form action={addCandidateAction} className="mt-4 flex flex-wrap gap-2 rounded border bg-white p-4"><input type="hidden" name="roleId" value={id}/><select name="workerId" required className="rounded border p-2"><option value="">Add candidate</option>{role.people.map((person)=><option key={person.id} value={person.id}>{person.name}</option>)}</select><select name="readiness" className="rounded border p-2"><option value="ready_3_plus_years">3+ years</option><option value="ready_1_2_years">1–2 years</option><option value="ready_now">Ready now</option></select><input name="skillGaps" placeholder="Skill gaps, comma-separated" className="rounded border p-2"/><label className="flex items-center gap-1 text-sm"><input type="checkbox" name="emergencyBackup"/>Emergency backup</label><button className="rounded bg-brand-700 px-3 text-white">Add</button></form>
      <form action={addDevelopmentActionAction} className="mt-5 flex flex-wrap gap-2 rounded border bg-white p-4"><input type="hidden" name="roleId" value={id}/><select name="workerId" className="rounded border p-2">{role.people.map((person)=><option key={person.id} value={person.id}>{person.name}</option>)}</select><select name="type" className="rounded border p-2"><option>experience</option><option>exposure</option><option>education</option></select><input name="title" required placeholder="Development action" className="rounded border p-2"/><input name="dueDate" type="date" className="rounded border p-2"/><button className="rounded border px-3">Add development action</button></form>
      <section className="mt-5 space-y-3">
        <h2 className="font-semibold">Development actions</h2>
        {!actionsByWorker.size && <p className="rounded border bg-white p-4 text-sm text-slate-500">No development actions for this role.</p>}
        {[...actionsByWorker].map(([workerId, group]) => (
          <article key={workerId} className="rounded border bg-white p-4">
            <h3 className="font-medium">{group.name}</h3>
            <ul className="mt-2 divide-y text-sm">
              {group.actions.map((action) => (
                <li key={action.id} className="py-2">
                  <p>{actionTypeLabels[action.type]} · {action.title}</p>
                  <p className="text-slate-500">Due {action.dueDate ?? "date not set"} · {actionStatusLabels[action.status] ?? action.status}</p>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </div>;
  }catch(error){if(isDatabaseRequiredError(error))return <DatabaseNotice/>;throw error;}
}
