import { PageHeader } from "@/components/PageHeader";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { ManagerShareResults } from "@/components/surveys/ManagerShareResults";
import { isDatabaseRequiredError } from "@/lib/server/common";
import { getShareScores } from "@/lib/server/surveys";

export const dynamic = "force-dynamic";

export default async function ManagerSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const share = await getShareScores(token);
    if (!share) return <p className="rounded bg-white p-5">This manager results link is not valid.</p>;
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
