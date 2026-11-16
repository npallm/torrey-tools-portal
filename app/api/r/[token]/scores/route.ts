import { getShareScores } from "@/lib/server/surveys";
import { shareScoresPayload } from "@/lib/surveys/publishing";
import { requireUser } from "@/lib/auth/session";
import { isIntendedWorker } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await requireUser(`/r/${token}`);
  const share = await getShareScores(token);
  if (!share) return Response.json({ error: "Share link not found" }, { status: 404 });
  if (!isIntendedWorker(user, share.managerId)) {
    return Response.json({ error: "This link belongs to another person." }, { status: 403 });
  }
  return Response.json(shareScoresPayload(share), { headers: { "Cache-Control": "no-store" } });
}
