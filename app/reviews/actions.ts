"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  releaseReviewCycle,
  saveCalibration,
  saveReviewAssignment,
  saveReviewTemplate,
  setReviewCycleStatus,
  updateGoalProgress,
  type RatingPoint,
  type ReviewTemplateItem,
} from "@/lib/server/reviews";
import { requireRole, requireUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/permissions";

export async function saveTemplateAction(formData: FormData) {
  await requireRole("client_admin", "consultant");
  const id = String(formData.get("id") ?? "") || undefined;
  const items = JSON.parse(String(formData.get("items") ?? "[]")) as (Omit<ReviewTemplateItem, "id"> & { id?: string })[];
  const points = JSON.parse(String(formData.get("points") ?? "[]")) as RatingPoint[];
  const templateId = await saveReviewTemplate({
    id,
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    scaleId: String(formData.get("scaleId") ?? "") || undefined,
    scaleName: String(formData.get("scaleName") ?? "Five point scale"),
    ratingPoints: points,
    includeGoals: formData.get("includeGoals") === "on",
    goalsWeight: Number(formData.get("goalsWeight") ?? 0),
    items,
  });
  revalidatePath("/reviews/templates");
  redirect(`/reviews/templates?saved=${templateId}`);
}

export async function reviewAssignmentAction(formData: FormData) {
  const user = await requireUser();
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const items = JSON.parse(String(formData.get("items") ?? "[]")) as { itemId: string; rating: number | null; comment: string }[];
  await saveReviewAssignment({
    assignmentId,
    overallComment: String(formData.get("overallComment") ?? ""),
    items,
    submit: formData.get("mode") === "submit",
    viewerWorkerId: user.workerId,
    allowAdmin: isAdmin(user),
  });
  revalidatePath(`/reviews/assignments/${assignmentId}`);
  redirect(`/reviews/assignments/${assignmentId}?saved=1`);
}

export async function calibrationAction(formData: FormData) {
  await requireRole("client_admin", "consultant");
  await saveCalibration({
    cycleId: String(formData.get("cycleId") ?? ""),
    workerId: String(formData.get("workerId") ?? ""),
    proposed: String(formData.get("proposed") ?? "") === "" ? null : Number(formData.get("proposed")),
    calibrated: String(formData.get("calibrated") ?? "") === "" ? null : Number(formData.get("calibrated")),
    notes: String(formData.get("notes") ?? ""),
  });
  revalidatePath(`/reviews/${String(formData.get("cycleId") ?? "")}`);
}

export async function reviewCycleStatusAction(formData: FormData) {
  await requireRole("client_admin", "consultant");
  const cycleId = String(formData.get("cycleId") ?? "");
  await setReviewCycleStatus(cycleId, String(formData.get("status") ?? "planning"));
  revalidatePath(`/reviews/${cycleId}`);
}

export async function releaseReviewCycleAction(formData: FormData) {
  await requireRole("client_admin", "consultant");
  const cycleId = String(formData.get("cycleId") ?? "");
  await releaseReviewCycle(cycleId);
  revalidatePath(`/reviews/${cycleId}`);
}

export async function goalProgressAction(formData: FormData) {
  await requireRole("client_admin", "consultant");
  const goalId = String(formData.get("goalId") ?? "");
  await updateGoalProgress(goalId, Number(formData.get("progress") ?? 0), String(formData.get("status") ?? "on_track"));
  revalidatePath("/reviews");
}
