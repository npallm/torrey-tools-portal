import { describe, expect, it } from "vitest";
import { DASHBOARDS, dataCoverage, periodFor } from "../lib/metrics/views";
import type { PeriodKind } from "../lib/metrics/views";
import { seedWorkforce } from "../lib/seed/workforce";
import type { WorkforceDataset } from "../lib/metrics/types";

const periods: PeriodKind[] = ["ltm", "ytd", "prior-year"];

describe("metric dashboard views", () => {
  for (const dashboard of DASHBOARDS) {
    for (const view of dashboard.views) {
      for (const kind of periods) {
        it(`${dashboard.id}/${view.id} builds for ${kind}`, () => {
          const result = view.build(
            seedWorkforce,
            periodFor(kind, seedWorkforce.organization.asOfDate),
          );
          expect(view.formats.length).toBeGreaterThan(0);
          expect(new Set(result.series.map((datum) => datum.label)).size).toBe(
            result.series.length,
          );
          for (const datum of result.series) expect(Number.isFinite(datum.value)).toBe(true);
          for (const kpi of result.kpis) {
            if (kpi.value !== null) expect(Number.isFinite(kpi.value)).toBe(true);
          }
        });
      }
    }
  }

  it("builds every view safely with minimal employee data and reports missing coverage", () => {
    const minimal: WorkforceDataset = {
      organization: {
        id: "small-org",
        name: "Small org",
        asOfDate: "2026-11-08",
        hrDepartment: "People",
        annualRevenue: null,
      },
      people: [
        {
          id: "person-1",
          name: "Avery",
          department: "Operations",
          location: "Unknown",
          managerId: null,
          workerType: "Employee",
          fte: 1,
          hireDate: "2024-01-01",
          terminationDate: null,
          separationCategory: null,
          regrettable: null,
          annualSalary: null,
          payRangeMin: null,
          payRangeMid: null,
          payRangeMax: null,
        },
      ],
      absences: [],
      jobEvents: [],
      positions: [],
      reviews: [],
      pto: [],
      payStatements: [],
    };
    const coverage = dataCoverage(minimal);
    expect(Object.values(coverage).every((available) => !available)).toBe(true);

    for (const dashboard of DASHBOARDS) {
      for (const view of dashboard.views) {
        const result = view.build(minimal, periodFor("ltm", minimal.organization.asOfDate));
        for (const datum of result.series) expect(Number.isFinite(datum.value)).toBe(true);
        for (const item of result.kpis) {
          if (item.value !== null) expect(Number.isFinite(item.value)).toBe(true);
        }
      }
    }
  });
});
