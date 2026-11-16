import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { createSeriesAction } from "@/app/one-on-ones/actions";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getOneOnOneDashboard } from "@/lib/server/oneOnOnes";
import { requireUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function OneOnOnesPage() {
  const user = await requireUser("/one-on-ones");
  try {
    const data = await getOneOnOneDashboard({}, user);
    return <div><PageHeader title="1:1 tracking" subtitle="Meeting cadence, action items and follow-through." />
      <div className="mb-5 grid gap-3 sm:grid-cols-4">{[["On track",data.kpis.onTrackPct===null?"—":`${data.kpis.onTrackPct.toFixed(1)}%`],["Overdue series",data.kpis.overdue],["Open actions",data.kpis.openActions],["Overdue actions",data.kpis.overdueActions]].map(([label,value])=><div key={label} className="rounded border bg-white p-4"><p className="text-xs uppercase text-slate-500">{label}</p><p className="text-xl font-semibold">{value}</p></div>)}</div>
      {(isAdmin(user) || user.role === "manager") && <details className="mb-5 rounded border bg-white p-4"><summary className="cursor-pointer font-semibold">Start 1:1 series</summary><form action={createSeriesAction} className="mt-4 flex flex-wrap gap-3">{isAdmin(user) ? <select name="managerId" required className="rounded border p-2"><option value="">Manager</option>{data.people.filter((p)=>data.people.some((report)=>report.managerId===p.id)).map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select> : <input type="hidden" name="managerId" value={user.workerId ?? ""}/>}<select name="reportId" required className="rounded border p-2"><option value="">Direct report</option>{data.people.filter((p)=>isAdmin(user) ? !!p.managerId : p.managerId===user.workerId).map((p)=><option key={p.id} value={p.id}>{p.name} · {p.department}</option>)}</select><select name="cadenceDays" className="rounded border p-2"><option value="14">Every 14 days</option><option value="7">Every 7 days</option></select><input type="date" name="startedOn" required className="rounded border p-2"/><button className="rounded bg-brand-700 px-3 py-2 text-white">Create series</button></form></details>}
      <div className="overflow-x-auto rounded border bg-white"><table className="min-w-full divide-y text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-3">Manager</th><th className="p-3">Report</th><th className="p-3">Cadence</th><th className="p-3">Last held</th><th className="p-3">Status</th><th className="p-3">Open actions</th></tr></thead><tbody className="divide-y">{data.series.map((row)=><tr key={row.id}><td className="p-3">{row.managerName}</td><td className="p-3"><Link className="text-brand-700 underline" href={`/one-on-ones/${row.id}`}>{row.reportName}</Link></td><td className="p-3">{row.cadenceDays} days</td><td className="p-3">{row.health.lastHeld ?? "Never"}</td><td className="p-3">{row.health.status}</td><td className="p-3">{row.openItems}</td></tr>)}</tbody></table></div>
    </div>;
  } catch(error) { if(isDatabaseRequiredError(error)) return <DatabaseNotice/>; throw error; }
}
