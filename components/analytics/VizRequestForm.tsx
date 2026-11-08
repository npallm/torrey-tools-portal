"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/Badge";

type VizRequest = {
  id: string;
  metric: string;
  chartType: string;
  description: string;
  submittedBy: string;
  submittedAt: string;
  status: "Pending";
};

const METRICS = [
  "Turnover",
  "Compa ratio",
  "Headcount",
  "PTO usage",
  "Tenure",
  "Absenteeism",
  "Other",
];

const CHART_TYPES = ["Bar", "Line", "Pie", "Table", "Scatter"];

const STORAGE_KEY = "torrey.vizRequests";

export function VizRequestForm() {
  const [requests, setRequests] = useState<VizRequest[]>([]);
  const [metric, setMetric] = useState(METRICS[0]);
  const [chartType, setChartType] = useState(CHART_TYPES[0]);
  const [description, setDescription] = useState("");
  const [submittedBy, setSubmittedBy] = useState("");
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    try {
      setRequests(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    const req: VizRequest = {
      id: `viz-${Date.now()}`,
      metric,
      chartType,
      description: description.trim(),
      submittedBy: submittedBy.trim() || "Portal user",
      submittedAt: new Date().toISOString().slice(0, 10),
      status: "Pending",
    };
    const next = [req, ...requests];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setRequests(next);
    setDescription("");
    setSubmittedBy("");
    setFlash(true);
    setTimeout(() => setFlash(false), 3000);
  }

  return (
    <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Request a visualization
        </h2>
        <button
          onClick={() => setOpen(!open)}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {open ? "Close" : "New request"}
        </button>
      </div>

      {open && (
        <form
          onSubmit={submit}
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Metric</span>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            >
              {METRICS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Chart type</span>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            >
              {CHART_TYPES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">
              What should it show?
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              required
              placeholder="e.g. Monthly voluntary turnover by department, trailing 12 months"
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Your name</span>
            <input
              value={submittedBy}
              onChange={(e) => setSubmittedBy(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Submit request
            </button>
            {flash && (
              <span className="ml-3 text-sm text-emerald-700">
                Request submitted.
              </span>
            )}
          </div>
        </form>
      )}

      {requests.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 text-sm">
          {requests.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">
                  {r.metric} · {r.chartType}
                </p>
                <p className="text-xs text-slate-500">
                  {r.description} — {r.submittedBy}, {r.submittedAt}
                </p>
              </div>
              <Badge tone="yellow">{r.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
