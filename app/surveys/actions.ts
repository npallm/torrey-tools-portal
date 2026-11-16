"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  closeManagerSurvey,
  createManagerSurvey,
  launchManagerSurvey,
  markOutboxSent,
  saveQuestionBank,
  submitManagerSurveyResponse,
  type QuestionBankItem,
} from "@/lib/server/surveys";
import { requireRole, requireUser } from "@/lib/auth/session";

export async function createSurveyAction(formData: FormData) {
  await requireRole("client_admin", "consultant");
  const id = await createManagerSurvey({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    closesAt: String(formData.get("closesAt") ?? "") || null,
    includeContingentWorkers: formData.get("includeContingentWorkers") === "on",
  });
  revalidatePath("/surveys");
  redirect(`/surveys/${id}`);
}

export async function launchSurveyAction(formData: FormData) {
  await requireRole("client_admin", "consultant");
  const id = String(formData.get("surveyId") ?? "");
  await launchManagerSurvey(id);
  revalidatePath(`/surveys/${id}`);
  revalidatePath("/outbox");
  redirect(`/surveys/${id}`);
}

export async function closeSurveyAction(formData: FormData) {
  await requireRole("client_admin", "consultant");
  const id = String(formData.get("surveyId") ?? "");
  await closeManagerSurvey(id);
  revalidatePath(`/surveys/${id}`);
  redirect(`/surveys/${id}`);
}

export async function submitSurveyAction(formData: FormData) {
  const user = await requireUser();
  const token = String(formData.get("token") ?? "");
  const answers = [...formData.entries()]
    .filter(([key]) => key.startsWith("answer:"))
    .map(([key, value]) => ({ questionId: key.slice("answer:".length), value: Number(value) }));
  try {
    await submitManagerSurveyResponse({ token, answers, viewerWorkerId: user.workerId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Your response could not be submitted.";
    redirect(`/s/${encodeURIComponent(token)}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/surveys");
  redirect(`/s/${encodeURIComponent(token)}?submitted=1`);
}

export async function saveQuestionBankAction(formData: FormData) {
  await requireRole("client_admin", "consultant");
  const raw = String(formData.get("items") ?? "[]");
  const items = JSON.parse(raw) as QuestionBankItem[];
  await saveQuestionBank(items);
  revalidatePath("/surveys/questions");
  redirect("/surveys/questions?saved=1");
}

export async function markOutboxSentAction(formData: FormData) {
  await requireRole("client_admin", "consultant");
  await markOutboxSent(String(formData.get("messageId") ?? ""));
  revalidatePath("/outbox");
}
