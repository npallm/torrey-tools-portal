import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { ReviewAssignmentForm } from "@/components/reviews/ReviewAssignmentForm";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getReviewAssignment } from "@/lib/server/reviews";

export const dynamic = "force-dynamic";

export default async function ReviewAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const assignment = await getReviewAssignment(id);
    if (!assignment) return <p>Review assignment not found.</p>;
    return <div><PageHeader title={`${assignment.subjectName} · ${assignment.role} review`} subtitle={`${assignment.cycleName} · ${assignment.templateName}`} />
      <p className="mb-4 rounded border bg-white p-3 text-sm">Live weighted score (saved answers): <strong>{assignment.scores.current?.toFixed(2) ?? "—"}</strong></p>
      {assignment.scores.selfSubmitted && <p className="mb-4 rounded border bg-white p-3 text-sm">Self–manager gap: {assignment.scores.selfManagerGap?.toFixed(2) ?? "—"}</p>}
      {assignment.status === "submitted" ? <p className="rounded border bg-white p-4">This review has been submitted.</p> : <ReviewAssignmentForm assignmentId={id} items={assignment.items} overallComment={assignment.overallComment} ratingPoints={assignment.ratingPoints} goals={assignment.goals} />}
    </div>;
  } catch (error) {
    if (isDatabaseRequiredError(error)) return <DatabaseNotice />;
    throw error;
  }
}
