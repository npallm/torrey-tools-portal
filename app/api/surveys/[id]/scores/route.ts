import { getSurvey } from "@/lib/server/surveys";
import { surveyScoresPayload } from "@/lib/surveys/publishing";
import { requireRole } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("client_admin", "consultant");
  const { id } = await params;
  const survey = await getSurvey(id);
  if (!survey) return Response.json({ error: "Survey not found" }, { status: 404 });
  return Response.json(surveyScoresPayload(survey), { headers: { "Cache-Control": "no-store" } });
}
