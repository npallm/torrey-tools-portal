import { describe, expect, it } from "vitest";
import { matchesFilter, TENURE_BANDS, tenureBand } from "@/lib/surveys/results";
import type { RespondentAttributes } from "@/lib/surveys/types";
import { managerChain, supOrgMembers, supOrgs } from "@/lib/org/hierarchy";

const respondent: RespondentAttributes = {
  division: "Ops",
  department: "Ops A",
  location: "HQ",
  workerType: "Employee",
  tenureBand: "1–2 yrs",
  managerChain: ["m1", "ceo"],
};

describe("survey filters", () => {
  it("keeps the tenure labels and bands dates consistently", () => {
    expect(TENURE_BANDS).toEqual(["< 1 yr", "1–2 yrs", "3–5 yrs", "6+ yrs"]);
    expect(tenureBand("2026-01-01", "2026-11-08")).toBe("< 1 yr");
    expect(tenureBand("2024-01-01", "2026-11-08")).toBe("1–2 yrs");
    expect(tenureBand("2021-01-01", "2026-11-08")).toBe("3–5 yrs");
    expect(tenureBand("2015-01-01", "2026-11-08")).toBe("6+ yrs");
  });

  it("matches attribute and supervisory-organization filters", () => {
    expect(matchesFilter(respondent)).toBe(true);
    expect(matchesFilter(respondent, { supOrgLeaderId: "ceo", department: "Ops A" })).toBe(true);
    expect(matchesFilter(respondent, { supOrgLeaderId: "m2" })).toBe(false);
    expect(matchesFilter(respondent, { location: "Remote" })).toBe(false);
    expect(matchesFilter(respondent, { workerType: "Contractor" })).toBe(false);
    expect(matchesFilter(respondent, { tenureBand: "3–5 yrs" })).toBe(false);
  });
});

describe("hierarchy", () => {
  const people = [
    { id: "ceo", name: "Ceo", managerId: null },
    { id: "m1", name: "Mia", managerId: "ceo" },
    { id: "a", name: "A", managerId: "m1" },
    { id: "b", name: "B", managerId: "a" },
    { id: "x", name: "X", managerId: "y" },
    { id: "y", name: "Y", managerId: "x" },
  ];

  it("walks chains, handles cycles, and lists sup orgs", () => {
    expect(managerChain("b", people)).toEqual(["a", "m1", "ceo"]);
    expect(managerChain("x", people)).toEqual(["y"]);
    expect(supOrgMembers("m1", people).sort()).toEqual(["a", "b"]);
    expect(supOrgs(people).map((org) => [org.leaderId, org.size])).toEqual([
      ["ceo", 3],
      ["m1", 2],
      ["a", 1],
      ["x", 1],
      ["y", 1],
    ]);
  });
});
