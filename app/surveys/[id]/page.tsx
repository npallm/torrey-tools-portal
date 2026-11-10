import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { ManagerSurveyResults } from "@/components/surveys/ManagerSurveyResults";
import { closeSurveyAction, launchSurveyAction } from "@/app/surveys/actions";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getSurvey } from "@/lib/server/surveys";

export const dynamic = "force-dynamic";

export default async function SurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const survey = await getSurvey(id);
    if (!survey) return <p>Survey not found.</p>;
    return (
      <div>
        <PageHeader title={survey.title} subtitle={survey.description ?? "Manager effectiveness survey"} />
        <div className="flex flex-wrap gap-2">
          {survey.status === "draft" && <form action={launchSurveyAction}><input type="hidden" name="surveyId" value={survey.id} /><button className="rounded bg-brand-700 px-4 py-2 text-sm text-white">Launch survey</button></form>}
          {survey.status === "open" && <form action={closeSurveyAction}><input type="hidden" name="surveyId" value={survey.id} /><button className="rounded border bg-white px-4 py-2 text-sm">Close survey</button></form>}
          <Link className="rounded border bg-white px-4 py-2 text-sm" href="/outbox">Invitation outbox</Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {[["Invited", String(survey.invited)], ["Responded", String(survey.responded)], ["Response rate", survey.responseRate === null ? "—" : `${survey.responseRate.toFixed(1)}%`], ["Managers scored", `${survey.managersScored} of ${survey.managerCount}`]].map(([label, value]) => <div key={label} className="rounded-lg border bg-white p-4"><p className="text-xs uppercase text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>)}
        </div>
        <ManagerSurveyResults initialData={survey} />
        <section className="mt-8 rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Manager share links</h2>
          <ul className="mt-3 divide-y text-sm">
            {survey.shares.map((share) => <li key={share.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{share.name ?? share.recipientEmail}</span><a className="text-brand-700 underline" href={share.path}>{share.path}</a></li>)}
            {!survey.shares.length && <li className="py-2 text-slate-500">Links are created when the survey launches.</li>}
          </ul>
        </section>
      </div>
    );
  } catch (error) {
    if (isDatabaseRequiredError(error)) return <DatabaseNotice />;
    throw error;
  }
}
