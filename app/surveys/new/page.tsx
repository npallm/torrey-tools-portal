import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { createSurveyAction } from "@/app/surveys/actions";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getActiveQuestionBank } from "@/lib/server/surveys";

export const dynamic = "force-dynamic";

export default async function NewSurveyPage() {
  try {
    const questions = await getActiveQuestionBank();
    return (
      <div>
        <PageHeader title="New manager survey" subtitle="A survey copies the active question bank when it is created." />
        <form action={createSurveyAction} className="max-w-3xl space-y-4 rounded-lg border bg-white p-5">
          <label className="block text-sm font-medium">Title<input name="title" required className="mt-1 block w-full rounded border p-2" /></label>
          <label className="block text-sm font-medium">Description<textarea name="description" rows={3} className="mt-1 block w-full rounded border p-2" /></label>
          <label className="block text-sm font-medium">Close date<input type="date" name="closesAt" className="mt-1 block rounded border p-2" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="includeContingentWorkers" /> Include contingent workers</label>
          <p className="text-sm text-slate-600">Anonymity minimum: <strong>5 direct-report responses</strong> per manager.</p>
          <div className="rounded border bg-slate-50 p-4">
            <h2 className="font-semibold">Active questions ({questions.length})</h2>
            <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">
              {questions.map((question, index) => <li key={question.id}><span className="font-medium">{question.category}</span> — {question.prompt}<span className="block text-xs text-slate-500">Question {index + 1} · 1–5 Likert</span></li>)}
            </ol>
            {!questions.length && <p className="mt-2 text-sm text-amber-700">No active items. Add or activate questions in the question bank first.</p>}
          </div>
          <button disabled={!questions.length} className="rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save draft</button>
        </form>
      </div>
    );
  } catch (error) {
    if (isDatabaseRequiredError(error)) return <DatabaseNotice />;
    throw error;
  }
}
