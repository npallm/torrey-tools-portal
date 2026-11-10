import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getSuccessionDashboard } from "@/lib/server/succession";

export const dynamic="force-dynamic";

export default async function SuccessionPage(){
  try{
    const data=await getSuccessionDashboard();
    return <div><PageHeader title="Succession planning" subtitle="Contemporary talent segments, critical-role risk and bench strength."/>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">{[["Bench coverage",data.kpis.benchCoverage===null?"—":`${data.kpis.benchCoverage.toFixed(1)}%`],["Single points of failure",data.kpis.singlePointsOfFailure],["High potential",data.kpis.highPotential]].map(([label,value])=><div key={label} className="rounded border bg-white p-4"><p className="text-xs uppercase text-slate-500">{label}</p><p className="text-xl font-semibold">{value}</p></div>)}</div>
      <section className="overflow-x-auto rounded border bg-white"><h2 className="p-4 font-semibold">Critical roles</h2><table className="min-w-full divide-y text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-3">Role</th><th className="p-3">Incumbent</th><th className="p-3">Risk</th><th className="p-3">Bench</th><th className="p-3"></th></tr></thead><tbody className="divide-y">{data.roles.map((role)=><tr key={role.id}><td className="p-3">{role.title}</td><td className="p-3">{role.incumbent??"—"}</td><td className="p-3">{role.riskScore} · {role.riskBand}</td><td className="p-3">{role.bench.label}</td><td className="p-3"><Link className="text-brand-700 underline" href={`/succession/roles/${role.id}`}>Edit slate</Link></td></tr>)}</tbody></table></section>
      <section className="mt-6"><h2 className="mb-3 text-lg font-semibold">Talent pool</h2><div className="grid gap-3 md:grid-cols-2">{data.talentPool.map((person)=><article key={person.workerId} className="rounded border bg-white p-4"><h3 className="font-semibold"><Link className="text-brand-700 underline" href={`/succession/people/${person.workerId}`}>{person.name}</Link></h3><p className="text-sm text-slate-500">{person.division} · {person.department}</p><p className="mt-2 text-sm">{person.profile.potential} · Aspiration {person.profile.aspiration} · Ability {person.profile.ability} · Engagement {person.profile.engagement}</p><p className="text-sm">Performance: {person.performanceTrend} · Flight risk: {person.profile.flightRisk} · Skills: {person.profile.skills.join(", ")}</p><ul className="mt-2 text-sm">{person.roles.map((role)=><li key={role.roleId}>{role.role} · {role.readiness}</li>)}</ul></article>)}</div></section>
    </div>;
  }catch(error){if(isDatabaseRequiredError(error))return <DatabaseNotice/>;throw error;}
}
