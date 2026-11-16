import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { ReviewAssignmentForm } from "@/components/reviews/ReviewAssignmentForm";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getReviewAssignment } from "@/lib/server/reviews";
import { goalStatusLabel } from "@/lib/talent/reviews";

export const dynamic = "force-dynamic";

export default async function ReviewAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const assignment = await getReviewAssignment(id);
    if (!assignment) return <p>Review assignment not found.</p>;
    return (
      <div>
        <PageHeader title={`${assignment.subjectName} · ${assignment.role} review`} subtitle={`${assignment.cycleName} · ${assignment.templateName}`} />
        {assignment.status === "submitted" && (
          <p className="mb-4 rounded border bg-white p-3 text-sm">
            Weighted score: <strong>{assignment.scores.current?.toFixed(2) ?? "—"}</strong>
          </p>
        )}
        {assignment.scores.selfSubmitted && (
          <p className="mb-4 rounded border bg-white p-3 text-sm">
            Self–manager gap: {assignment.scores.selfManagerGap?.toFixed(2) ?? "—"}
          </p>
        )}
        {assignment.status === "submitted" ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Submitted feedback</h2>
            {assignment.items.map((item) => {
              const rating = assignment.ratingPoints.find((point) => point.value === item.rating);
              return (
                <article key={item.id} className="rounded border bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="text-sm text-slate-500">
                        {item.itemType === "competency" ? "Competency" : "Prompt"} · Weight {item.weight}
                      </p>
                    </div>
                    <p className="text-sm">
                      {item.rated
                        ? `Rating: ${rating ? `${rating.value} · ${rating.label}` : "Not rated"}`
                        : "Comment only"}
                    </p>
                  </div>
                  {item.description && <p className="mt-2 text-sm text-slate-600">{item.description}</p>}
                  <p className="mt-3 whitespace-pre-wrap text-sm">
                    <span className="font-medium">Comment: </span>
                    {item.comment?.trim() || "No comment provided."}
                  </p>
                </article>
              );
            })}
            <section className="rounded border bg-white p-4">
              <h3 className="font-semibold">Goals and progress</h3>
              {assignment.goals.map((goal) => (
                <p key={goal.id} className="mt-2 text-sm">
                  {goal.title} · {goal.progressPct}% · {goalStatusLabel(goal.status)}
                </p>
              ))}
              {!assignment.goals.length && <p className="mt-2 text-sm text-slate-500">No goals for this cycle.</p>}
            </section>
            <section className="rounded border bg-white p-4">
              <h3 className="font-semibold">Overall comment</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm">
                {assignment.overallComment?.trim() || "No overall comment provided."}
              </p>
            </section>
          </div>
        ) : (
          <ReviewAssignmentForm assignmentId={id} items={assignment.items} overallComment={assignment.overallComment} ratingPoints={assignment.ratingPoints} goals={assignment.goals} />
        )}
      </div>
    );
  } catch (error) {
    if (isDatabaseRequiredError(error)) return <DatabaseNotice />;
    throw error;
  }
}
