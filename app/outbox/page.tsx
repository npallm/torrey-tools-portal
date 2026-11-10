import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { CopyLink } from "@/components/CopyLink";
import { markOutboxSentAction } from "@/app/surveys/actions";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getOutboxMessages } from "@/lib/server/surveys";

export const dynamic = "force-dynamic";

export default async function OutboxPage() {
  try {
    const messages = await getOutboxMessages();
    return (
      <div>
        <PageHeader title="Outbox" subtitle="Queued survey invitations and manager score links." />
        <div className="space-y-3">
          {messages.map((message) => (
            <article key={message.id} className="rounded-lg border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-medium">{message.subject}</p><p className="text-sm text-slate-600">{message.to_email}</p><p className="mt-1 text-sm">{message.body}</p></div>
                <span className="text-xs uppercase text-slate-500">{message.status}</span>
              </div>
              {message.link_path && <div className="mt-3 flex flex-wrap items-center gap-2"><a className="break-all text-sm text-brand-700 underline" href={message.link_path}>{message.link_path}</a><CopyLink value={message.link_path} /></div>}
              {message.status === "queued" && <form action={markOutboxSentAction} className="mt-3"><input type="hidden" name="messageId" value={message.id} /><button className="rounded border px-3 py-1 text-xs">Mark sent</button></form>}
            </article>
          ))}
          {!messages.length && <p className="rounded-lg border bg-white p-5 text-sm text-slate-500">No messages are queued.</p>}
        </div>
      </div>
    );
  } catch (error) {
    if (isDatabaseRequiredError(error)) return <DatabaseNotice />;
    throw error;
  }
}
