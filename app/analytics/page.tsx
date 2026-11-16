import { AnalyticsExplorer } from "@/components/analytics/AnalyticsExplorer";
import { PageHeader } from "@/components/PageHeader";
import { dataCoverage, periodFor, resolveAnalyticsSelection, DASHBOARDS } from "@/lib/metrics/views";
import type { ChartFormat, DataRequirement, ViewResult } from "@/lib/metrics/views";
import { getWorkforceDataset } from "@/lib/workforce";
import { requireRole } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  d?: string;
  v?: string;
  f?: string;
  p?: string;
}>;

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("client_admin", "consultant");
  const query = await searchParams;
  const selection = resolveAnalyticsSelection(query.d, query.v, query.p);
  const format = selection.view.formats.includes(query.f as ChartFormat)
    ? (query.f as ChartFormat)
    : selection.view.formats[0];
  const { dataset, source } = await getWorkforceDataset();
  const initialResult: ViewResult = selection.view.build(
    dataset,
    periodFor(selection.periodKind, dataset.organization.asOfDate),
  );
  const dashboards = DASHBOARDS.map((dashboard) => ({
    id: dashboard.id,
    title: dashboard.title,
    description: dashboard.description,
    views: dashboard.views.map((view) => ({
      id: view.id,
      title: view.title,
      description: view.description,
      formats: view.formats,
      requires: view.requires ?? ([] as DataRequirement[]),
      metricId: view.metricId,
    })),
  }));

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Explore workforce metrics one chart at a time."
      />
      <AnalyticsExplorer
        dashboards={dashboards}
        coverage={dataCoverage(dataset)}
        source={source}
        initialSelection={{
          dashboardId: selection.dashboard.id,
          viewId: selection.view.id,
          format,
          period: selection.periodKind,
        }}
        initialResult={initialResult}
      />
    </div>
  );
}
