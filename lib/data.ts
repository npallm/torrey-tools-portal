import {
  ChangeRequest,
  Employee,
  HrDocument,
  OnboardingTask,
  PerformanceReview,
  PtoRequest,
  Separation,
} from "./types";

// Seed data for the portal shell. Swap these reads for Supabase queries once
// the backend is provisioned — keep the function signatures the same.

export const employees: Employee[] = [
  {
    id: "emp-001",
    name: "Maya Chen",
    title: "Operations Manager",
    department: "Operations",
    email: "maya.chen@example.com",
    phone: "(619) 555-0110",
    location: "San Diego, CA",
    startDate: "2023-02-13",
    employmentType: "Full-time",
    manager: null,
    status: "Active",
    annualSalary: 98000,
    payRangeMidpoint: 95000,
  },
  {
    id: "emp-002",
    name: "Jordan Reyes",
    title: "HR Coordinator",
    department: "People",
    email: "jordan.reyes@example.com",
    phone: "(619) 555-0142",
    location: "San Diego, CA",
    startDate: "2024-06-03",
    employmentType: "Full-time",
    manager: "Maya Chen",
    status: "Active",
    annualSalary: 62000,
    payRangeMidpoint: 68000,
  },
  {
    id: "emp-003",
    name: "Priya Nair",
    title: "Office Administrator",
    department: "Operations",
    email: "priya.nair@example.com",
    phone: "(858) 555-0177",
    location: "Remote",
    startDate: "2025-01-20",
    employmentType: "Part-time",
    manager: "Maya Chen",
    status: "On leave",
    annualSalary: 45000,
    payRangeMidpoint: 47000,
  },
  {
    id: "emp-004",
    name: "Sam Whitaker",
    title: "Consultant",
    department: "Client Services",
    email: "sam.whitaker@example.com",
    phone: "(760) 555-0129",
    location: "Carlsbad, CA",
    startDate: "2022-09-06",
    employmentType: "Contract",
    manager: "Maya Chen",
    status: "Active",
    annualSalary: 115000,
    payRangeMidpoint: 105000,
  },
  {
    id: "emp-005",
    name: "Alana Brooks",
    title: "People Associate",
    department: "People",
    email: "alana.brooks@example.com",
    phone: "(619) 555-0198",
    location: "San Diego, CA",
    startDate: "2026-10-27",
    employmentType: "Full-time",
    manager: "Jordan Reyes",
    status: "Active",
    annualSalary: 58000,
    payRangeMidpoint: 60000,
  },
];

export const separations: Separation[] = [
  {
    id: "sep-001",
    name: "Dana Okafor",
    department: "Client Services",
    endDate: "2026-03-14",
    reason: "Voluntary",
  },
  {
    id: "sep-002",
    name: "Luis Herrera",
    department: "Operations",
    endDate: "2026-06-30",
    reason: "Contract end",
  },
  {
    id: "sep-003",
    name: "Emily Tran",
    department: "People",
    endDate: "2026-09-19",
    reason: "Voluntary",
  },
];

export const changeRequests: ChangeRequest[] = [
  {
    id: "cr-001",
    employeeId: "emp-002",
    type: "Title change",
    details: "Promote to Senior HR Coordinator after cert completion",
    submittedBy: "Maya Chen",
    submittedAt: "2026-11-05",
    status: "Pending",
  },
  {
    id: "cr-002",
    employeeId: "emp-004",
    type: "Schedule change",
    details: "Move to 4x10 schedule starting December",
    submittedBy: "Sam Whitaker",
    submittedAt: "2026-11-06",
    status: "Approved",
  },
];

export const ptoRequests: PtoRequest[] = [
  {
    id: "pto-001",
    employeeId: "emp-002",
    type: "Vacation",
    startDate: "2026-11-25",
    endDate: "2026-11-27",
    days: 3,
    status: "Pending",
    note: "Thanksgiving week",
  },
  {
    id: "pto-002",
    employeeId: "emp-003",
    type: "Sick",
    startDate: "2026-11-02",
    endDate: "2026-11-14",
    days: 10,
    status: "Approved",
  },
  {
    id: "pto-003",
    employeeId: "emp-004",
    type: "Personal",
    startDate: "2026-12-22",
    endDate: "2026-12-23",
    days: 2,
    status: "Pending",
  },
  {
    id: "pto-004",
    employeeId: "emp-001",
    type: "Vacation",
    startDate: "2026-08-10",
    endDate: "2026-08-14",
    days: 5,
    status: "Approved",
  },
];

export const documents: HrDocument[] = [
  {
    id: "doc-001",
    title: "Employee Handbook 2026",
    category: "Handbook",
    updatedAt: "2026-10-01",
    owner: "People Team",
  },
  {
    id: "doc-002",
    title: "Remote Work Policy",
    category: "Policy",
    updatedAt: "2026-09-15",
    owner: "People Team",
  },
  {
    id: "doc-003",
    title: "PTO Request Form",
    category: "Form",
    updatedAt: "2026-08-02",
    owner: "HR Ops",
  },
  {
    id: "doc-004",
    title: "New Hire Onboarding Checklist",
    category: "Template",
    updatedAt: "2026-10-20",
    owner: "HR Ops",
  },
  {
    id: "doc-005",
    title: "CA Harassment Prevention Training Log",
    category: "Compliance",
    updatedAt: "2026-10-30",
    owner: "People Team",
  },
  {
    id: "doc-006",
    title: "Performance Review Template",
    category: "Template",
    updatedAt: "2026-07-11",
    owner: "People Team",
  },
];

export const onboardingTasks: OnboardingTask[] = [
  {
    id: "ob-001",
    employeeId: "emp-005",
    label: "Sign offer letter & I-9 verification",
    dueDate: "2026-10-28",
    done: true,
  },
  {
    id: "ob-002",
    employeeId: "emp-005",
    label: "Complete handbook acknowledgment",
    dueDate: "2026-11-03",
    done: true,
  },
  {
    id: "ob-003",
    employeeId: "emp-005",
    label: "Set up email and portal accounts",
    dueDate: "2026-11-05",
    done: false,
  },
  {
    id: "ob-004",
    employeeId: "emp-005",
    label: "30-day check-in with manager",
    dueDate: "2026-11-26",
    done: false,
  },
];

export const reviews: PerformanceReview[] = [
  {
    id: "rev-001",
    employeeId: "emp-001",
    period: "2026 Annual",
    dueDate: "2026-12-15",
    status: "In progress",
  },
  {
    id: "rev-002",
    employeeId: "emp-002",
    period: "2026 Annual",
    dueDate: "2026-12-15",
    status: "Not started",
  },
  {
    id: "rev-003",
    employeeId: "emp-004",
    period: "2026 Annual",
    dueDate: "2026-12-15",
    status: "Complete",
    rating: "Exceeds",
  },
];

export function compaRatio(e: Employee): number {
  return e.annualSalary / e.payRangeMidpoint;
}

export function employeeById(id: string): Employee | undefined {
  return employees.find((e) => e.id === id);
}

export function employeeName(id: string): string {
  return employeeById(id)?.name ?? "Unknown";
}
