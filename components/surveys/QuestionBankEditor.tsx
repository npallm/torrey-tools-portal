"use client";

import { useState } from "react";
import { MANAGER_CATEGORIES } from "@/lib/surveys/managerQuestions";
import { saveQuestionBankAction } from "@/app/surveys/actions";
import type { QuestionBankItem } from "@/lib/server/surveys";

export function QuestionBankEditor({ initialItems }: { initialItems: QuestionBankItem[] }) {
  const [items, setItems] = useState(initialItems);
  const update = (index: number, changes: Partial<QuestionBankItem>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  const move = (index: number, by: number) =>
    setItems((current) => {
      const next = [...current];
      const target = index + by;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  return (
    <form action={saveQuestionBankAction} className="space-y-3">
      {items.map((item, index) => (
        <fieldset key={item.id ?? index} className="rounded-lg border bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase text-slate-500">Question {index + 1}</p>
            <div className="flex gap-2">
              <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => move(index, -1)}>↑</button>
              <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => move(index, 1)}>↓</button>
              <button type="button" className="rounded border px-2 py-1 text-xs text-rose-700" onClick={() => setItems((current) => current.filter((_, i) => i !== index))}>Delete</button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
            <select className="rounded border p-2 text-sm" value={item.category} onChange={(event) => update(index, { category: event.target.value })}>
              {MANAGER_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
            </select>
            <input className="rounded border p-2 text-sm" value={item.prompt} onChange={(event) => update(index, { prompt: event.target.value })} required />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={item.active} onChange={(event) => update(index, { active: event.target.checked })} /> Active</label>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className="rounded border bg-white px-3 py-2 text-sm"
        onClick={() => setItems((current) => [...current, { category: MANAGER_CATEGORIES[0], prompt: "", active: true, position: current.length }])}
      >
        Add question
      </button>
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <button className="ml-3 rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white">Save question bank</button>
    </form>
  );
}
