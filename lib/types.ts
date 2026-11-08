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

export type PerformanceReview = {
  id: string;
  employeeId: string;
  period: string;
  dueDate: string;
  status: "Not started" | "In progress" | "Complete";
  rating?: "Exceeds" | "Meets" | "Needs improvement";
};
