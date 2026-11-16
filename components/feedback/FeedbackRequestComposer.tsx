"use client";

import { useState } from "react";

type Person = {
  id: string;
  name: string;
  managerId: string | null;
  department: string;
};

type Peer = Person & { active: boolean; organizationId: string };

export function FeedbackRequestComposer({
  reports,
  peers,
  suggestions,
  requesterId,
  defaultDueDate,
  action,
}: {
  reports: Person[];
  peers: Peer[];
  suggestions: Record<string, string[]>;
  requesterId: string;
  defaultDueDate: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [subjectId, setSubjectId] = useState(reports[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const suggestedIds = suggestions[subjectId] ?? [];
  const suggested = new Set(suggestedIds);
  const orderedPeers = [...peers]
    .filter((peer) => peer.id !== subjectId && peer.id !== requesterId)
    .sort((a, b) => Number(suggested.has(b.id)) - Number(suggested.has(a.id)) || a.name.localeCompare(b.name));

  function togglePeer(id: string) {
    setSelected((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : current.length < 10 ? [...current, id] : current);
  }

  return (
    <form action={action} className="space-y-4 rounded-lg border bg-white p-5">
      <label className="block text-sm font-medium">
        Direct report
        <select
          name="subjectWorkerId"
          required
          value={subjectId}
          onChange={(event) => {
            setSubjectId(event.target.value);
            setSelected([]);
          }}
          className="mt-1 block w-full rounded border p-2"
        >
          {reports.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.department}</option>)}
        </select>
      </label>
      <fieldset>
        <legend className="text-sm font-medium">Peers to invite (2–10)</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {orderedPeers.map((peer) => (
            <label key={peer.id} className="flex items-center gap-2 rounded border p-2 text-sm">
              <input
                type="checkbox"
                name="peerWorkerId"
                value={peer.id}
                checked={selected.includes(peer.id)}
                onChange={() => togglePeer(peer.id)}
              />
              <span>{peer.name} · {peer.department}{suggested.has(peer.id) ? " · suggested" : ""}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-medium">Message
        <textarea name="message" required rows={3} className="mt-1 block w-full rounded border p-2" />
      </label>
      <label className="block text-sm font-medium">Due date
        <input name="dueDate" type="date" required defaultValue={defaultDueDate} className="mt-1 block rounded border p-2" />
      </label>
      <p className="text-xs text-slate-500">{selected.length} peers selected.</p>
      <button className="rounded bg-brand-700 px-4 py-2 text-sm font-medium text-white">Send feedback requests</button>
    </form>
  );
}
