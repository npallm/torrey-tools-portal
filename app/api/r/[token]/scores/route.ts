import { getShareScores } from "@/lib/server/surveys";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await getShareScores(token);
  if (!share) return Response.json({ error: "Share link not found" }, { status: 404 });
  return Response.json(share, { headers: { "Cache-Control": "no-store" } });
}
