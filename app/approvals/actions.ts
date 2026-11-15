"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { decideChangeRequest } from "@/lib/server/changeRequests";

export async function decideApprovalAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const decision = String(formData.get("decision") ?? "");
  try {
    if (decision !== "approve" && decision !== "reject") throw new Error("Choose approve or reject.");
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
