import { describe, expect, it } from "vitest";
import {
  benchCoverage,
  benchStrength,
  performanceTrend,
  potentialSegment,
  riskBand,
  roleRiskScore,
  singlePointsOfFailure,
  suggestedProbabilityOfLoss,
} from "@/lib/talent/succession";
import { actionItemStatus, oneOnOneHealth } from "@/lib/talent/oneOnOnes";
import { calibrationShift, goalAttainment, proposedRating, ratingDistribution, selfManagerGap, weightedScore } from "@/lib/talent/reviews";

describe("succession", () => {
  it("scores role risk and bench strength", () => {
    expect(roleRiskScore(5, 3)).toBe(15);
    expect(riskBand(15)).toBe("High");
    expect(riskBand(8)).toBe("Medium");
    expect(riskBand(7)).toBe("Low");
    expect(suggestedProbabilityOfLoss("low", true)).toBe(4);
    expect(benchStrength([]).label).toBe("None");
    expect(benchStrength([{ readiness: "ready_3_plus_years" }])).toMatchObject({ covered: false, label: "Thin" });
    expect(benchStrength([{ readiness: "ready_1_2_years" }, { readiness: "ready_1_2_years" }])).toMatchObject({ covered: true, label: "Adequate" });
    expect(benchStrength([{ readiness: "ready_now" }, { readiness: "ready_1_2_years" }]).label).toBe("Strong");
    const roles = [
      { roleId: "a", riskScore: 20, bench: benchStrength([]) },
      { roleId: "b", riskScore: 20, bench: benchStrength([{ readiness: "ready_now" }]) },
      { roleId: "c", riskScore: 4, bench: benchStrength([]) },
    ];
    expect(benchCoverage(roles)).toBeCloseTo(100 / 3, 10);
    expect(benchCoverage([])).toBeNull();
    expect(singlePointsOfFailure(roles).map((r) => r.roleId)).toEqual(["a"]);
  });

  it("segments potential and performance trend", () => {
    expect(potentialSegment({ aspiration: 3, ability: 3, engagement: 3 })).toBe("High potential");
    expect(potentialSegment({ aspiration: 3, ability: 2, engagement: 2 })).toBe("Emerging");
    expect(potentialSegment({ aspiration: 3, ability: 3, engagement: 1 })).toBe("Developing");
    expect(performanceTrend([3])).toBe("Insufficient data");
    expect(performanceTrend([3, 3.5])).toBe("Rising");
    expect(performanceTrend([4, 3.6])).toBe("Steady");
    expect(performanceTrend([4, 3])).toBe("Declining");
  });
});

describe("1:1s", () => {
  it("computes status and 90-day adherence", () => {
    const s = { cadenceDays: 14, startedOn: "2026-01-01" };
    expect(oneOnOneHealth(s, ["2026-11-01"], "2026-11-08")).toMatchObject({ lastHeld: "2026-11-01", daysSinceLast: 7, status: "On track" });
    expect(oneOnOneHealth(s, ["2026-10-20"], "2026-11-08").status).toBe("Due");
    expect(oneOnOneHealth(s, ["2026-10-01"], "2026-11-08").status).toBe("Overdue");
    expect(oneOnOneHealth({ cadenceDays: 14, startedOn: "2026-11-01" }, [], "2026-11-08")).toMatchObject({ status: "Not started", adherence90: null });
    // window 2026-08-11..2026-11-08 = 90 days → expected 6; 3 held in window, 1 before
    expect(oneOnOneHealth(s, ["2026-07-01", "2026-09-01", "2026-10-01", "2026-11-01"], "2026-11-08").adherence90).toBe(50);
    expect(actionItemStatus({ dueDate: "2026-11-01", completedAt: null }, "2026-11-08")).toBe("Overdue");
    expect(actionItemStatus({ dueDate: null, completedAt: null }, "2026-11-08")).toBe("Open");
    expect(actionItemStatus({ dueDate: "2026-11-01", completedAt: "2026-11-02" }, "2026-11-08")).toBe("Done");
  });
});

describe("reviews", () => {
  it("computes weighted scores, goals, gaps and calibration", () => {
    expect(weightedScore([{ weight: 2, rating: 4 }, { weight: 1, rating: 1 }, { weight: 1, rating: null }])).toBe(3);
    expect(weightedScore([{ weight: 1, rating: null }])).toBeNull();
    expect(goalAttainment([{ weight: 1, progressPct: 120 }, { weight: 3, progressPct: 50 }])).toBe(62.5);
    expect(selfManagerGap(4, 3)).toBe(-1);
    expect(ratingDistribution([1, 3.4, 3.6, 5], [1, 2, 3, 4, 5]).map((d) => d.count)).toEqual([1, 0, 1, 1, 1]);
    expect(calibrationShift([{ proposed: 3, calibrated: 4 }, { proposed: 4, calibrated: 3 }, { proposed: 3, calibrated: 3 }, { proposed: null, calibrated: 2 }])).toEqual({
      raised: 1,
      lowered: 1,
      unchanged: 1,
      averageShift: 0,
    });
  });

  it("blends manager scores with goal attainment and rounds proposed ratings", () => {
    expect(
      proposedRating({
        managerItems: [{ weight: 2, rating: 4.25 }, { weight: 1, rating: 3.5 }],
        goals: [{ weight: 2, progressPct: 80 }, { weight: 1, progressPct: 40 }],
        includeGoals: true,
        goalsWeight: 30,
        scaleMin: 1,
        scaleMax: 5,
      }),
    ).toBe(3.9);
    expect(
      proposedRating({
        managerItems: [{ weight: 1, rating: 3.456 }],
        goals: [],
        includeGoals: false,
        goalsWeight: 30,
        scaleMin: 1,
        scaleMax: 5,
      }),
    ).toBe(3.46);
    expect(
      proposedRating({
        managerItems: [{ weight: 1, rating: 4 }],
        goals: [],
        includeGoals: true,
        goalsWeight: 30,
        scaleMin: 1,
        scaleMax: 5,
      }),
    ).toBeNull();
  });
});
