import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { Badge } from "@/components/Badge";
import { calibrationAction, goalProgressAction, releaseReviewCycleAction, reviewCycleStatusAction } from "@/app/reviews/actions";
import { managerChain, supOrgs } from "@/lib/org/hierarchy";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getActivePeople } from "@/lib/server/org";
import { getReviewCycleDetail } from "@/lib/server/reviews";

export const dynamic = "force-dynamic";

export default async function ReviewCyclePage({
  params,
  searchParams,
}: {
  params: Promise<{ cycleId: string }>;
  searchParams: Promise<{ tab?: string; department?: string; supOrg?: string }>;
}) {
  const [{ cycleId }, query] = await Promise.all([params, searchParams]);
  try {
    const [detail, people] = await Promise.all([getReviewCycleDetail(cycleId), getActivePeople()]);
    if (!detail) return <p>Review cycle not found.</p>;
    const activePeople = people.map(({ id, name, managerId }) => ({ id, name, managerId }));
    const managerForSubject = new Map(activePeople.map((person) => [person.id, managerChain(person.id, activePeople)]));
    const orgs = supOrgs(activePeople);
    const assignments = detail.assignments.filter((assignment) =>
      (!query.department || assignment.department === query.department) &&
      (!query.supOrg || managerForSubject.get(assignment.subjectWorkerId)?.includes(query.supOrg)),
    );
    const tab = query.tab === "calibration" || query.tab === "goals" ? query.tab : "progress";
    return (
      <div>
        <PageHeader title={detail.cycle.name} subtitle={`${detail.cycle.periodStart} → ${detail.cycle.periodEnd} · ${detail.cycle.templateName}`} />
        <form action={reviewCycleStatusAction} className="mb-5 flex flex-wrap items-center gap-2"><input type="hidden" name="cycleId" value={cycleId} /><label className="text-sm">Cycle phase <select name="status" defaultValue={detail.cycle.status} className="ml-2 rounded border p-2">{["planning","self_review","manager_review","calibration","released","closed"].map((value) => <option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}</select></label><button className="rounded border bg-white px-3 py-2 text-sm">Update phase</button></form>
        <nav className="mb-4 flex gap-2 text-sm">{(["progress","calibration","goals"] as const).map((value) => <Link className={`rounded px-3 py-2 ${tab === value ? "bg-brand-700 text-white" : "border bg-white"}`} key={value} href={`/reviews/${cycleId}?tab=${value}`}>{value[0].toUpperCase()+value.slice(1)}</Link>)}</nav>
        {tab === "progress" && <>
          <form className="mb-4 flex flex-wrap gap-3 rounded border bg-white p-3" method="get"><input type="hidden" name="tab" value="progress" /><label className="text-xs">Department<select name="department" defaultValue={query.department} className="ml-2 rounded border p-2"><option value="">All</option>{[...new Set(detail.assignments.map((row)=>row.department).filter(Boolean))].map((value)=><option key={value}>{value}</option>)}</select></label><label className="text-xs">Supervisory org<select name="supOrg" defaultValue={query.supOrg} className="ml-2 rounded border p-2"><option value="">All</option>{orgs.map((org)=><option key={org.leaderId} value={org.leaderId}>{org.label}</option>)}</select></label><button className="rounded border px-3 text-sm">Filter</button></form>
          <div className="overflow-x-auto rounded-lg border bg-white"><table className="min-w-full divide-y text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Employee</th><th className="p-3">Department</th><th className="p-3">Reviewer</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead><tbody className="divide-y">{assignments.map((row)=><tr key={row.id}><td className="p-3 font-medium">{row.subjectName}</td><td className="p-3">{row.department ?? "—"}</td><td className="p-3">{row.reviewerName}</td><td className="p-3 capitalize">{row.role}</td><td className="p-3"><Badge>{row.status.replaceAll("_"," ")}</Badge></td><td className="p-3"><Link className="text-brand-700 underline" href={`/reviews/assignments/${row.id}`}>Open</Link></td></tr>)}</tbody></table></div>
        </>}
        {tab === "calibration" && <>
          <div className="mb-4 grid gap-3 md:grid-cols-2">{[["Before calibration",detail.calibration.before],["After calibration",detail.calibration.after]].map(([label,distribution])=><section key={label as string} className="rounded border bg-white p-4"><h2 className="mb-3 font-semibold">{label as string}</h2>{(distribution as {point:number;count:number}[]).map((point)=><div key={point.point} className="mb-2 flex items-center gap-2 text-sm"><span className="w-8">{point.point}</span><div className="h-3 flex-1 rounded bg-slate-100"><div className="h-3 rounded bg-brand-600" style={{width:`${Math.min(100,point.count*10)}%`}} /></div><span>{point.count}</span></div>)}</section>)}</div>
          <p className="mb-4 rounded border bg-white p-3 text-sm">Calibration shifts: {detail.calibration.shift.raised} raised · {detail.calibration.shift.lowered} lowered · {detail.calibration.shift.unchanged} unchanged · average {detail.calibration.shift.averageShift?.toFixed(2) ?? "—"}</p>
          <div className="overflow-x-auto rounded border bg-white"><table className="min-w-full divide-y text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-3">Employee</th><th className="p-3">Proposed</th><th className="p-3">Calibrated</th><th className="p-3">Notes</th><th></th></tr></thead><tbody className="divide-y">{detail.outcomes.map((row)=><tr key={row.workerId}><td className="p-3">{row.workerName}</td><td className="p-3">{row.proposed?.toFixed(2) ?? "—"}</td><td colSpan={3} className="p-3"><form action={calibrationAction} className="flex flex-wrap gap-2"><input type="hidden" name="cycleId" value={cycleId}/><input type="hidden" name="workerId" value={row.workerId}/><input name="proposed" type="number" step="0.01" defaultValue={row.proposed ?? ""} className="w-24 rounded border p-1" aria-label="Proposed rating"/><input name="calibrated" type="number" step="0.01" defaultValue={row.calibrated ?? ""} className="w-24 rounded border p-1" aria-label="Calibrated rating"/><input name="notes" defaultValue={row.notes ?? ""} className="min-w-48 flex-1 rounded border p-1" placeholder="Calibration notes"/><button className="rounded border px-3">Save</button></form></td></tr>)}</tbody></table></div>
          <form action={releaseReviewCycleAction} className="mt-4"><input type="hidden" name="cycleId" value={cycleId}/><button className="rounded bg-brand-700 px-4 py-2 text-sm text-white">Release cycle</button></form>
        </>}
        {tab === "goals" && <div className="overflow-x-auto rounded border bg-white"><table className="min-w-full divide-y text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-3">Employee</th><th className="p-3">Goal</th><th className="p-3">Progress</th><th className="p-3">Status</th><th></th></tr></thead><tbody className="divide-y">{detail.goals.map((goal)=><tr key={goal.id}><td className="p-3">{goal.workerName}</td><td className="p-3">{goal.title}</td><td colSpan={3} className="p-3"><form action={goalProgressAction} className="flex gap-2"><input type="hidden" name="goalId" value={goal.id}/><input name="progress" type="number" min="0" max="100" defaultValue={goal.progressPct} className="w-24 rounded border p-1"/><select name="status" defaultValue={goal.status} className="rounded border p-1">{["not_started","on_track","at_risk","off_track","done"].map((s)=><option key={s}>{s}</option>)}</select><button className="rounded border px-3">Save</button></form></td></tr>)}</tbody></table></div>}
      </div>
    );
  } catch (error) {
    if (isDatabaseRequiredError(error)) return <DatabaseNotice />;
    throw error;
  }
}
