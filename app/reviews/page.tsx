import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getReviewCycles } from "@/lib/server/reviews";
import { requireRole } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  await requireRole("client_admin", "consultant");
  try {
    const cycles = await getReviewCycles();
    return (
      <div>
        <PageHeader title="Performance reviews" subtitle="Cycles, reviewer progress and calibrated outcomes." />
        <p className="mb-4"><Link className="rounded border bg-white px-4 py-2 text-sm" href="/reviews/templates">Review templates</Link></p>
        <div className="space-y-4">
          {cycles.map((cycle) => <article key={cycle.id} className="rounded-lg border bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold"><Link href={`/reviews/${cycle.id}`} className="text-brand-700 hover:underline">{cycle.name}</Link></h2><p className="text-sm text-slate-500">{cycle.periodStart} → {cycle.periodEnd} · {cycle.templateName}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs capitalize">{cycle.status.replaceAll("_"," ")}</span></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">{(["self","manager","peer"] as const).map((role) => <div key={role} className="rounded bg-slate-50 p-3 text-sm capitalize">{role}: {cycle.roles[role].submitted} / {cycle.roles[role].total} submitted</div>)}</div>
          </article>)}
          {!cycles.length && <p className="rounded border bg-white p-5 text-sm text-slate-500">No review cycles have been created.</p>}
        </div>
      </div>
    );
  } catch (error) {
    if (isDatabaseRequiredError(error)) return <DatabaseNotice />;
    throw error;
  }
}
