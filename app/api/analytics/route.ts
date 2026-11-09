import { dataCoverage, periodFor, resolveAnalyticsSelection } from "@/lib/metrics/views";
import { getWorkforceDataset } from "@/lib/workforce";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const selection = resolveAnalyticsSelection(
    searchParams.get("d") ?? undefined,
    searchParams.get("v") ?? undefined,
    searchParams.get("p") ?? undefined,
  );
  const { dataset } = await getWorkforceDataset();
  const result = selection.view.build(
    dataset,
    periodFor(selection.periodKind, dataset.organization.asOfDate),
  );

  return Response.json({ result, coverage: dataCoverage(dataset) });
}
