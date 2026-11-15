"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  archiveApprovalTemplate,
  reassignChangeRequestStep,
  saveApprovalTemplate,
  submitChangeRequest,
  withdrawChangeRequest,
  type ChangeType,
} from "@/lib/server/changeRequests";
import type { ApproverRef } from "@/lib/approvals/workflow";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "The change request could not be saved.";
}

function parseApprovers(raw: string): ApproverRef[] {
  try {
    return JSON.parse(raw) as ApproverRef[];
  } catch {
    throw new Error("Choose an approval chain.");
  }
}

export async function submitChangeRequestAction(formData: FormData) {
  let requestId: string;
  try {
    requestId = await submitChangeRequest({
      subjectWorkerId: String(formData.get("subjectWorkerId") ?? ""),
      submittedByWorkerId: String(formData.get("submittedByWorkerId") ?? ""),
      changeType: String(formData.get("changeType") ?? "") as ChangeType,
      currentValue: String(formData.get("currentValue") ?? "") || null,
      requestedValue: String(formData.get("requestedValue") ?? ""),
      effectiveDate: String(formData.get("effectiveDate") ?? ""),
      reason: String(formData.get("reason") ?? "") || null,
      approvers: parseApprovers(String(formData.get("approvers") ?? "[]")),
      approvalTemplateId: String(formData.get("approvalTemplateId") ?? "") || null,
    });
  } catch (error) {
    redirect(`/requests?error=${encodeURIComponent(messageFrom(error))}`);
  }
  revalidatePath("/requests");
  revalidatePath("/outbox");
  redirect(`/requests/${requestId}`);
}

export async function withdrawChangeRequestAction(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "");
  try {
    await withdrawChangeRequest(requestId, String(formData.get("submitterWorkerId") ?? ""));
  } catch (error) {
    redirect(`/requests/${requestId}?error=${encodeURIComponent(messageFrom(error))}`);
  }
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  redirect(`/requests/${requestId}`);
}

export async function reassignChangeRequestAction(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "");
  const [kind, approverId] = String(formData.get("approverRef") ?? "").split(":", 2);
  const approver: ApproverRef = kind === "position"
    ? { kind: "position", positionId: approverId ?? "" }
    : { kind: "worker", workerId: kind === "worker" ? approverId ?? "" : "" };
  try {
    await reassignChangeRequestStep(requestId, approver);
  } catch (error) {
    redirect(`/requests/${requestId}?error=${encodeURIComponent(messageFrom(error))}`);
  }
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/outbox");
  redirect(`/requests/${requestId}`);
}

export async function saveApprovalTemplateAction(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const changeType = String(formData.get("changeType") ?? "") || null;
  let steps: ApproverRef[];
  try {
    steps = parseApprovers(String(formData.get("steps") ?? "[]"));
  } catch (error) {
    redirect(`/approvals/templates?error=${encodeURIComponent(messageFrom(error))}`);
  }
  let id: string;
  try {
    id = await saveApprovalTemplate({
      id: String(formData.get("templateId") ?? "") || undefined,
      name,
      changeType: changeType as ChangeType | null,
      isDefault: formData.get("isDefault") === "on",
      steps,
    });
  } catch (error) {
    redirect(`/approvals/templates?error=${encodeURIComponent(messageFrom(error))}`);
  }
  revalidatePath("/approvals/templates");
  revalidatePath("/requests");
  redirect(`/approvals/templates?saved=${encodeURIComponent(id)}`);
}

export async function archiveApprovalTemplateAction(formData: FormData) {
  const id = String(formData.get("templateId") ?? "");
  try {
    await archiveApprovalTemplate(id);
  } catch (error) {
    redirect(`/approvals/templates?error=${encodeURIComponent(messageFrom(error))}`);
  }
  revalidatePath("/approvals/templates");
  revalidatePath("/requests");
  redirect("/approvals/templates?archived=1");
}
