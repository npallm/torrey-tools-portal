import { describe, expect, it } from "vitest";
import {
  absenceRate,
  annualize,
  averageCompaRatio,
  averageHeadcount,
  averageTenureYears,
  burdenRate,
  laborCostIn,
  laborCostPerEmployee,
  laborCostToRevenue,
  overtimeShare,
  revenuePerEmployee,
  compaRatio,
  groupCompaRatio,
  headcountOn,
  hrStaffingRatio,
  monthSegments,
  movementRate,
  newHireTurnoverRate,
  rangePenetration,
  ratio,
  retentionRate,
  spanOfControl,
  turnoverRate,
  vacancyRate,
  weekdaysBetween,
} from "@/lib/metrics/calc";
import type { WorkforcePerson } from "@/lib/metrics/types";

let seq = 0;
function person(over: Partial<WorkforcePerson> = {}): WorkforcePerson {
  seq += 1;
  return {
    id: `p${seq}`,
    name: `Person ${seq}`,
    department: "Ops",
    location: "HQ",
    managerId: null,
    workerType: "Employee",
    fte: 1,
    hireDate: "2020-01-01",
    terminationDate: null,
    separationCategory: null,
    regrettable: null,
    annualSalary: null,
    payRangeMin: null,
    payRangeMid: null,
    payRangeMax: null,
    ...over,
  };
}
const jan = { start: "2026-01-01", end: "2026-01-31" };

describe("turnover", () => {
  it("matches the classic worked example: 9 leavers, 40 → 33 staff ≈ 24.7%", () => {
    const stayers = Array.from({ length: 31 }, () => person());
    const leavers = Array.from({ length: 9 }, (_, i) =>
      person({ terminationDate: `2026-01-${String(10 + i).padStart(2, "0")}`, separationCategory: "Quit" }),
    );
    const hires = [person({ hireDate: "2026-01-15" }), person({ hireDate: "2026-01-20" })];
    const people = [...stayers, ...leavers, ...hires];
    expect(headcountOn(people, jan.start)).toBe(40);
    expect(headcountOn(people, jan.end)).toBe(33);
    const r = turnoverRate(people, jan);
    expect(r.numerator).toBe(9);
    expect(r.denominator).toBe(36.5);
    expect(r.value).toBeCloseTo((9 / 36.5) * 100, 6);
    expect(turnoverRate(people, jan, { category: "Layoff/Discharge" }).numerator).toBe(0);
  });

  it("counts terminations on period boundaries and treats the last day as employed", () => {
    const a = person({ terminationDate: "2026-01-01", separationCategory: "Quit" });
    const b = person({ terminationDate: "2026-01-31", separationCategory: "Other" });
    const people = [a, b, person()];
    expect(headcountOn(people, "2026-01-01")).toBe(3);
    expect(headcountOn(people, "2026-01-31")).toBe(2);
    expect(turnoverRate(people, jan).numerator).toBe(2);
  });

  it("averages monthly averages across a multi-month period", () => {
    expect(monthSegments({ start: "2026-01-15", end: "2026-03-10" })).toEqual([
      { start: "2026-01-15", end: "2026-01-31" },
      { start: "2026-02-01", end: "2026-02-28" },
      { start: "2026-03-01", end: "2026-03-10" },
    ]);
    const people = [person(), person(), person({ terminationDate: "2026-01-20", separationCategory: "Quit" })];
    // Jan (3+2)/2 = 2.5, Feb (2+2)/2 = 2 → 2.25
    expect(averageHeadcount(people, { start: "2026-01-01", end: "2026-02-28" })).toBe(2.25);
  });

  it("excludes contingent workers unless asked", () => {
    const people = [person(), person({ workerType: "Contingent", terminationDate: "2026-01-05", separationCategory: "Other" })];
    expect(turnoverRate(people, jan).numerator).toBe(0);
    expect(turnoverRate(people, jan, { includeContingent: true }).numerator).toBe(1);
  });

  it("returns null instead of 0 when the denominator is zero", () => {
    expect(turnoverRate([], jan).value).toBeNull();
    expect(ratio(1, 0).value).toBeNull();
  });

  it("annualizes by 365 / days in period", () => {
    const r = annualize({ value: 10, numerator: 1, denominator: 10 }, { start: "2026-01-01", end: "2026-03-31" });
    expect(r.value).toBeCloseTo((10 * 365) / 90, 6);
  });
});

