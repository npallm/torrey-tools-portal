"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Chart, formatMetricValue } from "@/components/analytics/Chart";
import { VizRequestForm } from "@/components/analytics/VizRequestForm";
import { METRICS, SOURCES } from "@/lib/metrics/catalog";
import { PERIOD_LABELS } from "@/lib/metrics/views";
import type {
  ChartFormat,
  DataRequirement,
  PeriodKind,
  Unit,
  ViewResult,
} from "@/lib/metrics/views";

type ViewMetadata = {
  id: string;
  title: string;
  description: string;
  formats: ChartFormat[];
  requires: DataRequirement[];
  metricId: string;
};
type DashboardMetadata = {
  id: string;
  title: string;
  description: string;
  views: ViewMetadata[];
};
type Selection = {
  dashboardId: string;
  viewId: string;
  format: ChartFormat;
  period: PeriodKind;
};
type Props = {
  dashboards: DashboardMetadata[];
  coverage: Record<DataRequirement, boolean>;
  source: "postgres" | "seed";
  initialSelection: Selection;
  initialResult: ViewResult;
};

const FORMAT_LABELS: Record<ChartFormat, string> = {
  column: "Column",
  bar: "Bar",
  line: "Line",
  pie: "Pie",
  table: "Table",
};

const REQUIREMENT_GUIDANCE: Record<DataRequirement, string> = {
  payRanges: "Add pay ranges to job profiles.",
  payroll: "Connect payroll through Finch on Integrations.",
  absences: "Record absences.",
  positions: "Add budgeted positions.",
  reviews: "Add performance reviews.",
  jobEvents: "Record promotions or lateral transfers.",
  revenue: "Add annual revenue in organization settings.",
  managers: "Assign managers to employee profiles.",
  pto: "Add PTO requests.",
};

function selectionKey(selection: Pick<Selection, "dashboardId" | "viewId" | "period">) {
  return `${selection.dashboardId}/${selection.viewId}/${selection.period}`;
}

