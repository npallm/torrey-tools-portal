import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { submitSurveyAction } from "@/app/surveys/actions";
import { LIKERT_LABELS } from "@/lib/surveys/managerQuestions";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getSurveyFormByToken } from "@/lib/server/surveys";
import { requireUser } from "@/lib/auth/session";
import { isIntendedWorker } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

export default async function PublicSurveyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; submitted?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/s/${token}`);
  try {
    const survey = await getSurveyFormByToken(token);
    if (survey.state === "unknown") return <p className="mx-auto max-w-xl rounded-lg bg-white p-6">This survey link is not valid.</p>;
    if ("workerId" in survey && !isIntendedWorker(user, survey.workerId)) {
      return <p className="mx-auto max-w-xl rounded-lg bg-white p-6">This link belongs to another person.</p>;
    }
    if (survey.state === "closed") return <div className="mx-auto max-w-xl"><PageHeader title={survey.title} /><p className="rounded-lg bg-white p-6">This survey is closed.</p></div>;
    if (survey.state === "submitted" || query.submitted) return <p className="mx-auto max-w-xl rounded-lg bg-white p-6 text-center"><strong>Thank you.</strong><br />Your feedback has been submitted.</p>;
    if (survey.state !== "open") return <p className="mx-auto max-w-xl rounded-lg bg-white p-6">This survey is not available.</p>;
    const grouped = new Map<string, typeof survey.questions>();
    for (const question of survey.questions) {
      const list = grouped.get(question.category) ?? [];
      list.push(question);
      grouped.set(question.category, list);
    }
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={survey.title} subtitle={survey.description ?? "Please share feedback about your direct manager."} />
        {query.error && <p className="mb-4 rounded bg-rose-50 p-3 text-sm text-rose-800">{query.error}</p>}
        <form action={submitSurveyAction} className="space-y-6">
          <input type="hidden" name="token" value={token} />
          {[...grouped].map(([category, questions]) => (
            <section key={category} className="rounded-lg border bg-white p-4">
              <h2 className="mb-4 font-semibold">{category}</h2>
              <div className="space-y-6">
                {questions.map((question) => (
                  <fieldset key={question.id}>
                    <legend className="mb-3 text-sm font-medium">{question.prompt}</legend>
                    <div className="grid grid-cols-5 gap-2">
                      {LIKERT_LABELS.map((label, index) => (
                        <label key={label} className="flex cursor-pointer flex-col items-center gap-2 rounded border p-2 text-center text-[11px] sm:text-xs">
                          <input type="radio" name={`answer:${question.id}`} value={index + 1} required />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            </section>
          ))}
          <button className="w-full rounded bg-brand-700 px-4 py-3 font-medium text-white">Submit feedback</button>
        </form>
      </div>
    );
  } catch (error) {
    if (isDatabaseRequiredError(error)) return <DatabaseNotice />;
    throw error;
  }
}