describe("retention and new-hire turnover", () => {
  it("measures the start-of-period cohort only", () => {
    const y = { start: "2026-01-01", end: "2026-12-31" };
    const people = [
      person(),
      person(),
      person({ terminationDate: "2026-06-30", separationCategory: "Quit" }),
      person({ hireDate: "2026-03-01" }),
    ];
    expect(retentionRate(people, y)).toEqual({ value: (2 / 3) * 100, numerator: 2, denominator: 3 });
  });

  it("counts hires in the period who also left in the period", () => {
    const y = { start: "2026-01-01", end: "2026-12-31" };
    const people = [
      person({ hireDate: "2026-02-01" }),
      person({ hireDate: "2026-03-01", terminationDate: "2026-05-01", separationCategory: "Quit" }),
      person({ hireDate: "2025-06-01", terminationDate: "2026-02-01", separationCategory: "Quit" }),
    ];
    expect(newHireTurnoverRate(people, y)).toEqual({ value: 50, numerator: 1, denominator: 2 });
  });
});

describe("compensation", () => {
  it("computes individual, group and average compa-ratios", () => {
    expect(compaRatio(35000, 30000)).toBeCloseTo(1.1667, 4);
    expect(compaRatio(null, 30000)).toBeNull();
    expect(compaRatio(1, 0)).toBeNull();
    const people = [
      person({ annualSalary: 50000, payRangeMid: 50000 }),
      person({ annualSalary: 90000, payRangeMid: 100000 }),
      person({ annualSalary: 70000, payRangeMid: null }),
    ];
    expect(groupCompaRatio(people).value).toBeCloseTo(140000 / 150000, 10);
    expect(averageCompaRatio(people).value).toBeCloseTo((1 + 0.9) / 2, 10);
  });

  it("computes range penetration", () => {
    expect(rangePenetration(60000, 40000, 80000)).toBe(0.5);
    expect(rangePenetration(60000, 50000, 50000)).toBeNull();
  });
});

