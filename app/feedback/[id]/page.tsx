import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { closeFeedbackRequestAction } from "../actions";
import { requireRole } from "@/lib/auth/session";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getFeedbackRequestDetail } from "@/lib/server/feedback";

export const dynamic = "force-dynamic";

export default async function FeedbackRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; closed?: string }>;
}) {
  const user = await requireRole("client_admin", "consultant", "manager");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  try {
    const request = await getFeedbackRequestDetail(id, user);
    if (!request) return <p className="rounded border bg-white p-5">Feedback request not found.</p>;
    return (
      <div className="space-y-5">
        <PageHeader title={`Peer feedback · ${request.subjectName}`} subtitle={`Requested by ${request.requesterName} · Due ${request.dueDate}`} />
        {query.error && <p role="alert" className="rounded bg-rose-50 p-3 text-sm text-rose-800">{query.error}</p>}
        {query.closed && <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">Request closed.</p>}
        <section className="rounded border bg-white p-4">
          <p className="whitespace-pre-wrap">{request.message}</p>
          <p className="mt-3 text-sm text-slate-600">{request.responseCount} of {request.recipientCount} responded</p>
          {request.status === "open" && <form action={closeFeedbackRequestAction} className="mt-3"><input type="hidden" name="requestId" value={request.id} /><button className="rounded border px-3 py-2 text-sm">Close request</button></form>}
        </section>
        <section className="rounded border bg-white p-4">
          <h2 className="font-semibold">Invited peers</h2>
          <ul className="mt-2 list-inside list-disc text-sm">{request.recipients.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}</ul>
        </section>
        {!request.unlocked ? (
          <p className="rounded border bg-slate-50 p-4 text-sm">Results unlock at {request.minResponses} responses ({request.responseCount} so far)</p>
        ) : (
          <section className="space-y-3 rounded border bg-white p-4">
            <h2 className="font-semibold">Feedback results</h2>
            <p>Average collaboration rating: <strong>{request.averageRating?.toFixed(2) ?? "—"} / 5</strong></p>
            {request.responses.map((response, index) => (
              <article key={index} className="space-y-2 border-t pt-3 text-sm">
                <p>Collaboration rating: {response.rating} / 5</p>
                <p><strong>Keep doing:</strong> {response.keepDoing}</p>
                <p><strong>Do differently:</strong> {response.doDifferently}</p>
                {response.anythingElse && <p><strong>Anything else:</strong> {response.anythingElse}</p>}
              </article>
            ))}
          </section>
        )}
      </div>
    );
  } catch (error) {
    if (isDatabaseRequiredError(error)) return <DatabaseNotice />;
    throw error;
  }
}
