import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { requireUser } from "@/lib/auth/session";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getMyReviewAssignments } from "@/lib/server/reviews";

export const dynamic = "force-dynamic";

export default async function MyReviewsPage() {
  const user = await requireUser("/reviews/mine");
  if (!user.workerId) return <p className="rounded border bg-white p-5">This account is not linked to a worker.</p>;
  try {
    const assignments = await getMyReviewAssignments(user.workerId);
    return (
      <div className="space-y-5">
        <PageHeader title="My reviews" subtitle="Review assignments assigned to you." />
        {assignments.length ? (
          <div className="overflow-x-auto rounded border bg-white">
            <table className="min-w-full divide-y text-sm">
              <thead className="bg-slate-50 text-left"><tr><th className="p-3">Cycle</th><th className="p-3">Person</th><th className="p-3">Your role</th><th className="p-3">Due</th><th className="p-3">Status</th></tr></thead>
              <tbody className="divide-y">{assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td className="p-3"><Link href={`/reviews/assignments/${assignment.id}`} className="text-brand-700 underline">{assignment.cycleName}</Link></td>
                  <td className="p-3">{assignment.subjectName}</td>
                  <td className="p-3 capitalize">{assignment.role}</td>
                  <td className="p-3">{assignment.dueDate ?? "—"}</td>
                  <td className="p-3 capitalize">{assignment.status}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="rounded border bg-white p-4 text-sm text-slate-500">No review assignments are assigned to you.</p>}
      </div>
    );
  } catch (error) {
    if (isDatabaseRequiredError(error)) return <DatabaseNotice />;
    throw error;
  }
}
