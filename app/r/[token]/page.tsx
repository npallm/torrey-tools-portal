import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { ManagerShareResults } from "@/components/surveys/ManagerShareResults";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getShareScores } from "@/lib/server/surveys";
import { requireUser } from "@/lib/auth/session";
import { isIntendedWorker } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

export default async function ManagerSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await requireUser(`/r/${token}`);
  try {
    const share = await getShareScores(token);
    if (!share) return <p className="rounded bg-white p-5">This manager results link is not valid.</p>;
    if (!isIntendedWorker(user, share.managerId)) return <p className="rounded bg-white p-5">This link belongs to another person.</p>;
    return (
      <div>
        <PageHeader title={share.title} subtitle={`Results for ${share.managerName}`} />
        <ManagerShareResults key={`${token}:${share.status}`} token={token} initialData={share} />
      </div>
    );
  } catch (error) {
    if (isDatabaseRequiredError(error)) return <DatabaseNotice />;
    throw error;
  }
}
