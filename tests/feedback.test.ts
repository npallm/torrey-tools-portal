import { describe, expect, it } from "vitest";
import {
  feedbackPeerError,
  feedbackResultsUnlocked,
  isFeedbackDirectManager,
  stableFeedbackOrder,
  suggestFeedbackPeers,
} from "@/lib/talent/feedback";

const people = [
  { id: "manager", managerId: null, department: "Ops", active: true, organizationId: "org" },
  { id: "subject", managerId: "manager", department: "Ops", active: true, organizationId: "org" },
  { id: "teammate", managerId: "manager", department: "Ops", active: true, organizationId: "org" },
  { id: "department-peer", managerId: "other-manager", department: "Ops", active: true, organizationId: "org" },
  { id: "inactive", managerId: "manager", department: "Ops", active: false, organizationId: "org" },
  { id: "other-org", managerId: "manager", department: "Ops", active: true, organizationId: "other" },
];

describe("peer feedback rules", () => {
  it("requires the direct manager and suggests teammates before department peers", () => {
    expect(isFeedbackDirectManager(["manager", "vp"], "manager")).toBe(true);
    expect(isFeedbackDirectManager(["manager", "vp"], "vp")).toBe(false);
    expect(suggestFeedbackPeers("subject", people)).toEqual(["teammate", "department-peer"]);
  });

  it("enforces distinct active same-organization peers and 2–10 recipients", () => {
    expect(feedbackPeerError([people[2], people[3]], "subject", "manager", "org")).toBeNull();
    expect(feedbackPeerError([people[2], people[2]], "subject", "manager", "org")).toContain("once");
    expect(feedbackPeerError([people[2]], "subject", "manager", "org")).toContain("2 and 10");
    expect(feedbackPeerError([people[2], people[4]], "subject", "manager", "org")).toContain("active");
    expect(feedbackPeerError([people[2], people[5]], "subject", "manager", "org")).toContain("organization");
  });

  it("unlocks at the configured minimum and orders responses by stable ID hashes", () => {
    expect(feedbackResultsUnlocked(2, 3)).toBe(false);
    expect(feedbackResultsUnlocked(3, 3)).toBe(true);
    expect(stableFeedbackOrder([{ id: "b" }, { id: "a" }])).toEqual(stableFeedbackOrder([{ id: "a" }, { id: "b" }]));
  });
});
