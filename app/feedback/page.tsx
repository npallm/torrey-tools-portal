import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { FeedbackRequestComposer } from "@/components/feedback/FeedbackRequestComposer";
import { createFeedbackRequestAction } from "./actions";
import { requireRole } from "@/lib/auth/session";
import { isDatabaseRequiredError, today } from "@/lib/server/common";
import { getFeedbackDashboard } from "@/lib/server/feedback";

export const dynamic = "force-dynamic";

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireRole("client_admin", "consultant", "manager");
  const query = await searchParams;
  try {
    const data = await getFeedbackDashboard(user);
    const defaultDueDate = new Date(`${today()}T00:00:00Z`);
    defaultDueDate.setUTCDate(defaultDueDate.getUTCDate() + 14);
    const dueDate = defaultDueDate.toISOString().slice(0, 10);
    return (
      <div className="space-y-6">
        <PageHeader title="Peer feedback" subtitle="Request confidential peer perspectives for your direct reports." />
        {query.error && <p role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{query.error}</p>}
        {!!data.directReports.length && user.workerId && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Request feedback</h2>
            <FeedbackRequestComposer
              reports={data.directReports.map((person) => ({ ...person, department: person.department ?? "" }))}
              peers={data.peers}
              suggestions={data.suggestions}
              requesterId={user.workerId}
              defaultDueDate={dueDate}
              action={createFeedbackRequestAction}
            />
          </section>
        )}
        <section>
          <h2 className="mb-3 text-lg font-semibold">Requests</h2>
          {data.requests.length ? (
            <div className="overflow-x-auto rounded border bg-white">
              <table className="min-w-full divide-y text-sm">
                <thead className="bg-slate-50 text-left"><tr><th className="p-3">Subject</th><th className="p-3">Due</th><th className="p-3">Status</th><th className="p-3">Responses</th></tr></thead>
                <tbody className="divide-y">{data.requests.map((request) => (
                  <tr key={request.id}>
                    <td className="p-3"><Link href={`/feedback/${request.id}`} className="text-brand-700 underline">{request.subjectName}</Link></td>
                    <td className="p-3">{request.dueDate}</td>
                    <td className="p-3 capitalize">{request.status}</td>
                    <td className="p-3">{request.responseCount} of {request.recipientCount} responded</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="rounded border bg-white p-4 text-sm text-slate-500">No peer feedback requests yet.</p>}
        </section>
      </div>
    );
  } catch (error) {
    if (isDatabaseRequiredError(error)) return <DatabaseNotice />;
    throw error;
  }
}
