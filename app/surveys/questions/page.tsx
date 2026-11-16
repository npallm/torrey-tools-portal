import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { QuestionBankEditor } from "@/components/surveys/QuestionBankEditor";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getQuestionBank } from "@/lib/server/surveys";
import { requireRole } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SurveyQuestionsPage() {
  await requireRole("client_admin", "consultant");
  try {
    const items = await getQuestionBank();
    return <div><PageHeader title="Manager question bank" subtitle="Maintain simple 1–5 statements by category." /><QuestionBankEditor initialItems={items} /></div>;
  } catch (error) {
    if (isDatabaseRequiredError(error)) return <DatabaseNotice />;
    throw error;
  }
}
