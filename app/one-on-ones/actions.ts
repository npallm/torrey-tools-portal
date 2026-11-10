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

export async function createSeriesAction(formData: FormData) {
  const id = await createOneOnOneSeries({
    managerId: String(formData.get("managerId") ?? ""),
    reportId: String(formData.get("reportId") ?? ""),
    cadenceDays: Number(formData.get("cadenceDays") ?? 14),
    startedOn: String(formData.get("startedOn") ?? ""),
  });
  revalidatePath("/one-on-ones");
  redirect(`/one-on-ones/${id}`);
}

export async function addAgendaAction(formData: FormData) {
  const seriesId = String(formData.get("seriesId") ?? "");
  await addOneOnOneAgendaItem({ seriesId, addedBy: String(formData.get("addedBy") ?? "manager") as "manager"|"report", body: String(formData.get("body") ?? "") });
  revalidatePath(`/one-on-ones/${seriesId}`);
}

export async function discussAgendaAction(formData: FormData) {
  const seriesId = String(formData.get("seriesId") ?? "");
  await setAgendaDiscussed({ seriesId, itemId: String(formData.get("itemId") ?? ""), discussed: formData.get("discussed") === "true" });
  revalidatePath(`/one-on-ones/${seriesId}`);
}

export async function addActionItemAction(formData: FormData) {
  const seriesId = String(formData.get("seriesId") ?? "");
  await addOneOnOneAction({ seriesId, owner: String(formData.get("owner") ?? "manager") as "manager"|"report", body: String(formData.get("body") ?? ""), dueDate: String(formData.get("dueDate") ?? "") || null });
  revalidatePath(`/one-on-ones/${seriesId}`);
}

export async function completeActionItemAction(formData: FormData) {
  const seriesId = String(formData.get("seriesId") ?? "");
  await setOneOnOneActionCompleted({ seriesId, itemId: String(formData.get("itemId") ?? ""), completed: formData.get("completed") === "true" });
  revalidatePath(`/one-on-ones/${seriesId}`);
}

export async function logMeetingAction(formData: FormData) {
  const seriesId = String(formData.get("seriesId") ?? "");
  await logOneOnOneMeeting({
    seriesId,
    meetingDate: String(formData.get("meetingDate") ?? ""),
    sharedNotes: String(formData.get("sharedNotes") ?? ""),
    managerPrivateNotes: String(formData.get("managerPrivateNotes") ?? ""),
    reportPrivateNotes: String(formData.get("reportPrivateNotes") ?? ""),
    reportPulse: String(formData.get("reportPulse") ?? "") === "" ? null : Number(formData.get("reportPulse")),
  });
  revalidatePath(`/one-on-ones/${seriesId}`);
}
