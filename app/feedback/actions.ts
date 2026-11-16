"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, requireUser } from "@/lib/auth/session";
import { createFeedbackRequest, closeFeedbackRequest, submitFeedbackResponse } from "@/lib/server/feedback";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The feedback action could not be completed.";
}

export async function createFeedbackRequestAction(formData: FormData) {
  const user = await requireRole("client_admin", "consultant", "manager");
  if (!user.workerId) redirect("/feedback?error=This+account+is+not+linked+to+a+worker");
  let id: string;
  try {
    id = await createFeedbackRequest({
      organizationId: user.organizationId,
      requesterWorkerId: user.workerId,
      subjectWorkerId: String(formData.get("subjectWorkerId") ?? ""),
      recipientWorkerIds: formData.getAll("peerWorkerId").map(String),
      message: String(formData.get("message") ?? ""),
      dueDate: String(formData.get("dueDate") ?? ""),
    });
  } catch (error) {
    redirect(`/feedback?error=${encodeURIComponent(errorMessage(error))}`);
  }
  revalidatePath("/feedback");
  redirect(`/feedback/${id}`);
}

export async function submitFeedbackResponseAction(formData: FormData) {
  const user = await requireUser();
  const token = String(formData.get("token") ?? "");
  try {
    if (!user.workerId) throw new Error("This link belongs to another person.");
    await submitFeedbackResponse({
      token,
      viewerWorkerId: user.workerId,
      rating: Number(formData.get("rating")),
      keepDoing: String(formData.get("keepDoing") ?? ""),
      doDifferently: String(formData.get("doDifferently") ?? ""),
      anythingElse: String(formData.get("anythingElse") ?? ""),
    });
  } catch (error) {
    redirect(`/f/${encodeURIComponent(token)}?error=${encodeURIComponent(errorMessage(error))}`);
  }
  revalidatePath(`/f/${token}`);
  redirect(`/f/${token}?submitted=1`);
}

export async function closeFeedbackRequestAction(formData: FormData) {
  const user = await requireRole("client_admin", "consultant", "manager");
  const id = String(formData.get("requestId") ?? "");
  try {
    await closeFeedbackRequest(id, user);
  } catch (error) {
    redirect(`/feedback/${encodeURIComponent(id)}?error=${encodeURIComponent(errorMessage(error))}`);
  }
  revalidatePath("/feedback");
  revalidatePath(`/feedback/${id}`);
  redirect(`/feedback/${id}?closed=1`);
}
