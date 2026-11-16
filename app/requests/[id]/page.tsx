import Link from "next/link";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { PageHeader } from "@/components/PageHeader";
import { isDatabaseRequiredError } from "@/lib/server/common";
import {
  getChangeRequestDetail,
  getChangeRequestFormData,
} from "@/lib/server/changeRequests";
import {
  reassignChangeRequestAction,
  withdrawChangeRequestAction,
} from "@/app/requests/actions";
import { requireRole } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function ChangeRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const user = await requireRole("client_admin", "consultant", "manager");
  const { id } = await params;
  const query = await searchParams;
  const error = typeof query.error === "string" ? query.error : null;
  try {
    const [request, options] = await Promise.all([
      getChangeRequestDetail(id, user),
      getChangeRequestFormData(user),
    ]);
    if (!request) return <p className="rounded border bg-white p-5">Change request not found.</p>;
    const pendingStep = request.steps.find((step) => step.status === "pending");
    return (
      <div className="space-y-6">
        <PageHeader title={`Change request · ${request.subjectName}`} subtitle={`${request.changeTypeLabel} · ${request.status}`} />
        <Link href="/requests" className="text-sm text-brand-700 underline">← Back to requests</Link>
        {error && <p role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <section className="grid gap-4 rounded-lg border bg-white p-5 sm:grid-cols-2">
          <p><span className="text-sm text-slate-500">Submitted by</span><br />{request.submittedBy}</p>
          <p><span className="text-sm text-slate-500">Submitted</span><br />{request.submittedAt ? new Date(request.submittedAt).toLocaleString() : "—"}</p>
          <p><span className="text-sm text-slate-500">Current value</span><br />{request.currentValue || "—"}</p>
          <p><span className="text-sm text-slate-500">Requested value</span><br />{request.requestedValue}</p>
          <p><span className="text-sm text-slate-500">Effective date</span><br />{request.effectiveDate}</p>
          <p><span className="text-sm text-slate-500">Reason</span><br />{request.reason || "—"}</p>
        </section>
        {request.status === "pending" && request.submittedByWorkerId === user.workerId && (
          <form action={withdrawChangeRequestAction}>
            <input type="hidden" name="requestId" value={request.id} />
            <input type="hidden" name="submitterWorkerId" value={request.submittedByWorkerId ?? ""} />
            <button className="rounded border border-rose-300 bg-white px-3 py-2 text-sm text-rose-700">Withdraw request</button>
          </form>
        )}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Approval chain</h2>
          {request.steps.map((step) => (
            <article key={step.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step {step.stepNumber}</p>
                  <h3 className="font-medium">{step.approverLabel}</h3>
                  {step.eligibleApproverNames.length > 0 && <p className="text-sm text-slate-600">Eligible: {step.eligibleApproverNames.join(", ")}</p>}
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${step.status === "pending" ? "bg-amber-100 text-amber-800" : step.status === "approved" ? "bg-emerald-100 text-emerald-800" : step.status === "rejected" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}>{step.status}</span>
              </div>
              {step.decidedByName && <p className="mt-2 text-sm text-slate-600">Decided by {step.decidedByName}{step.decidedAt ? ` · ${new Date(step.decidedAt).toLocaleString()}` : ""}</p>}
              {step.comment && <p className="mt-2 rounded bg-slate-50 p-3 text-sm">{step.comment}</p>}
              {isAdmin(user) && step.status === "pending" && step.eligibleWorkerIds.length === 0 && (
                <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-900">No eligible approver — reassign</p>
                  <form action={reassignChangeRequestAction} className="mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="requestId" value={request.id} />
                    <select name="approverRef" required defaultValue="" className="min-w-64 rounded border border-slate-300 px-2 py-2 text-sm">
                      <option value="" disabled>Choose a person or position</option>
                      <optgroup label="People">{options.people.map((person) => <option key={person.id} value={`worker:${person.id}`}>{person.name}</option>)}</optgroup>
                      <optgroup label="Positions">{options.positions.map((position) => <option key={position.id} value={`position:${position.id}`}>{position.positionCode ?? "Uncoded"} · {position.title} · {position.currentHolderName ?? "Vacant"}</option>)}</optgroup>
                    </select>
                    <button className="rounded bg-brand-600 px-3 py-2 text-sm font-medium text-white">Reassign step</button>
                  </form>
                </div>
              )}
            </article>
          ))}
          {!request.steps.length && <p className="rounded border bg-white p-4 text-sm text-slate-500">This legacy request has no approval chain.</p>}
        </section>
        <section>
          <h2 className="mb-3 text-lg font-semibold">Event timeline</h2>
          <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
            {request.events.map((event) => (
              <li key={event.id} className="relative rounded border bg-white p-3">
                <span className="font-medium">{event.type.replaceAll("_", " ")}</span>
                {event.stepNumber && <span className="text-slate-500"> · Step {event.stepNumber}</span>}
                {event.actorName && <span className="text-slate-500"> · {event.actorName}</span>}
                {event.detail && <p className="mt-1 text-sm text-slate-600">{event.detail}</p>}
                <p className="mt-1 text-xs text-slate-400">{event.occurredAt ? new Date(event.occurredAt).toLocaleString() : ""}</p>
              </li>
            ))}
            {!request.events.length && <li className="text-sm text-slate-500">No events have been recorded.</li>}
          </ol>
        </section>
        {pendingStep && !pendingStep.eligibleWorkerIds.length && <p className="sr-only">The current approval step requires reassignment.</p>}
      </div>
    );
  } catch (loadError) {
    if (isDatabaseRequiredError(loadError)) return <DatabaseNotice />;
    throw loadError;
  }
}
