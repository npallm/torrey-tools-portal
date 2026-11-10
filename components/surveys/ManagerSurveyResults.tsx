"use client";

import { useEffect, useMemo, useState } from "react";

type ScoreRow = {
  managerId: string;
  name: string;
  division: string | null;
  department: string | null;
  shown: boolean;
  overall: number | null;
  rank: number | null;
  categories: { category: string; score: number | null }[] | null;
  items: { questionId: string; score: number | null }[] | null;
};

type SurveyData = {
  id: string;
  status: "draft" | "open" | "closed";
  invited: number;
  responded: number;
  responseRate: number | null;
  managersScored: number;
  managerCount: number;
  questions: { id: string; prompt: string; category: string }[];
  direct: ScoreRow[];
  supOrgs: ScoreRow[];
  companyAverage: ScoreRow | null;
};

function Score({ value }: { value: number | null }) {
  return value === null ? <span>—</span> : <span>{value.toFixed(2)}</span>;
}

export function ManagerSurveyResults({ initialData }: { initialData: SurveyData }) {
  const [data, setData] = useState(initialData);
  const [scope, setScope] = useState<"direct" | "sup_org">("direct");
  const [division, setDivision] = useState("");
  const [department, setDepartment] = useState("");
  const [search, setSearch] = useState("");
  const [updatedAt, setUpdatedAt] = useState(Date.now());
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    if (data.status !== "open") return;
    const refresh = async () => {
      const response = await fetch(`/api/surveys/${data.id}/scores`, { cache: "no-store" });
      if (!response.ok) return;
      const next = (await response.json()) as SurveyData;
      setData(next);
      setUpdatedAt(Date.now());
    };
    const interval = window.setInterval(() => void refresh(), 5000);
    const clockInterval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(clockInterval);
    };
  }, [data.id, data.status]);

  const rows = scope === "direct" ? data.direct : data.supOrgs;
  const divisions = useMemo(() => [...new Set(rows.map((row) => row.division).filter(Boolean))].sort(), [rows]);
  const departments = useMemo(() => [...new Set(rows.map((row) => row.department).filter(Boolean))].sort(), [rows]);
  const filtered = rows.filter(
    (row) =>
      (!division || row.division === division) &&
      (!department || row.department === department) &&
      row.name.toLowerCase().includes(search.toLowerCase()),
  );
  const scored = scope === "direct" ? filtered.filter((row) => row.shown) : filtered.filter((row) => row.shown);
  const unscored = scope === "direct" ? filtered.filter((row) => !row.shown) : [];
  const elapsed = Math.max(0, Math.floor((clock - updatedAt) / 1000));

  return (
    <section className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setScope("direct")}
            className={`rounded-md px-3 py-2 text-sm ${scope === "direct" ? "bg-brand-700 text-white" : "border bg-white"}`}
          >
            Direct reports
          </button>
          <button
            type="button"
            onClick={() => setScope("sup_org")}
            className={`rounded-md px-3 py-2 text-sm ${scope === "sup_org" ? "bg-brand-700 text-white" : "border bg-white"}`}
          >
            Whole sup org
          </button>
        </div>
        {data.status === "open" && <p className="text-sm text-emerald-700">Live · updated {elapsed}s ago</p>}
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-slate-600">
          Division
          <select className="mt-1 block w-full rounded border p-2 text-sm" value={division} onChange={(event) => setDivision(event.target.value)}>
            <option value="">All divisions</option>
            {divisions.map((value) => <option key={value} value={value ?? ""}>{value}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Department
          <select className="mt-1 block w-full rounded border p-2 text-sm" value={department} onChange={(event) => setDepartment(event.target.value)}>
            <option value="">All departments</option>
            {departments.map((value) => <option key={value} value={value ?? ""}>{value}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Manager name
          <input className="mt-1 block w-full rounded border p-2 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
      </div>
      {scope === "direct" ? (
        <>
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="min-w-full divide-y text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="p-3">Rank</th><th className="p-3">Manager</th><th className="p-3">Division</th><th className="p-3">Department</th><th className="p-3">Overall</th>{data.questions.filter((_, index) => index % 5 === 0).map((question) => <th key={question.category} className="p-3">{question.category}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {scored.map((row) => (
                  <tr key={row.managerId} className="align-top">
                    <td className="p-3">{row.rank}</td>
                    <td className="p-3 font-medium">
                      <details>
                        <summary className="cursor-pointer">{row.name}</summary>
                        <div className="mt-3 min-w-80 space-y-2 rounded bg-slate-50 p-3">
                          <p className="font-semibold">Category scores</p>
                          {row.categories?.map((category) => <p key={category.category}>{category.category}: <Score value={category.score} /></p>)}
                          <p className="pt-2 font-semibold">Question scores</p>
                          {row.items?.map((item) => (
                            <p key={item.questionId}>
                              {data.questions.find((question) => question.id === item.questionId)?.prompt ?? "Question"}: <Score value={item.score} />
                            </p>
                          ))}
                        </div>
                      </details>
                    </td>
                    <td className="p-3">{row.division ?? "—"}</td>
                    <td className="p-3">{row.department ?? "—"}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2"><Score value={row.overall} /><div className="h-2 w-20 rounded bg-slate-100"><div className="h-2 rounded bg-brand-600" style={{ width: `${((row.overall ?? 0) / 5) * 100}%` }} /></div></div>
                    </td>
                    {row.categories?.map((category) => <td key={category.category} className="p-3"><Score value={category.score} /></td>)}
                  </tr>
                ))}
                {scored.length === 0 && <tr><td colSpan={8} className="p-5 text-center text-slate-500">No managers match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-6 rounded-lg border bg-white p-4">
            <h3 className="font-semibold">Not scored — fewer than 5 direct-report responses</h3>
            <ul className="mt-2 flex flex-wrap gap-2 text-sm text-slate-600">{unscored.map((row) => <li key={row.managerId} className="rounded bg-slate-100 px-3 py-1">{row.name}</li>)}</ul>
          </div>
        </>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          {data.companyAverage?.shown && (
            <div className="border-b bg-brand-50 p-4 text-sm font-medium">
              Company average · <Score value={data.companyAverage.overall} />
            </div>
          )}
          <table className="min-w-full divide-y text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="p-3">Leader</th><th className="p-3">Division</th><th className="p-3">Department</th><th className="p-3">Overall</th><th className="p-3">Categories</th></tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((row) => (
                <tr key={row.managerId}>
                  <td className="p-3 font-medium">{row.name}</td><td className="p-3">{row.division ?? "—"}</td><td className="p-3">{row.department ?? "—"}</td>
                  <td className="p-3">{row.shown ? <Score value={row.overall} /> : "Not shown — too few responses to protect anonymity"}</td>
                  <td className="p-3">{row.shown ? row.categories?.map((item) => `${item.category}: ${item.score?.toFixed(2) ?? "—"}`).join(" · ") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
