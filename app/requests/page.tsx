import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { RequestComposer } from "@/components/approvals/RequestComposer";
import { isDatabaseRequiredError, today } from "@/lib/server/common";
import {
  CHANGE_REQUEST_TYPES,
  getChangeRequestFormData,
  getChangeRequests,
} from "@/lib/server/changeRequests";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[]; type?: string | string[]; error?: string | string[] }>;
}) {
  const query = await searchParams;
  const status = typeof query.status === "string" ? query.status : "all";
  const type = typeof query.type === "string" ? query.type : "all";
  const error = typeof query.error === "string" ? query.error : null;
  try {
    const [options, requests] = await Promise.all([
      getChangeRequestFormData(),
      getChangeRequests({ status, changeType: type }),
    ]);
    return (
      <div className="space-y-6">
        <PageHeader
          title="Employee Change Requests"
          subtitle="Submit, track, and approve employee changes through a sequential approval flow."
        />
        <div className="flex flex-wrap gap-2">
          <Link href="/approvals/templates" className="rounded border bg-white px-3 py-2 text-sm">Approval templates</Link>
          <Link href="/outbox" className="rounded border bg-white px-3 py-2 text-sm">Outbox</Link>
        </div>
        {error && <p role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <RequestComposer
          people={options.people.map((person) => ({ id: person.id, name: person.name, department: person.department }))}
          positions={options.positions}
          templates={options.templates}
          effectiveDateDefault={today()}
        />
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Request tracker</h2>
              <p className="text-sm text-slate-500">{requests.length} requests</p>
            </div>
            <form className="flex flex-wrap gap-2">
              <select name="status" defaultValue={status} aria-label="Filter by request status" className="rounded border border-slate-300 px-3 py-2 text-sm">
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
              <select name="type" defaultValue={type} aria-label="Filter by change type" className="rounded border border-slate-300 px-3 py-2 text-sm">
                <option value="all">All change types</option>
                {CHANGE_REQUEST_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <button className="rounded border bg-white px-3 py-2 text-sm">Filter</button>
            </form>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Submitted by</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((request) => (
                  <tr key={request.id} className="align-top">
                    <td className="px-4 py-3 font-medium"><Link className="text-brand-700 underline" href={`/requests/${request.id}`}>{request.subjectName}</Link><p className="mt-1 max-w-xs truncate text-xs font-normal text-slate-500">{request.requestedValue}</p></td>
                    <td className="px-4 py-3">{request.changeTypeLabel}</td>
                    <td className="px-4 py-3">{request.submittedBy}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{request.submittedAt ? new Date(request.submittedAt).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${request.status === "pending" ? "bg-amber-100 text-amber-800" : request.status === "approved" ? "bg-emerald-100 text-emerald-800" : request.status === "rejected" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"}`}>{request.status}</span></td>
                    <td className="min-w-60 px-4 py-3 text-slate-600">{request.progress ?? (request.status === "pending" ? "No approval steps" : request.status)}</td>
                  </tr>
                ))}
                {!requests.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">No requests match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  } catch (loadError) {
    if (isDatabaseRequiredError(loadError)) return <DatabaseNotice />;
    throw loadError;
  }
}
