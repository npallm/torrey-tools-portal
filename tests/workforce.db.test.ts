import { describe, expect, it } from "vitest";
import { getWorkforceDataset } from "../lib/workforce";
import { DASHBOARDS, periodFor } from "../lib/metrics/views";
import type { PeriodKind } from "../lib/metrics/views";
import { seedWorkforce } from "../lib/seed/workforce";

const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;
const periods: PeriodKind[] = ["ltm", "ytd", "prior-year"];

function expectViewResultsClose(
  actual: ReturnType<(typeof DASHBOARDS)[number]["views"][number]["build"]>,
  expected: ReturnType<(typeof DASHBOARDS)[number]["views"][number]["build"]>,
  context: string,
) {
  expect(actual.unit, `${context} unit`).toBe(expected.unit);
  expect(actual.series, `${context} series length`).toHaveLength(expected.series.length);
  for (const [index, datum] of actual.series.entries()) {
    const expectedDatum = expected.series[index];
    expect(datum.label, `${context} series ${index} label`).toBe(expectedDatum.label);
    expect(datum.value, `${context} series ${index} value`).toBeCloseTo(expectedDatum.value, 8);
    expect(datum.hint, `${context} series ${index} hint`).toBe(expectedDatum.hint);
  }
  expect(actual.kpis, `${context} KPI length`).toHaveLength(expected.kpis.length);
  for (const [index, item] of actual.kpis.entries()) {
    const expectedItem = expected.kpis[index];
    expect(item.label, `${context} KPI ${index} label`).toBe(expectedItem.label);
    expect(item.unit, `${context} KPI ${index} unit`).toBe(expectedItem.unit);
    expect(item.detail, `${context} KPI ${index} detail`).toBe(expectedItem.detail);
    if (expectedItem.value === null) {
      expect(item.value, `${context} KPI ${index} value`).toBeNull();
    } else {
      expect(item.value, `${context} KPI ${index} value`).toBeCloseTo(expectedItem.value, 8);
    }
  }
  expect(actual.referenceLines, `${context} reference lines`).toEqual(expected.referenceLines);
}

databaseDescribe("Postgres workforce round trip", () => {
  it("matches seed output for every dashboard view and period", async () => {
    const { dataset, source } = await getWorkforceDataset();
    expect(source).toBe("postgres");
    for (const dashboard of DASHBOARDS) {
      for (const view of dashboard.views) {
        for (const kind of periods) {
          const period = periodFor(kind, seedWorkforce.organization.asOfDate);
          expectViewResultsClose(
            view.build(dataset, period),
            view.build(seedWorkforce, period),
            `${dashboard.id}/${view.id}/${kind}`,
          );
        }
      }
    }
  });
});
