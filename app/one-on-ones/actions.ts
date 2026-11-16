"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addOneOnOneAction,
  addOneOnOneAgendaItem,
  createOneOnOneSeries,
  logOneOnOneMeeting,
  setAgendaDiscussed,
  setOneOnOneActionCompleted,
} from "@/lib/server/oneOnOnes";
import { requireRole, requireUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/permissions";

function participantWorkerId(workerId: string | null) {
  if (!workerId) throw new Error("Only a linked 1:1 participant can make this change.");
  return workerId;
}

export async function createSeriesAction(formData: FormData) {
  const user = await requireRole("client_admin", "consultant", "manager");
  if (!isAdmin(user)) participantWorkerId(user.workerId);
  const id = await createOneOnOneSeries({
    managerId: String(formData.get("managerId") ?? ""),
    reportId: String(formData.get("reportId") ?? ""),
    cadenceDays: Number(formData.get("cadenceDays") ?? 14),
    startedOn: String(formData.get("startedOn") ?? ""),
    viewerWorkerId: user.workerId,
    allowAdmin: isAdmin(user),
  });
  revalidatePath("/one-on-ones");
  redirect(`/one-on-ones/${id}`);
}

export async function addAgendaAction(formData: FormData) {
  const user = await requireUser();
  const viewerWorkerId = participantWorkerId(user.workerId);
  const seriesId = String(formData.get("seriesId") ?? "");
  await addOneOnOneAgendaItem({ seriesId, viewerWorkerId, body: String(formData.get("body") ?? "") });
  revalidatePath(`/one-on-ones/${seriesId}`);
}

export async function discussAgendaAction(formData: FormData) {
  const user = await requireUser();
  const viewerWorkerId = participantWorkerId(user.workerId);
  const seriesId = String(formData.get("seriesId") ?? "");
  await setAgendaDiscussed({ seriesId, itemId: String(formData.get("itemId") ?? ""), discussed: formData.get("discussed") === "true", viewerWorkerId });
  revalidatePath(`/one-on-ones/${seriesId}`);
}

export async function addActionItemAction(formData: FormData) {
  const user = await requireUser();
  const viewerWorkerId = participantWorkerId(user.workerId);
  const seriesId = String(formData.get("seriesId") ?? "");
  await addOneOnOneAction({ seriesId, viewerWorkerId, body: String(formData.get("body") ?? ""), dueDate: String(formData.get("dueDate") ?? "") || null });
  revalidatePath(`/one-on-ones/${seriesId}`);
}

export async function completeActionItemAction(formData: FormData) {
  const user = await requireUser();
  const viewerWorkerId = participantWorkerId(user.workerId);
  const seriesId = String(formData.get("seriesId") ?? "");
  await setOneOnOneActionCompleted({ seriesId, itemId: String(formData.get("itemId") ?? ""), completed: formData.get("completed") === "true", viewerWorkerId });
  revalidatePath(`/one-on-ones/${seriesId}`);
}

export async function logMeetingAction(formData: FormData) {
  const user = await requireUser();
  const viewerWorkerId = participantWorkerId(user.workerId);
  const seriesId = String(formData.get("seriesId") ?? "");
  await logOneOnOneMeeting({
    seriesId,
    meetingDate: String(formData.get("meetingDate") ?? ""),
    sharedNotes: String(formData.get("sharedNotes") ?? ""),
    privateNote: String(formData.get("privateNote") ?? ""),
    reportPulse: String(formData.get("reportPulse") ?? "") === "" ? null : Number(formData.get("reportPulse")),
    viewerWorkerId,
  });
  revalidatePath(`/one-on-ones/${seriesId}`);
}
