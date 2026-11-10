import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getSurveys } from "@/lib/server/surveys";

export const dynamic = "force-dynamic";

export default async function SurveysPage() {
  try {
    const surveys = await getSurveys();
    return (
      <div>
        <PageHeader title="Manager surveys" subtitle="Confidential feedback with manager-level results." />
        <div className="mb-5 flex flex-wrap gap-3">
          <Link href="/surveys/new" className="rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white">New survey</Link>
          <Link href="/surveys/questions" className="rounded border bg-white px-4 py-2 text-sm">Question bank</Link>
          <Link href="/outbox" className="rounded border bg-white px-4 py-2 text-sm">Outbox</Link>
        </div>
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full divide-y text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Survey</th><th className="p-3">Status</th><th className="p-3">Invited</th><th className="p-3">Responded</th><th className="p-3">Response rate</th><th className="p-3">Close date</th></tr></thead>
            <tbody className="divide-y">
              {surveys.map((survey) => <tr key={survey.id}><td className="p-3 font-medium"><Link className="text-brand-700 hover:underline" href={`/surveys/${survey.id}`}>{survey.title}</Link></td><td className="p-3 capitalize">{survey.status}</td><td className="p-3">{survey.invited}</td><td className="p-3">{survey.responded}</td><td className="p-3">{survey.responseRate === null ? "—" : `${survey.responseRate.toFixed(1)}%`}</td><td className="p-3">{survey.closesAt?.slice(0, 10) ?? "—"}</td></tr>)}
              {!surveys.length && <tr><td className="p-5 text-slate-500" colSpan={6}>No manager surveys yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  } catch (error) {
    if (isDatabaseRequiredError(error)) return <DatabaseNotice />;
    throw error;
  }
}
