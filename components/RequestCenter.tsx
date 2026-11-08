"use client";

import { useEffect, useState } from "react";
import { Badge, statusTone } from "@/components/Badge";
import type { ChangeRequestType } from "@/lib/types";

type Row = {
  id: string;
  employeeId: string;
  employeeName: string;
  type: ChangeRequestType;
  details: string;
  submittedBy: string;
  submittedAt: string;
  status: "Pending" | "Approved" | "Denied";
};

const REQUEST_TYPES: ChangeRequestType[] = [
  "Title change",
  "Compensation change",
  "Department transfer",
  "Schedule change",
  "Manager change",
  "Status change",
];

const STORAGE_KEY = "torrey.changeRequests";

export function RequestCenter({
  employees,
  seeded,
}: {
  employees: { id: string; name: string }[];
  seeded: Row[];
}) {
  const [rows, setRows] = useState<Row[]>(seeded);
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [type, setType] = useState<ChangeRequestType>(REQUEST_TYPES[0]);
  const [details, setDetails] = useState("");
  const [submittedBy, setSubmittedBy] = useState("");
  const [flash, setFlash] = useState(false);

  // Local submissions persist in the browser until a real backend lands.
  useEffect(() => {
    try {
      const saved: Row[] = JSON.parse(
        localStorage.getItem(STORAGE_KEY) ?? "[]"
      );
      if (saved.length) setRows([...saved, ...seeded]);
    } catch {
      /* ignore corrupt storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !details.trim()) return;
    const row: Row = {
      id: `cr-local-${Date.now()}`,
      employeeId,
      employeeName:
        employees.find((x) => x.id === employeeId)?.name ?? employeeId,
      type,
      details: details.trim(),
      submittedBy: submittedBy.trim() || "Portal user",
      submittedAt: new Date().toISOString().slice(0, 10),
      status: "Pending",
    };
    const saved: Row[] = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]"
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify([row, ...saved]));
    setRows([row, ...rows]);
    setDetails("");
    setSubmittedBy("");
    setFlash(true);
    setTimeout(() => setFlash(false), 3000);
  }

  const pending = rows.filter((r) => r.status === "Pending");
  const decided = rows.filter((r) => r.status !== "Pending");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <form
        onSubmit={submit}
        className="rounded-lg border border-slate-200 bg-white p-5"
      >
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          New request
        </h2>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium">Employee</span>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          >
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium">Request type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ChangeRequestType)}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          >
            {REQUEST_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium">Details</span>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            required
            placeholder="e.g. Raise to $72k effective Jan 1"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-medium">Your name</span>
          <input
            value={submittedBy}
            onChange={(e) => setSubmittedBy(e.target.value)}
            placeholder="Optional"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Submit request
        </button>
        {flash && (
          <p className="mt-2 text-center text-sm text-emerald-700">
            Request submitted — added to the queue.
          </p>
        )}
      </form>

      <div className="lg:col-span-2">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Pending ({pending.length})
        </h2>
        <RequestTable rows={pending} />
        <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Decided
        </h2>
        <RequestTable rows={decided} />
      </div>
    </div>
  );
}

function RequestTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Employee</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Details</th>
            <th className="px-4 py-3">Submitted</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-3 font-medium">{r.employeeName}</td>
              <td className="px-4 py-3">{r.type}</td>
              <td className="px-4 py-3 text-slate-600">{r.details}</td>
              <td className="px-4 py-3 text-slate-500">
                {r.submittedBy} · {r.submittedAt}
              </td>
              <td className="px-4 py-3">
                <Badge tone={statusTone(r.status)}>{r.status}</Badge>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-3 text-slate-500">
                None.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