export function AnalyticsExplorer({
  dashboards,
  coverage: initialCoverage,
  source,
  initialSelection,
  initialResult,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dashboardId, setDashboardId] = useState(initialSelection.dashboardId);
  const [viewId, setViewId] = useState(initialSelection.viewId);
  const [format, setFormat] = useState(initialSelection.format);
  const [period, setPeriod] = useState<PeriodKind>(initialSelection.period);
  const [result, setResult] = useState(initialResult);
  const [coverage, setCoverage] = useState(initialCoverage);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const firstKey = useRef(selectionKey(initialSelection));
  const activeDashboard = dashboards.find((item) => item.id === dashboardId) ?? dashboards[0];
  const activeView = activeDashboard.views.find((item) => item.id === viewId) ?? activeDashboard.views[0];
  const missingRequirements = useMemo(
    () => activeView.requires.filter((requirement) => !coverage[requirement]),
    [activeView, coverage],
  );
  const metric = METRICS[activeView.metricId];

  function replaceUrl(next: Selection) {
    const params = new URLSearchParams();
    params.set("d", next.dashboardId);
    params.set("v", next.viewId);
    params.set("f", next.format);
    params.set("p", next.period);
    router.replace(`/analytics?${params.toString()}`, { scroll: false });
  }

  function chooseView(nextDashboardId: string, nextView: ViewMetadata) {
    const nextFormat = nextView.formats.includes(format) ? format : nextView.formats[0];
    const next = {
      dashboardId: nextDashboardId,
      viewId: nextView.id,
      format: nextFormat,
      period,
    };
    setDashboardId(next.dashboardId);
    setViewId(next.viewId);
    setFormat(next.format);
    replaceUrl(next);
  }

  function choosePeriod(nextPeriod: PeriodKind) {
    const next = { dashboardId, viewId, format, period: nextPeriod };
    setPeriod(nextPeriod);
    replaceUrl(next);
  }

  function chooseFormat(nextFormat: ChartFormat) {
    const next = { dashboardId, viewId, format: nextFormat, period };
    setFormat(nextFormat);
    replaceUrl(next);
  }

  useEffect(() => {
    const queryDashboard = searchParams.get("d");
    const queryView = searchParams.get("v");
    const queryFormat = searchParams.get("f");
    const queryPeriod = searchParams.get("p");
    const dashboard = dashboards.find((item) => item.id === queryDashboard) ?? dashboards[0];
    const view = dashboard.views.find((item) => item.id === queryView) ?? dashboard.views[0];
    const next: Selection = {
      dashboardId: dashboard.id,
      viewId: view.id,
      format: view.formats.includes(queryFormat as ChartFormat)
        ? (queryFormat as ChartFormat)
        : view.formats[0],
      period:
        queryPeriod === "ytd" || queryPeriod === "prior-year" || queryPeriod === "ltm"
          ? queryPeriod
          : "ltm",
    };
    setDashboardId(next.dashboardId);
    setViewId(next.viewId);
    setFormat(next.format);
    setPeriod(next.period);
    if (
      queryDashboard !== next.dashboardId ||
      queryView !== next.viewId ||
      queryFormat !== next.format ||
      queryPeriod !== next.period
    ) {
      replaceUrl(next);
    }
  }, [dashboards, searchParams]);

  useEffect(() => {
    const key = selectionKey({ dashboardId, viewId, period });
    if (key === firstKey.current) {
      firstKey.current = "";
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ d: dashboardId, v: viewId, p: period });
    setLoading(true);
    setRequestError("");
    fetch(`/api/analytics?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Analytics could not be loaded.");
        return (await response.json()) as {
          result: ViewResult;
          coverage: Record<DataRequirement, boolean>;
        };
      })
      .then((payload) => {
        setResult(payload.result);
        setCoverage(payload.coverage);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRequestError(error instanceof Error ? error.message : "Analytics could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [dashboardId, period, viewId]);

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Dashboards</p>
        <nav className="space-y-5" aria-label="Analytics dashboards">
          {dashboards.map((dashboard) => (
            <section key={dashboard.id}>
              <h2 className="mb-1 text-sm font-semibold text-slate-700">{dashboard.title}</h2>
              <ul className="space-y-1">
                {dashboard.views.map((view) => {
                  const unavailable = view.requires.some((requirement) => !coverage[requirement]);
                  const selected = dashboard.id === dashboardId && view.id === viewId;
                  return (
                    <li key={view.id}>
                      <button
                        type="button"
                        onClick={() => chooseView(dashboard.id, view)}
                        aria-current={selected ? "page" : undefined}
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm ${
                          selected
                            ? "bg-brand-50 font-semibold text-brand-800"
                            : unavailable
                              ? "text-slate-400 hover:bg-slate-50"
                              : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span>{view.title}</span>
                        {unavailable && (
                          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                            needs data
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
      </aside>

      <div className="min-w-0">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-[220px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-900">{activeView.title}</h2>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    source === "postgres" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {source === "postgres" ? "Live: Postgres" : "Sample data"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{activeView.description}</p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <label className="text-xs font-medium text-slate-600">
                Period
                <select
                  value={period}
                  onChange={(event) => choosePeriod(event.target.value as PeriodKind)}
                  className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
                >
                  {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">Chart format</p>
                <div className="flex overflow-hidden rounded-md border border-slate-300">
                  {activeView.formats.map((availableFormat) => (
                    <button
                      key={availableFormat}
                      type="button"
                      onClick={() => chooseFormat(availableFormat)}
                      aria-pressed={format === availableFormat}
                      className={`border-r border-slate-300 px-3 py-2 text-sm last:border-r-0 ${
                        format === availableFormat
                          ? "bg-brand-600 font-medium text-white"
                          : "bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {FORMAT_LABELS[availableFormat]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {result.kpis.map((item) => (
              <article key={item.label} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xl font-semibold tabular-nums text-brand-700">
                  {item.value === null ? "n/a" : formatMetricValue(item.value, item.unit as Unit)}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-700">{item.label}</p>
                {item.detail && <p className="mt-1 text-[11px] text-slate-500">{item.detail}</p>}
              </article>
            ))}
          </div>

          <section className="mt-5 rounded-md border border-slate-200 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-800">{activeView.title}</h3>
              {loading && <span className="text-xs text-slate-500">Updating…</span>}
            </div>
            {requestError ? (
              <p role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-700">{requestError}</p>
            ) : missingRequirements.length > 0 ? (
              <div className="rounded-md bg-slate-50 p-6 text-sm text-slate-700">
                <p className="font-semibold">This view needs more data.</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {missingRequirements.map((requirement) => (
                    <li key={requirement}>{REQUIREMENT_GUIDANCE[requirement]}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <Chart
                data={result.series}
                format={format}
                unit={result.unit}
                referenceLines={result.referenceLines}
              />
            )}
          </section>
        </section>

        <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-800">How this is calculated</h2>
          <p className="mt-2 text-sm font-medium text-slate-700">{metric?.name ?? activeView.metricId}</p>
          <p className="mt-1 text-sm text-slate-600"><span className="font-medium">Formula:</span> {metric?.formula}</p>
          <p className="mt-2 text-sm text-slate-600">{metric?.definition}</p>
          {metric && (
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {metric.sources.map((sourceId) => {
                const sourceRecord = SOURCES[sourceId];
                return (
                  <li key={sourceId}>
                    <a href={sourceRecord.url} target="_blank" rel="noreferrer" className="text-brand-700 underline">
                      {sourceRecord.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <VizRequestForm />
      </div>
    </div>
  );
}
