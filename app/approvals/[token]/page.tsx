import { DatabaseNotice } from "@/components/DatabaseNotice";
import { PageHeader } from "@/components/PageHeader";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getApprovalByToken } from "@/lib/server/changeRequests";
import { decideApprovalAction } from "@/app/approvals/actions";
import { requireUser } from "@/lib/auth/session";
import { isIntendedWorker } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

export default async function ApprovalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string | string[]; decided?: string | string[] }>;
}) {
  const { token } = await params;
  const user = await requireUser(`/approvals/${token}`);
  const query = await searchParams;
  const error = typeof query.error === "string" ? query.error : null;
  const decided = typeof query.decided === "string" ? query.decided : null;
  try {
    const data = await getApprovalByToken(token);
    if (!data) return <p className="rounded border bg-white p-5">This approval link is not valid.</p>;
    if (!isIntendedWorker(user, data.approverWorkerId)) {
      return <p className="rounded border bg-white p-5">This link belongs to another person.</p>;
    }
    const { request } = data;
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="Change request approval" subtitle={`For ${request.subjectName}`} />
        {error && <p role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        {decided && <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Your decision was recorded: {decided}.</p>}
        <section className="grid gap-3 rounded-lg border bg-white p-5 sm:grid-cols-2">
          <p><span className="text-sm text-slate-500">Change type</span><br />{request.changeTypeLabel}</p>
          <p><span className="text-sm text-slate-500">Submitted by</span><br />{request.submittedBy}</p>
          <p><span className="text-sm text-slate-500">Current value</span><br />{request.currentValue || "—"}</p>
          <p><span className="text-sm text-slate-500">Requested value</span><br />{request.requestedValue}</p>
          <p><span className="text-sm text-slate-500">Effective date</span><br />{request.effectiveDate}</p>
          <p><span className="text-sm text-slate-500">Reason</span><br />{request.reason || "—"}</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Approval chain</h2>
          {request.steps.map((step) => (
            <article key={step.id} className="rounded border bg-white p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <p><span className="text-xs uppercase text-slate-500">Step {step.stepNumber}</span><br /><span className="font-medium">{step.approverLabel}</span></p>
                <span className="self-start rounded-full bg-slate-100 px-2 py-1 text-xs capitalize">{step.status}</span>
              </div>
              {step.eligibleApproverNames.length > 0 && <p className="mt-1 text-sm text-slate-600">Eligible approvers: {step.eligibleApproverNames.join(", ")}</p>}
              {step.decidedByName && <p className="mt-1 text-sm text-slate-600">By {step.decidedByName}{step.comment ? ` · ${step.comment}` : ""}</p>}
            </article>
          ))}
        </section>
        {data.actionable ? (
          <section className="space-y-3 rounded-lg border border-brand-200 bg-brand-50 p-5">
            <h2 className="font-semibold">Your decision</h2>
            <p className="text-sm text-slate-600">This link is for {data.approverName}. Choose approve or reject; a rejection requires a comment.</p>
            <form action={decideApprovalAction}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="decision" value="approve" />
              <button className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Approve</button>
            </form>
            <form action={decideApprovalAction} className="space-y-2">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="decision" value="reject" />
              <label className="block text-sm font-medium" htmlFor="rejection-comment">Rejection comment</label>
              <textarea id="rejection-comment" name="comment" required rows={3} className="w-full rounded border border-slate-300 bg-white px-3 py-2" />
              <button className="rounded bg-rose-700 px-4 py-2 text-sm font-semibold text-white">Reject request</button>
            </form>
          </section>
        ) : (
          <p className="rounded border bg-slate-50 p-4 text-sm">
            This request no longer needs your action. Current status: <span className="font-semibold capitalize">{request.status}</span>.
          </p>
        )}
      </div>
    );
  } catch (loadError) {
    if (isDatabaseRequiredError(loadError)) return <DatabaseNotice />;
    throw loadError;
  }
}
