import { describe, expect, it } from "vitest";
import { shareScoresPayload, surveyScoresPayload } from "@/lib/surveys/publishing";

describe("survey publishing API payloads", () => {
  it("returns only counts while a survey is open", () => {
    const payload = surveyScoresPayload({
      id: "survey-1",
      status: "open",
      closesAt: "2026-12-01",
      invited: 10,
      responded: 6,
      responseRate: 60,
      departmentResponses: [],
      direct: [{ overall: 4.5 }],
      supOrgs: [{ overall: 4.2 }],
      questions: [{ prompt: "Sensitive" }],
    });
    expect(payload).toEqual({
      id: "survey-1",
      status: "open",
      closesAt: "2026-12-01",
      invited: 10,
      responded: 6,
      responseRate: 60,
      departmentResponses: [],
    });
  });

  it("returns only counts for an open manager share", () => {
    const payload = shareScoresPayload({
      title: "Manager pulse",
      status: "open",
      closesAt: null,
      managerName: "Jordan Reyes",
      invited: 8,
      responded: 4,
      responseRate: 50,
      scores: [{ overall: 4.5 }],
      questions: [{ prompt: "Sensitive" }],
    });
    expect(payload).toEqual({
      title: "Manager pulse",
      status: "open",
      closesAt: null,
      managerName: "Jordan Reyes",
      invited: 8,
      responded: 4,
      responseRate: 50,
    });
  });
});
