"use client";

import { useState } from "react";
import { saveTemplateAction } from "@/app/reviews/actions";
import type { RatingPoint, ReviewTemplate, ReviewTemplateItem } from "@/lib/server/reviews";

const defaultPoints: RatingPoint[] = [
  { value: 1, label: "Needs improvement", description: "Does not consistently meet expectations." },
  { value: 2, label: "Partially meets", description: "Meets some expectations; development needed." },
  { value: 3, label: "Meets", description: "Consistently meets role expectations." },
  { value: 4, label: "Exceeds", description: "Frequently exceeds role expectations." },
  { value: 5, label: "Exceptional", description: "Consistently delivers exceptional impact." },
];

export function ReviewTemplateEditor({ template }: { template?: ReviewTemplate }) {
  const [items, setItems] = useState<(Omit<ReviewTemplateItem, "id"> & { id?: string })[]>(template?.items ?? []);
  const [points, setPoints] = useState(template?.ratingPoints ?? defaultPoints);
  const updateItem = (index: number, changes: Partial<(typeof items)[number]>) =>
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...changes } : item));
  const updatePoint = (index: number, changes: Partial<RatingPoint>) =>
    setPoints((current) => current.map((point, i) => i === index ? { ...point, ...changes } : point));
  return (
    <form action={saveTemplateAction} className="space-y-4 rounded-lg border bg-white p-5">
      <input type="hidden" name="id" value={template?.id ?? ""} />
      <input type="hidden" name="scaleId" value={template?.scaleId ?? ""} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <input type="hidden" name="points" value={JSON.stringify(points)} />
      <label className="block text-sm font-medium">Template name<input required name="name" defaultValue={template?.name} className="mt-1 block w-full rounded border p-2" /></label>
      <label className="block text-sm font-medium">Description<textarea name="description" defaultValue={template?.description ?? ""} className="mt-1 block w-full rounded border p-2" /></label>
      <label className="block text-sm font-medium">Scale name<input name="scaleName" defaultValue={template?.scaleName ?? "Five point scale"} className="mt-1 block w-full rounded border p-2" /></label>
      <section className="rounded border p-3"><h3 className="mb-3 font-semibold">Scale labels and descriptions</h3>{points.map((point, index) => <div key={point.value} className="mb-2 grid gap-2 sm:grid-cols-[3rem_1fr_2fr]"><input className="rounded border p-2" type="number" value={point.value} onChange={(event) => updatePoint(index, { value: Number(event.target.value) })} /><input className="rounded border p-2" value={point.label} onChange={(event) => updatePoint(index, { label: event.target.value })} /><input className="rounded border p-2" value={point.description} onChange={(event) => updatePoint(index, { description: event.target.value })} /></div>)}</section>
      <section className="space-y-2"><h3 className="font-semibold">Items</h3>{items.map((item, index) => <div key={item.id ?? index} className="grid gap-2 rounded border p-3 sm:grid-cols-2">
        <select className="rounded border p-2" value={item.itemType} onChange={(event) => updateItem(index, { itemType: event.target.value as "competency" | "question" })}><option value="competency">Competency</option><option value="question">Question</option></select>
        <input className="rounded border p-2" value={item.title} onChange={(event) => updateItem(index, { title: event.target.value })} />
        <input className="rounded border p-2" placeholder="Description" value={item.description ?? ""} onChange={(event) => updateItem(index, { description: event.target.value })} />
        <div className="flex flex-wrap items-center gap-3 text-sm"><label>Weight <input type="number" min="0" step="0.1" className="w-20 rounded border p-1" value={item.weight} onChange={(event) => updateItem(index, { weight: Number(event.target.value) })} /></label><label><input type="checkbox" checked={item.rated} onChange={(event) => updateItem(index, { rated: event.target.checked })} /> Rated</label>{(["self","manager","peer","upward"] as const).map((role) => <label key={role}><input type="checkbox" checked={item.appliesTo.includes(role)} onChange={(event) => updateItem(index, { appliesTo: event.target.checked ? [...item.appliesTo, role] : item.appliesTo.filter((value) => value !== role) })} /> {role}</label>)}<button type="button" className="text-rose-700" onClick={() => setItems((current) => current.filter((_, i) => i !== index))}>Remove</button></div>
      </div>)}<button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setItems((current) => [...current, { position: current.length, itemType: "competency", title: "", description: null, weight: 1, rated: true, appliesTo: ["self","manager","peer"] }])}>Add item</button></section>
      <div className="flex flex-wrap items-center gap-3"><label className="text-sm"><input type="checkbox" name="includeGoals" defaultChecked={template?.includeGoals ?? true} /> Include goals</label><label className="text-sm">Goals weight % <input className="w-20 rounded border p-1" type="number" name="goalsWeight" defaultValue={template?.goalsWeight ?? 30} min="0" max="100" /></label></div>
      <button className="rounded bg-brand-700 px-4 py-2 text-sm text-white">Save template</button>
    </form>
  );
}
