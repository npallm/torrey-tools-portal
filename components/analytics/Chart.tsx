"use client";

import { useEffect, useState } from "react";
import type { ChartFormat, Datum, Unit } from "@/lib/metrics/views";

type Props = {
  data: Datum[];
  format: ChartFormat;
  unit: Unit;
  referenceLines?: { value: number; label: string }[];
};

const COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#65a30d"];

export function formatMetricValue(value: number, unit: Unit, compact = false): string {
  if (!Number.isFinite(value)) return "n/a";
  if (unit === "percent") return `${value.toFixed(1)}%`;
  if (unit === "ratio") return value.toFixed(2);
  if (unit === "currency") {
    if (compact) {
      const magnitude = Math.abs(value);
      if (magnitude >= 1_000_000) return `$${(value / 1_000_000).toFixed(magnitude >= 10_000_000 ? 0 : 1)}M`;
      if (magnitude >= 1_000) return `$${(value / 1_000).toFixed(magnitude >= 10_000 ? 0 : 1)}K`;
    }
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
  if (unit === "years") return `${value.toFixed(1)} yrs`;
  if (unit === "days") return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} days`;
  if (unit === "fte") return value.toFixed(1);
  return Math.round(value).toLocaleString("en-US");
}

function detail(datum: Datum, unit: Unit): string {
  return `${datum.label}: ${formatMetricValue(datum.value, unit)}${datum.hint ? ` (${datum.hint})` : ""}`;
}

function EmptyChart() {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-md bg-slate-50 text-sm text-slate-500">
      No values to display for this period.
    </div>
  );
}

function ColumnChart({ data, unit, referenceLines }: Omit<Props, "format">) {
  const width = 840;
  const height = 360;
  const left = 72;
  const right = 20;
  const top = 28;
  const bottom = 76;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = Math.max(1, ...data.map((item) => item.value), ...(referenceLines ?? []).map((line) => line.value));
  const slot = plotWidth / data.length;
  const barWidth = Math.min(48, slot * 0.68);

  return (
    <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Column chart">
      {[0, 0.5, 1].map((fraction) => {
        const y = top + plotHeight * (1 - fraction);
        return (
          <g key={fraction}>
            <line x1={left} x2={width - right} y1={y} y2={y} stroke="#e2e8f0" />
            <text x={left - 10} y={y + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
              {formatMetricValue(max * fraction, unit, true)}
            </text>
          </g>
        );
      })}
      {(referenceLines ?? []).map((line) => {
        const y = top + plotHeight * (1 - line.value / max);
        return (
          <g key={line.label}>
            <line x1={left} x2={width - right} y1={y} y2={y} stroke="#b45309" strokeDasharray="5 4" />
            <text x={width - right - 2} y={y - 5} textAnchor="end" className="fill-amber-800 text-[11px]">
              {line.label}
            </text>
          </g>
        );
      })}
      {data.map((datum, index) => {
        const barHeight = Math.max(0, (datum.value / max) * plotHeight);
        const x = left + slot * index + (slot - barWidth) / 2;
        const y = top + plotHeight - barHeight;
        return (
          <g key={datum.label}>
            <rect x={x} y={y} width={barWidth} height={barHeight} rx="3" fill="#2563eb">
              <title>{detail(datum, unit)}</title>
            </rect>
            <text
              x={x + barWidth / 2}
              y={height - bottom + 18}
              textAnchor="end"
              transform={`rotate(-35 ${x + barWidth / 2} ${height - bottom + 18})`}
              className="fill-slate-600 text-[11px]"
            >
              {datum.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function BarChart({ data, unit, referenceLines }: Omit<Props, "format">) {
  const width = 840;
  const rowHeight = 36;
  const height = Math.max(250, data.length * rowHeight + 50);
  const left = 190;
  const right = 74;
  const plotWidth = width - left - right;
  const max = Math.max(1, ...data.map((item) => item.value), ...(referenceLines ?? []).map((line) => line.value));

  return (
    <svg className="max-h-[560px] w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Bar chart">
      {[0, 0.5, 1].map((fraction) => {
        const x = left + plotWidth * fraction;
        return (
          <g key={fraction}>
            <line x1={x} x2={x} y1={22} y2={height - 18} stroke="#e2e8f0" />
            <text x={x} y={height - 2} textAnchor="middle" className="fill-slate-500 text-[11px]">
              {formatMetricValue(max * fraction, unit, true)}
            </text>
          </g>
        );
      })}
      {(referenceLines ?? []).map((line) => {
        const x = left + plotWidth * (line.value / max);
        return (
          <g key={line.label}>
            <line x1={x} x2={x} y1={18} y2={height - 18} stroke="#b45309" strokeDasharray="5 4" />
            <text x={x + 4} y={14} className="fill-amber-800 text-[11px]">
              {line.label}
            </text>
          </g>
        );
      })}
      {data.map((datum, index) => {
        const y = 28 + index * rowHeight;
        const barWidth = Math.max(0, (datum.value / max) * plotWidth);
        return (
          <g key={datum.label}>
            <text x={left - 10} y={y + 15} textAnchor="end" className="fill-slate-700 text-[12px]">
              {datum.label.length > 26 ? `${datum.label.slice(0, 25)}…` : datum.label}
            </text>
            <rect x={left} y={y} width={barWidth} height={20} rx="3" fill="#2563eb">
              <title>{detail(datum, unit)}</title>
            </rect>
            <text x={Math.min(width - right + 5, left + barWidth + 6)} y={y + 15} className="fill-slate-600 text-[11px]">
              {formatMetricValue(datum.value, unit, true)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ data, unit, referenceLines }: Omit<Props, "format">) {
  const width = 840;
  const height = 360;
  const left = 72;
  const right = 20;
  const top = 28;
  const bottom = 58;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = Math.max(1, ...data.map((item) => item.value), ...(referenceLines ?? []).map((line) => line.value));
  const xFor = (index: number) => left + (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth);
  const yFor = (value: number) => top + plotHeight * (1 - value / max);
  const points = data.map((item, index) => `${xFor(index)},${yFor(item.value)}`).join(" ");

  return (
    <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart">
      {[0, 0.5, 1].map((fraction) => {
        const y = top + plotHeight * (1 - fraction);
        return (
          <g key={fraction}>
            <line x1={left} x2={width - right} y1={y} y2={y} stroke="#e2e8f0" />
            <text x={left - 10} y={y + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
              {formatMetricValue(max * fraction, unit, true)}
            </text>
          </g>
        );
      })}
      {(referenceLines ?? []).map((line) => {
        const y = yFor(line.value);
        return (
          <g key={line.label}>
            <line x1={left} x2={width - right} y1={y} y2={y} stroke="#b45309" strokeDasharray="5 4" />
            <text x={width - right - 2} y={y - 5} textAnchor="end" className="fill-amber-800 text-[11px]">
              {line.label}
            </text>
          </g>
        );
      })}
      <polyline points={points} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((datum, index) => (
        <g key={datum.label}>
          <circle cx={xFor(index)} cy={yFor(datum.value)} r="4" fill="#2563eb">
            <title>{detail(datum, unit)}</title>
          </circle>
          <text
            x={xFor(index)}
            y={height - 20}
            textAnchor="end"
            transform={`rotate(-35 ${xFor(index)} ${height - 20})`}
            className="fill-slate-600 text-[11px]"
          >
            {datum.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function PieChart({ data, unit }: Omit<Props, "format" | "referenceLines">) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const cx = 150;
  const cy = 145;
  const radius = 100;
  const innerRadius = 58;
  let angle = -Math.PI / 2;

  if (total <= 0) return <EmptyChart />;

  const slices = data.map((datum, index) => {
    const fraction = datum.value / total;
    const start = angle;
    angle += fraction * Math.PI * 2;
    const end = angle;
    if (fraction >= 0.999999) {
      return (
        <g key={datum.label}>
          <circle
            cx={cx}
            cy={cy}
            r={(radius + innerRadius) / 2}
            fill="none"
            stroke={COLORS[index % COLORS.length]}
            strokeWidth={radius - innerRadius}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeDasharray={`${2 * Math.PI * ((radius + innerRadius) / 2) * fraction} ${2 * Math.PI * ((radius + innerRadius) / 2)}`}
          />
          <title>{detail(datum, unit)}</title>
        </g>
      );
    }
    const outerStart = { x: cx + radius * Math.cos(start), y: cy + radius * Math.sin(start) };
    const outerEnd = { x: cx + radius * Math.cos(end), y: cy + radius * Math.sin(end) };
    const innerEnd = { x: cx + innerRadius * Math.cos(end), y: cy + innerRadius * Math.sin(end) };
    const innerStart = { x: cx + innerRadius * Math.cos(start), y: cy + innerRadius * Math.sin(start) };
    const largeArc = fraction > 0.5 ? 1 : 0;
    const path = [
      `M ${outerStart.x} ${outerStart.y}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
      `L ${innerEnd.x} ${innerEnd.y}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
      "Z",
    ].join(" ");
    return (
      <path key={datum.label} d={path} fill={COLORS[index % COLORS.length]}>
        <title>{detail(datum, unit)}</title>
      </path>
    );
  });

  return (
    <div className="grid items-center gap-5 sm:grid-cols-[300px_1fr]">
      <svg className="mx-auto w-full max-w-[300px]" viewBox="0 0 300 290" role="img" aria-label="Donut chart">
        {slices}
        <text x={cx} y={cy - 3} textAnchor="middle" className="fill-slate-800 text-[15px] font-semibold">
          {formatMetricValue(total, unit)}
        </text>
        <text x={cx} y={cy + 17} textAnchor="middle" className="fill-slate-500 text-[11px]">
          Total
        </text>
      </svg>
      <ul className="space-y-2 text-sm">
        {data.map((datum, index) => (
          <li key={datum.label} className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              <span className="truncate">{datum.label}</span>
            </span>
            <span className="shrink-0 text-slate-600">
              {formatMetricValue((datum.value / total) * 100, "percent")} · {formatMetricValue(datum.value, unit)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DataTable({ data, unit }: Omit<Props, "format" | "referenceLines">) {
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const pageCount = Math.ceil(data.length / pageSize);
  const rows = data.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => setPage(0), [data]);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Label</th>
              <th className="px-3 py-2 text-right font-semibold">Value</th>
              <th className="px-3 py-2 font-semibold">Hint</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((datum) => (
              <tr key={datum.label}>
                <td className="px-3 py-2 font-medium text-slate-800">{datum.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMetricValue(datum.value, unit)}</td>
                <td className="px-3 py-2 text-slate-500">{datum.hint ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
          <span>
            Rows {page * pageSize + 1}–{Math.min((page + 1) * pageSize, data.length)} of {data.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={page === 0}
              className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              disabled={page >= pageCount - 1}
              className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Chart({ data, format, unit, referenceLines }: Props) {
  const limitedData =
    data.length > 25 && format !== "table" && format !== "line"
      ? [...data].sort((left, right) => right.value - left.value).slice(0, 25)
      : data;
  const clipped = limitedData.length < data.length;
  const hasPositivePieValues = format !== "pie" || data.some((item) => item.value > 0);
  const hasData = data.length > 0 && hasPositivePieValues;

  return (
    <div>
      {!hasData ? (
        <EmptyChart />
      ) : format === "table" ? (
        <DataTable data={data} unit={unit} />
      ) : format === "column" ? (
        <ColumnChart data={limitedData} unit={unit} referenceLines={referenceLines} />
      ) : format === "bar" ? (
        <BarChart data={limitedData} unit={unit} referenceLines={referenceLines} />
      ) : format === "line" ? (
        <LineChart data={data} unit={unit} referenceLines={referenceLines} />
      ) : (
        <PieChart data={limitedData} unit={unit} />
      )}
      {clipped && (
        <p className="mt-2 text-xs text-slate-500">
          Showing 25 of {data.length} — switch to Table for all
        </p>
      )}
    </div>
  );
}
