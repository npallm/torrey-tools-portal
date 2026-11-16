import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { submitFeedbackResponseAction } from "@/app/feedback/actions";
import { requireUser } from "@/lib/auth/session";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getFeedbackInvite } from "@/lib/server/feedback";

export const dynamic = "force-dynamic";

export default async function FeedbackInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; submitted?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/f/${token}`);
  try {
    const invite = await getFeedbackInvite(token);
    if (!invite) return <p className="mx-auto max-w-2xl rounded border bg-white p-5">This feedback link is not valid.</p>;
    if (invite.recipientWorkerId !== user.workerId) {
      return <p className="mx-auto max-w-2xl rounded border bg-white p-5">This link belongs to another person.</p>;
    }
    if (query.submitted || invite.submitted) {
      return <p className="mx-auto max-w-2xl rounded border bg-white p-5">Thank you. Your feedback has been submitted.</p>;
    }
    if (!invite.canSubmit) {
      return <p className="mx-auto max-w-2xl rounded border bg-white p-5">This feedback request is closed.</p>;
    }
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title={`Peer feedback for ${invite.subjectName}`} subtitle={`Requested by ${invite.requesterName} · Due ${invite.dueDate}`} />
        {query.error && <p role="alert" className="mb-4 rounded bg-rose-50 p-3 text-sm text-rose-800">{query.error}</p>}
        <p className="mb-4 whitespace-pre-wrap rounded border bg-white p-4">{invite.message}</p>
        <form action={submitFeedbackResponseAction} className="space-y-4 rounded border bg-white p-5">
          <input type="hidden" name="token" value={token} />
          <fieldset>
            <legend className="mb-2 text-sm font-medium">How effective is {invite.subjectName} as a collaborator?</legend>
            <div className="flex gap-4">{[1, 2, 3, 4, 5].map((rating) => <label key={rating} className="flex items-center gap-1"><input type="radio" required name="rating" value={rating} />{rating}</label>)}</div>
          </fieldset>
          <label className="block text-sm font-medium">What should {invite.subjectName} keep doing?
            <textarea name="keepDoing" required rows={3} className="mt-1 block w-full rounded border p-2" />
          </label>
          <label className="block text-sm font-medium">What could {invite.subjectName} do differently or better?
            <textarea name="doDifferently" required rows={3} className="mt-1 block w-full rounded border p-2" />
          </label>
          <label className="block text-sm font-medium">Anything else?
            <textarea name="anythingElse" rows={3} className="mt-1 block w-full rounded border p-2" />
          </label>
          <button className="rounded bg-brand-700 px-4 py-2 text-sm text-white">Submit feedback</button>
        </form>
      </div>
    );
  } catch (error) {
    if (isDatabaseRequiredError(error)) return <DatabaseNotice />;
    throw error;
  }
}
