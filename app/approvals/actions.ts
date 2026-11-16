"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { decideChangeRequest } from "@/lib/server/changeRequests";
import { requireUser } from "@/lib/auth/session";
import { assertIntendedWorker } from "@/lib/auth/ownership";
import { getApprovalByToken } from "@/lib/server/changeRequests";

export async function decideApprovalAction(formData: FormData) {
  const user = await requireUser();
  const token = String(formData.get("token") ?? "");
  const decision = String(formData.get("decision") ?? "");
  try {
    if (decision !== "approve" && decision !== "reject") throw new Error("Choose approve or reject.");
    const approval = await getApprovalByToken(token);
    if (!approval) throw new Error("This approval link is not valid.");
    assertIntendedWorker(user, approval.approverWorkerId);
    await decideChangeRequest(token, decision, String(formData.get("comment") ?? ""));
  } catch (error) {
    const message = error instanceof Error ? error.message : "This decision could not be saved.";
    redirect(`/approvals/${encodeURIComponent(token)}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/requests");
  revalidatePath("/outbox");
  revalidatePath(`/approvals/${token}`);
  redirect(`/approvals/${encodeURIComponent(token)}?decided=${encodeURIComponent(decision)}`);
}
