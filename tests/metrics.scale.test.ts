import { describe, expect, it } from "vitest";
import { DASHBOARDS, periodFor } from "../lib/metrics/views";
import type { WorkforceDataset } from "../lib/metrics/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const departments = [
  "Operations",
  "Client Services",
  "People",
  "Finance",
  "Technology",
  "Sales",
  "Marketing",
  "Customer Support",
  "Product",
  "Legal",
  "Security",
  "Administration",
];

function scaleDataset(): WorkforceDataset {
  const people: WorkforceDataset["people"] = Array.from({ length: 5_000 }, (_, index) => {
    const employeeNumber = String(index).padStart(5, "0");
    const hireDate = isoDate(new Date(Date.UTC(2019, index % 84, 1 + (index % 25))));
    const terminationDate =
      index >= 500 && index < 1_100
        ? isoDate(
            new Date(
              Date.UTC(
                2025 + Math.floor((index - 500) / 600) * 2,
                ((index - 500) % 600) % 24,
                1 + ((index - 500) * 13) % 28,
              ),
            ),
          )
        : null;
    const midpoint = 50_000 + (index % 200) * 500;
    const managerIndex = index < 100 ? null : (index - 100) % 100;

    return {
      id: `employee-${employeeNumber}`,
      name: `Employee ${employeeNumber}`,
      department: departments[index % departments.length],
      location: `Office ${(index % 8) + 1}`,
      managerId: managerIndex === null ? null : `employee-${String(managerIndex).padStart(5, "0")}`,
      workerType: index % 50 === 0 ? "Contingent" : "Employee",
      fte: index % 10 === 0 ? 0.5 : 1,
      hireDate,
      terminationDate,
      separationCategory:
        terminationDate === null
          ? null
          : index % 3 === 0
            ? "Quit"
            : index % 3 === 1
              ? "Layoff/Discharge"
              : "Other",
      regrettable: terminationDate !== null && index % 3 === 0,
      annualSalary: midpoint * (0.85 + (index % 30) / 100),
      payRangeMin: midpoint * 0.8,
      payRangeMid: midpoint,
      payRangeMax: midpoint * 1.2,
    };
  });

  const payDates = Array.from({ length: 24 }, (_, monthIndex) => [
    isoDate(new Date(Date.UTC(2025, monthIndex, 15))),
    isoDate(new Date(Date.UTC(2025, monthIndex + 1, 0))),
  ]).flat();
  const payStatements: WorkforceDataset["payStatements"] = [];
  for (const [payIndex, payDate] of payDates.entries()) {
    for (const person of people) {
      const isHourly = Number(person.id.slice(-5)) % 1_000 < 3;
      const gross = (person.annualSalary ?? 0) / 24;
      const earnings: WorkforceDataset["payStatements"][number]["earnings"] = [
        { type: isHourly ? "wage" : "salary", amount: gross, hours: isHourly ? 80 : null },
      ];
      if (isHourly && payIndex % 4 === 0) earnings.push({ type: "overtime", amount: gross * 0.05, hours: 4 });
      payStatements.push({
        id: `${person.id}-${payDate}`,
        personId: person.id,
        payDate,
        earnings,
        employerTaxes: person.workerType === "Contingent" ? 0 : gross * 0.0765,
        employerContributions: person.workerType === "Contingent" ? 0 : gross * 0.1,
      });
    }
  }

  const absences: WorkforceDataset["absences"] = Array.from({ length: 20_000 }, (_, index) => ({
    id: `absence-${index}`,
    personId: people[index % people.length].id,
    startDate: isoDate(new Date(Date.UTC(2025, 0, 1) + (index % 730) * DAY_MS)),
    days: index % 10 === 0 ? 2 : 1,
    planned: index % 7 === 0,
    reason: index % 2 === 0 ? "Sick" : "Personal",
  }));
  const jobEvents: WorkforceDataset["jobEvents"] = Array.from({ length: 1_000 }, (_, index) => ({
    id: `event-${index}`,
    personId: people[(index + 100) % people.length].id,
    effectiveDate: isoDate(new Date(Date.UTC(2025, 0, 1) + (index % 730) * DAY_MS)),
    type: index % 2 === 0 ? "Promotion" : "Lateral transfer",
  }));
  const positions: WorkforceDataset["positions"] = people.map((person, index) => ({
    id: `position-${index}`,
    department: person.department,
    title: `Role ${index % 40}`,
    status: person.terminationDate === null ? "Filled" : "Open",
  }));
  const reviews: WorkforceDataset["reviews"] = people.map((person, index) => ({
    id: `review-${index}`,
    personId: person.id,
    cycle: index % 2 === 0 ? "2025 Annual" : "2026 Mid-year",
    status: index % 5 === 0 ? "In progress" : "Complete",
    rating: index % 3 === 0 ? "Exceeds" : index % 3 === 1 ? "Meets" : "Needs improvement",
  }));

  return {
    organization: {
      id: "org-scale",
      name: "Scale Test Organization",
      asOfDate: "2026-12-31",
      hrDepartment: "People",
      annualRevenue: 650_000_000,
    },
    people,
    absences,
    jobEvents,
    positions: [...positions, ...Array.from({ length: 100 }, (_, index) => ({
      id: `open-position-${index}`,
      department: departments[index % departments.length],
      title: `Open role ${index}`,
      status: "Open" as const,
    }))],
    reviews,
    pto: [],
    payStatements,
  };
}

describe("analytics scale", () => {
  it(
    "builds every LTM view for 5,000 employees in under five seconds",
    () => {
      const dataset = scaleDataset();
      expect(dataset.people).toHaveLength(5_000);
      expect(dataset.absences).toHaveLength(20_000);
      expect(dataset.payStatements.length).toBeGreaterThan(220_000);

      const period = periodFor("ltm", dataset.organization.asOfDate);
      const timings: { id: string; ms: number }[] = [];
      const totalStart = performance.now();
      for (const dashboard of DASHBOARDS) {
        for (const view of dashboard.views) {
          const start = performance.now();
          view.build(dataset, period);
          timings.push({ id: `${dashboard.id}/${view.id}`, ms: performance.now() - start });
        }
      }
      const total = performance.now() - totalStart;
      for (const timing of timings) console.info(`[scale] ${timing.id}: ${timing.ms.toFixed(1)} ms`);
      console.info(`[scale] total: ${total.toFixed(1)} ms`);
      console.info(`[scale] slowest: ${timings.toSorted((left, right) => right.ms - left.ms).slice(0, 5).map((timing) => `${timing.id} (${timing.ms.toFixed(1)} ms)`).join(", ")}`);
      expect(total).toBeLessThan(5_000);
    },
    60_000,
  );
});
