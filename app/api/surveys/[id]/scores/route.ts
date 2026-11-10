import { getSurvey } from "@/lib/server/surveys";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const survey = await getSurvey(id);
  if (!survey) return Response.json({ error: "Survey not found" }, { status: 404 });
  return Response.json(survey, { headers: { "Cache-Control": "no-store" } });
}
