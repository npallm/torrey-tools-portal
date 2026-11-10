import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock, revalidatePathMock, saveApprovalTemplateMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { location: path });
  }),
  revalidatePathMock: vi.fn(),
  saveApprovalTemplateMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/server/changeRequests", () => ({
  archiveApprovalTemplate: vi.fn(),
  reassignChangeRequestStep: vi.fn(),
  saveApprovalTemplate: saveApprovalTemplateMock,
  submitChangeRequest: vi.fn(),
  withdrawChangeRequest: vi.fn(),
}));

import { saveApprovalTemplateAction } from "@/app/requests/actions";

describe("approval template server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets the successful redirect escape instead of converting it into an error redirect", async () => {
    saveApprovalTemplateMock.mockResolvedValue("template-123");
    const formData = new FormData();
    formData.set("name", "Test template");
    formData.set("changeType", "title");
    formData.set("steps", JSON.stringify([{ kind: "worker", workerId: "worker-1" }]));

    await expect(saveApprovalTemplateAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/approvals/templates?saved=template-123");
  });
});
