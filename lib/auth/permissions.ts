export type PermissionUser = {
  role: "consultant" | "client_admin" | "manager" | "employee";
};

export function isAdmin(user: PermissionUser | null | undefined): boolean {
  return user?.role === "client_admin" || user?.role === "consultant";
}

export const canAccessOutbox = isAdmin;
export const canManageSurveys = isAdmin;
export const canViewAnalytics = isAdmin;
export const canManageReviews = isAdmin;
export const canViewSuccession = isAdmin;
export const canManageSso = isAdmin;
export const canManageApprovalTemplates = isAdmin;

export function canSubmitChangeRequest(user: PermissionUser | null | undefined): boolean {
  return isAdmin(user) || user?.role === "manager";
}

export function managesWorker(managerChain: string[], managerWorkerId: string): boolean {
  return managerChain.includes(managerWorkerId);
}
