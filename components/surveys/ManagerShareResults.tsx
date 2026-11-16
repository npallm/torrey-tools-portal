"use client";

import { useEffect, useState } from "react";

type ScopeScore = {
  scope: "direct" | "sup_org";
  shown: boolean;
  overall: number | null;
  rank: number | null;
  categories: { category: string; score: number | null }[] | null;
  items: { questionId: string; score: number | null }[] | null;
};

type ShareData = {
  title: string;
  status: "draft" | "open" | "closed";
  closesAt: string | null;
  managerName: string;
  invited?: number;
  responded?: number;
  responseRate?: number | null;
  scores?: ScopeScore[];
  questions?: { id: string; prompt: string; category: string }[];
  scoredManagerCount?: number;
};

export function ManagerShareResults({ token, initialData }: { token: string; initialData: ShareData }) {
  const [data, setData] = useState(initialData);
  const [scope, setScope] = useState<"direct" | "sup_org">("direct");
  useEffect(() => {
    if (data.status !== "open") return;
    const refresh = async () => {
      const response = await fetch(`/api/r/${token}/scores`, { cache: "no-store" });
      if (!response.ok) return;
      setData((await response.json()) as ShareData);
    };
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(interval);
  }, [data.status, token]);
  const score = data.scores?.find((row) => row.scope === scope);
  const questions = data.questions ?? [];
  type Question = NonNullable<ShareData["questions"]>[number];
  const questionGroups = [...questions.reduce((groups, question) => {
    const items = groups.get(question.category) ?? [];
    items.push(question);
    groups.set(question.category, items);
    return groups;
  }, new Map<string, Question[]>())];
  const publicationMessage = data.closesAt
    ? `Manager scores and rankings are published when the survey closes on ${data.closesAt}.`
    : "Manager scores and rankings are published when an admin closes it.";
  return (
    <section className="space-y-4">
      {data.status === "open" ? (
        <>
          <p className="rounded border border-brand-200 bg-brand-50 p-4 text-sm">{publicationMessage}</p>
          {data.invited !== undefined && <p className="text-sm text-slate-600">{data.responded} of {data.invited} invited participants have responded.</p>}
        </>
      ) : (
        <>
      <div className="flex gap-2">
        <button type="button" onClick={() => setScope("direct")} className={`rounded px-3 py-2 text-sm ${scope === "direct" ? "bg-brand-700 text-white" : "border bg-white"}`}>My team</button>
        <button type="button" onClick={() => setScope("sup_org")} className={`rounded px-3 py-2 text-sm ${scope === "sup_org" ? "bg-brand-700 text-white" : "border bg-white"}`}>My whole org</button>
      </div>
      {!score?.shown && <p className="rounded border bg-white p-4 text-sm">{scope === "direct" ? "Scores appear once at least 5 of your direct reports respond." : "Not shown — too few responses to protect anonymity."}</p>}
      {score?.shown && (
        <div className="rounded-lg border bg-white p-5">
            <p className="text-xs uppercase text-slate-500">{scope === "direct" && score.rank ? `Rank #${score.rank} of ${data.scoredManagerCount ?? 0} scored managers` : "Overall score"}</p>
          <p className="text-3xl font-semibold">{score.overall?.toFixed(2) ?? "—"} <span className="text-sm font-normal text-slate-500">/ 5</span></p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {score.categories?.map((category) => <div key={category.category} className="rounded bg-slate-50 p-3"><p className="text-xs text-slate-500">{category.category}</p><p className="font-semibold">{category.score?.toFixed(2) ?? "—"}</p></div>)}
          </div>
          <div className="mt-5 space-y-4">
            <h2 className="font-semibold">Question scores</h2>
            {questionGroups.map(([category, questions]) => (
              <section key={category}>
                <h3 className="mb-2 text-sm font-medium text-slate-700">{category}</h3>
                <ul className="divide-y text-sm">
                  {questions.map((question) => {
                    const item = score.items?.find((entry) => entry.questionId === question.id);
                    return (
                      <li key={question.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-2">
                        <span>{question.prompt}</span>
                        <span className="text-right font-medium tabular-nums">{item?.score?.toFixed(2) ?? "—"}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
        </>
      )}
    </section>
  );
}
