type DepartmentResponseCounts = {
  department: string;
  suppressed: boolean;
  invited: number | null;
  responded: number | null;
  responseRate: number | null;
};

export function surveyScoresPayload<T extends {
  id: string;
  status: string;
  closesAt: string | null;
  invited: number;
  responded: number;
  responseRate: number | null;
  departmentResponses: DepartmentResponseCounts[];
}>(survey: T) {
  if (survey.status !== "open") return survey;
  return {
    id: survey.id,
    status: survey.status,
    closesAt: survey.closesAt,
    invited: survey.invited,
    responded: survey.responded,
    responseRate: survey.responseRate,
    departmentResponses: survey.departmentResponses,
  };
}

export function shareScoresPayload<T extends {
  title: string;
  status: string;
  closesAt: string | null;
  managerName: string;
  invited: number;
  responded: number;
  responseRate: number | null;
}>(share: T) {
  if (share.status !== "open") return share;
  return {
    title: share.title,
    status: share.status,
    closesAt: share.closesAt,
    managerName: share.managerName,
    invited: share.invited,
    responded: share.responded,
    responseRate: share.responseRate,
  };
}
