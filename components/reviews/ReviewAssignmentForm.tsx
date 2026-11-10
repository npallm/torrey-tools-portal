"use client";

import { useState } from "react";
import { reviewAssignmentAction } from "@/app/reviews/actions";

type Item = { id: string; title: string; description: string | null; weight: number; rated: boolean; rating: number | null; comment: string | null };

export function ReviewAssignmentForm({ assignmentId, items, overallComment, ratingPoints, goals }: {
  assignmentId: string;
  items: Item[];
  overallComment: string | null;
  ratingPoints: { value: number; label: string; description: string }[];
  goals: { id: string; title: string; progressPct: number; status: string }[];
}) {
  const [answers, setAnswers] = useState(items.map((item) => ({ itemId: item.id, rating: item.rating, comment: item.comment ?? "" })));
  const change = (index: number, values: Partial<(typeof answers)[number]>) => setAnswers((current) => current.map((answer, i) => i === index ? { ...answer, ...values } : answer));
  return (
    <form action={reviewAssignmentAction} className="space-y-4">
      <input type="hidden" name="assignmentId" value={assignmentId}/>
      <input type="hidden" name="items" value={JSON.stringify(answers)}/>
      {items.map((item,index)=><fieldset key={item.id} className="rounded border bg-white p-4"><legend className="font-semibold">{item.title}{item.rated ? ` · weight ${item.weight}` : " · comment only"}</legend>{item.description && <p className="my-2 text-sm text-slate-500">{item.description}</p>}{item.rated && <select className="mb-2 rounded border p-2" value={answers[index].rating ?? ""} onChange={(event)=>change(index,{rating:event.target.value===""?null:Number(event.target.value)})}><option value="">Choose a rating</option>{ratingPoints.map((point)=><option key={point.value} value={point.value}>{point.value} · {point.label} — {point.description}</option>)}</select>}<textarea className="block w-full rounded border p-2 text-sm" placeholder="Comment" value={answers[index].comment} onChange={(event)=>change(index,{comment:event.target.value})}/></fieldset>)}
      <div className="rounded border bg-white p-4"><h2 className="font-semibold">Goals and progress</h2>{goals.map((goal)=><p key={goal.id} className="mt-2 text-sm">{goal.title} · {goal.progressPct}% · {goal.status}</p>)}</div>
      <label className="block text-sm font-medium">Overall comment<textarea name="overallComment" defaultValue={overallComment ?? ""} rows={3} className="mt-1 block w-full rounded border bg-white p-2"/></label>
      <div className="flex gap-2"><button name="mode" value="draft" className="rounded border bg-white px-4 py-2 text-sm">Save draft</button><button name="mode" value="submit" className="rounded bg-brand-700 px-4 py-2 text-sm text-white">Submit review</button></div>
    </form>
  );
}
