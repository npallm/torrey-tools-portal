import type { CurrentUser } from "./session-core";

export function isIntendedWorker(user: CurrentUser, workerId: string | null | undefined) {
  return !!workerId && user.workerId === workerId;
}

export function assertIntendedWorker(user: CurrentUser, workerId: string | null | undefined) {
  if (!isIntendedWorker(user, workerId)) {
    throw new Error("This link belongs to another person.");
  }
}