describe("absence", () => {
  it("counts weekdays inclusively", () => {
    expect(weekdaysBetween("2026-11-02", "2026-11-08")).toBe(5); // Mon–Sun
  });

  it("matches brute-force weekday counts for every date pair in a 60-day window", () => {
    const dateAt = (offset: number) =>
      new Date(Date.parse("2026-01-01T00:00:00Z") + offset * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    const bruteForceWeekdays = (start: string, end: string) => {
      let count = 0;
      for (
        let time = Date.parse(`${start}T00:00:00Z`);
        time <= Date.parse(`${end}T00:00:00Z`);
        time += 24 * 60 * 60 * 1000
      ) {
        const day = new Date(time).getUTCDay();
        if (day !== 0 && day !== 6) count++;
      }
      return count;
    };

    for (let start = 0; start < 60; start++) {
      for (let end = 0; end < 60; end++) {
        const startDate = dateAt(start);
        const endDate = dateAt(end);
        expect(weekdaysBetween(startDate, endDate)).toBe(bruteForceWeekdays(startDate, endDate));
      }
    }
  });

  it("divides unplanned days by FTE-weighted scheduled workdays", () => {
    const a = person({ id: "a" });
    const b = person({ id: "b", fte: 0.5 });
    const c = person({ id: "c", hireDate: "2026-01-16" });
    const absences = [
      { id: "x1", personId: "a", startDate: "2026-01-05", days: 2, planned: false, reason: "Sick" },
      { id: "x2", personId: "b", startDate: "2026-01-06", days: 1, planned: false, reason: "Sick" },
      { id: "x3", personId: "a", startDate: "2026-01-07", days: 3, planned: true, reason: "Vacation" },
      { id: "x4", personId: "a", startDate: "2026-02-02", days: 1, planned: false, reason: "Sick" },
    ];
    // Jan 2026 has 22 weekdays; c works Jan 16–31 = 11 weekdays → 22 + 11 + 11 = 44
    const r = absenceRate([a, b, c], absences, jan);
    expect(r.numerator).toBe(3);
    expect(r.denominator).toBe(44);
    expect(r.value).toBeCloseTo((3 / 44) * 100, 10);
  });
});

describe("structure and movement", () => {
  it("computes span of control over active managers and reports", () => {
    const m1 = person({ id: "m1" });
    const m2 = person({ id: "m2", terminationDate: "2025-12-31", separationCategory: "Quit" });
    const people = [
      m1,
      m2,
      person({ managerId: "m1" }),
      person({ managerId: "m1", workerType: "Contingent" }),
      person({ managerId: "m2" }),
      person({ managerId: "m1", terminationDate: "2025-06-30", separationCategory: "Quit" }),
    ];
    const r = spanOfControl(people, "2026-01-15");
    expect(r.value).toBe(2);
    expect(r.byManager).toEqual([{ managerId: "m1", directs: 2 }]);
  });

  it("computes tenure, vacancy, movement and HR staffing", () => {
    expect(averageTenureYears([person({ hireDate: "2024-01-01" })], "2026-01-01").value).toBeCloseTo(731 / 365.25, 10);
    expect(
      vacancyRate([
        { id: "1", department: "Ops", title: "A", status: "Open" },
        { id: "2", department: "Ops", title: "B", status: "Filled" },
        { id: "3", department: "Ops", title: "C", status: "Filled" },
        { id: "4", department: "Ops", title: "D", status: "Filled" },
      ]).value,
    ).toBe(25);
    const people = [person({ id: "e1" }), person({ id: "e2" }), person({ id: "e3" }), person({ id: "e4" })];
    const y = { start: "2026-01-01", end: "2026-12-31" };
    const events = [
      { id: "j1", personId: "e1", effectiveDate: "2026-03-01", type: "Promotion" as const },
      { id: "j2", personId: "e2", effectiveDate: "2026-04-01", type: "Lateral transfer" as const },
      { id: "j3", personId: "e3", effectiveDate: "2025-04-01", type: "Promotion" as const },
    ];
    expect(movementRate(people, events, y, ["Promotion"]).value).toBe(25);
    expect(movementRate(people, events, y, ["Promotion", "Lateral transfer"]).value).toBe(50);
    const staff = [person({ department: "People", fte: 0.5 }), ...Array.from({ length: 9 }, () => person())];
    expect(hrStaffingRatio(staff, "2026-01-01", "People").value).toBeCloseTo((0.5 / 9.5) * 100, 10);
  });
});

describe("labor cost (read-only payroll)", () => {
  const stmts = [
    {
      id: "s1",
      personId: "a",
      payDate: "2026-01-15",
      earnings: [
        { type: "salary" as const, amount: 4000, hours: 80 },
        { type: "overtime" as const, amount: 500, hours: 5 },
        { type: "reimbursement" as const, amount: 200, hours: null },
      ],
      employerTaxes: 400,
      employerContributions: 600,
    },
    {
      id: "s2",
      personId: "b",
      payDate: "2026-01-30",
      earnings: [{ type: "wage" as const, amount: 1500, hours: 60 }],
      employerTaxes: 100,
      employerContributions: 0,
    },
    { id: "s3", personId: "a", payDate: "2026-02-15", earnings: [{ type: "salary" as const, amount: 4000, hours: 80 }], employerTaxes: 400, employerContributions: 600 },
  ];

  it("sums wages (excl. reimbursements), employer taxes and contributions by pay date", () => {
    expect(laborCostIn(stmts, jan)).toEqual({ wages: 6000, employerTaxes: 500, employerContributions: 600, total: 7100 });
    expect(laborCostIn(stmts, jan, new Set(["b"])).total).toBe(1600);
  });

  it("computes overtime share, burden rate and revenue ratios", () => {
    expect(overtimeShare(stmts, jan).value).toBeCloseTo((500 / 6000) * 100, 10);
    expect(burdenRate(laborCostIn(stmts, jan)).value).toBeCloseTo((1100 / 6000) * 100, 10);
    expect(laborCostToRevenue(laborCostIn(stmts, jan), jan, 1_000_000).value).toBeCloseTo(((7100 * 365) / 31 / 1_000_000) * 100, 10);
    expect(laborCostToRevenue(laborCostIn(stmts, jan), jan, null).value).toBeNull();
    const people = [person({ id: "a" }), person({ id: "b", fte: 0.5 })];
    expect(revenuePerEmployee(people, jan, 1_000_000).value).toBe(500_000);
    expect(laborCostPerEmployee(people, stmts, jan).value).toBeCloseTo(((7100 / 2) * 365) / 31, 6);
  });
});
