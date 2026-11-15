const DAY = 86_400_000;
const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const days = (from: string, to: string) => Math.round((t(to) - t(from)) / DAY);

export type OneOnOneStatus = "On track" | "Due" | "Overdue" | "Not started";

export type OneOnOneHealth = {
  lastHeld: string | null;
  daysSinceLast: number | null;
  status: OneOnOneStatus;
  /** Held ÷ expected meetings in the trailing 90 days × 100 (capped at 100); null if none expected yet. */
  adherence90: number | null;
};

/**
 * Status uses days since the last held meeting (or since the series started):
 * ≤ cadence → On track (Not started if never held), ≤ 1.5 × cadence → Due, else Overdue.
 */
export function oneOnOneHealth(
  series: { cadenceDays: number; startedOn: string },
  heldDates: string[],
  asOf: string,
): OneOnOneHealth {
  const held = heldDates.filter((d) => d <= asOf).sort();
  const lastHeld = held.length ? held[held.length - 1] : null;
  const since = days(lastHeld ?? series.startedOn, asOf);
  let status: OneOnOneStatus = since <= series.cadenceDays ? "On track" : since <= series.cadenceDays * 1.5 ? "Due" : "Overdue";
  if (!lastHeld && status === "On track") status = "Not started";

  const windowStart = new Date(Math.max(t(asOf) - 89 * DAY, t(series.startedOn))).toISOString().slice(0, 10);
  const windowDays = days(windowStart, asOf) + 1;
  const expected = Math.floor(windowDays / series.cadenceDays);
  const inWindow = held.filter((d) => d >= windowStart).length;
  return {
    lastHeld,
    daysSinceLast: lastHeld ? since : null,
    status,
    adherence90: expected > 0 ? (Math.min(inWindow, expected) / expected) * 100 : null,
  };
}

/** Open action items carry forward until completed; overdue when past due. */
export function actionItemStatus(item: { dueDate: string | null; completedAt: string | null }, asOf: string): "Done" | "Overdue" | "Open" {
  if (item.completedAt) return "Done";
  return item.dueDate !== null && item.dueDate < asOf ? "Overdue" : "Open";
}
