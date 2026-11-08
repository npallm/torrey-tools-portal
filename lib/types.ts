export type Employee = {
  id: string;
  name: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  location: string;
  startDate: string;
  employmentType: "Full-time" | "Part-time" | "Contract";
  manager: string | null;
  status: "Active" | "On leave" | "Offboarding";
  annualSalary: number;
  payRangeMidpoint: number;
};

export type PtoRequest = {
  id: string;
  employeeId: string;
  type: "Vacation" | "Sick" | "Personal" | "Holiday";
  startDate: string;
  endDate: string;
  days: number;
  status: "Pending" | "Approved" | "Denied";
  note?: string;
};

export type HrDocument = {
  id: string;
  title: string;
  category: "Policy" | "Handbook" | "Form" | "Template" | "Compliance";
  updatedAt: string;
  owner: string;
};

export type OnboardingTask = {
  id: string;
  employeeId: string;
  label: string;
  dueDate: string;
  done: boolean;
};

export type Separation = {
  id: string;
  name: string;
  department: string;
  endDate: string;
  reason: "Voluntary" | "Involuntary" | "Contract end";
};

export type ChangeRequestType =
  | "Title change"
  | "Compensation change"
  | "Department transfer"
  | "Schedule change"
  | "Manager change"
  | "Status change";

export type ChangeRequest = {
  id: string;
  employeeId: string;
  type: ChangeRequestType;
  details: string;
  submittedBy: string;
  submittedAt: string;
  status: "Pending" | "Approved" | "Denied";
};

export type FinchDirectoryEntry = {
  id: string;
  firstName: string;
  lastName: string;
  department: string | null;
  title: string | null;
  isActive: boolean;
};

export type PerformanceReview = {
  id: string;
  employeeId: string;
  period: string;
  dueDate: string;
  status: "Not started" | "In progress" | "Complete";
  rating?: "Exceeds" | "Meets" | "Needs improvement";
};
