import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { saveProfileAction } from "@/app/succession/actions";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getTalentPersonProfile } from "@/lib/server/succession";

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

export default async function TalentProfilePage({params}:{params:Promise<{workerId:string}>}){
  const {workerId}=await params;
  try{
    const data=await getTalentPersonProfile(workerId); if(!data)return <p>Employee not found.</p>;
    return <div><PageHeader title={data.person.name} subtitle={`${data.person.division??""} · ${data.person.department??""} · Talent assessments`}/>
      <form action={saveProfileAction} className="grid gap-3 rounded border bg-white p-4 sm:grid-cols-3"><input type="hidden" name="workerId" value={workerId}/><label className="text-sm">Assessment date<input type="date" name="assessedOn" required className="mt-1 block rounded border p-2"/></label>{(["aspiration","ability","engagement"] as const).map((field)=><label key={field} className="text-sm capitalize">{field}<select name={field} className="mt-1 block rounded border p-2">{[1,2,3].map((v)=><option key={v} value={v}>{v}</option>)}</select></label>)}<label className="text-sm">Flight risk<select name="flightRisk" className="mt-1 block rounded border p-2"><option>low</option><option>medium</option><option>high</option></select></label><label className="text-sm">Impact of loss<select name="impactOfLoss" className="mt-1 block rounded border p-2"><option>low</option><option>medium</option><option>high</option></select></label><label className="text-sm">Open to relocation<select name="openToRelocation" className="mt-1 block rounded border p-2"><option value="">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="retirementWithin2Years"/>Retirement within 2 years</label><label className="text-sm sm:col-span-2">Career interests<input name="careerInterests" className="mt-1 block w-full rounded border p-2"/></label><label className="text-sm sm:col-span-2">Skills, comma-separated<input name="skills" className="mt-1 block w-full rounded border p-2"/></label><label className="text-sm sm:col-span-3">Notes<textarea name="notes" className="mt-1 block w-full rounded border p-2"/></label><button className="rounded bg-brand-700 px-4 py-2 text-white">Save assessment</button></form>
      <section className="mt-5 rounded border bg-white p-4"><h2 className="font-semibold">Assessment history</h2>{data.profiles.map((profile)=><p key={profile.id} className="border-b py-2 text-sm">{profile.assessedOn} · {profile.potential} · {profile.flightRisk} flight risk · skills: {profile.skills.join(", ")}</p>)}</section>
      <section className="mt-5 rounded border bg-white p-4">
        <h2 className="font-semibold">Development actions</h2>
        {!data.actions.length && <p className="mt-2 text-sm text-slate-500">No development actions recorded.</p>}
        <ul className="divide-y text-sm">
          {data.actions.map((action) => (
            <li key={action.id} className="py-2">
              <p className="font-medium">{actionTypeLabels[action.type]} · {action.title}</p>
              <p className="text-slate-500">
                {action.role ? `${action.role} · ` : ""}Due {action.dueDate ?? "date not set"} · {actionStatusLabels[action.status] ?? action.status}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>;
  }catch(error){if(isDatabaseRequiredError(error))return <DatabaseNotice/>;throw error;}
}
