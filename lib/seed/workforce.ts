import { employees, ptoRequests, reviews } from "../data";
import type {
  AbsenceRecord,
  JobEvent,
  PayStatementRecord,
  PositionRecord,
  PtoRecord,
  ReviewRecord,
  WorkforceDataset,
  WorkforcePerson,
} from "../metrics/types";

const asOfDate = "2026-11-08";

const basePersonIds = new Map(employees.map((person) => [person.name, person.id]));

const basePeople: WorkforcePerson[] = employees.map((employee) => {
  const midpoint = employee.payRangeMidpoint;
  return {
    id: employee.id,
    name: employee.name,
    department: employee.department,
    location: employee.location,
    managerId: employee.manager ? basePersonIds.get(employee.manager) ?? null : null,
    workerType: employee.employmentType === "Contract" ? "Contingent" : "Employee",
    fte: employee.employmentType === "Part-time" ? 0.5 : 1,
    hireDate: employee.startDate,
    terminationDate: null,
    separationCategory: null,
    regrettable: null,
    annualSalary: employee.annualSalary,
    payRangeMin: Math.round(midpoint * 0.8),
    payRangeMid: midpoint,
    payRangeMax: Math.round(midpoint * 1.2),
  };
});

type AdditionalPerson = WorkforcePerson & { title: string };

const additionalPeople: AdditionalPerson[] = [
  {
    id: "emp-006",
    name: "Dana Okafor",
    title: "Senior Client Partner",
    department: "Client Services",
    location: "Carlsbad, CA",
    managerId: "emp-012",
    workerType: "Employee",
    fte: 1,
    hireDate: "2021-05-10",
    terminationDate: "2026-03-14",
    separationCategory: "Quit",
    regrettable: true,
    annualSalary: 102000,
    payRangeMin: 88000,
    payRangeMid: 110000,
    payRangeMax: 132000,
  },
  {
    id: "emp-007",
    name: "Luis Herrera",
    title: "Field Consultant",
    department: "Operations",
    location: "Oceanside, CA",
    managerId: "emp-009",
    workerType: "Contingent",
    fte: 1,
    hireDate: "2022-09-01",
    terminationDate: "2026-06-30",
    separationCategory: "Other",
    regrettable: false,
    annualSalary: 84000,
    payRangeMin: 64000,
    payRangeMid: 80000,
    payRangeMax: 96000,
  },
  {
    id: "emp-008",
    name: "Emily Tran",
    title: "People Partner",
    department: "People",
    location: "San Diego, CA",
    managerId: "emp-002",
    workerType: "Employee",
    fte: 1,
    hireDate: "2020-02-03",
    terminationDate: "2026-09-19",
    separationCategory: "Quit",
    regrettable: true,
    annualSalary: 96000,
    payRangeMin: 76800,
    payRangeMid: 96000,
    payRangeMax: 115200,
  },
  {
    id: "emp-009",
    name: "Marcus Lee",
    title: "Operations Lead",
    department: "Operations",
    location: "San Diego, CA",
    managerId: "emp-001",
    workerType: "Employee",
    fte: 1,
    hireDate: "2019-08-12",
    terminationDate: null,
    separationCategory: null,
    regrettable: null,
    annualSalary: 93000,
    payRangeMin: 74400,
    payRangeMid: 93000,
    payRangeMax: 111600,
  },
  {
    id: "emp-010",
    name: "Olivia Grant",
    title: "Finance Manager",
    department: "Finance",
    location: "San Diego, CA",
    managerId: "emp-001",
    workerType: "Employee",
    fte: 1,
    hireDate: "2020-06-08",
    terminationDate: null,
    separationCategory: null,
    regrettable: null,
    annualSalary: 105000,
    payRangeMin: 84000,
    payRangeMid: 105000,
    payRangeMax: 126000,
  },
  {
    id: "emp-011",
    name: "Victor Huang",
    title: "Engineering Manager",
    department: "Technology",
    location: "Remote",
    managerId: "emp-001",
    workerType: "Employee",
    fte: 1,
    hireDate: "2021-02-16",
    terminationDate: null,
    separationCategory: null,
    regrettable: null,
    annualSalary: 120000,
    payRangeMin: 96000,
    payRangeMid: 120000,
    payRangeMax: 144000,
  },
  {
    id: "emp-012",
    name: "Nia Bennett",
    title: "Client Services Manager",
    department: "Client Services",
    location: "Carlsbad, CA",
    managerId: "emp-001",
    workerType: "Employee",
    fte: 1,
    hireDate: "2022-03-07",
    terminationDate: null,
    separationCategory: null,
    regrettable: null,
    annualSalary: 100000,
    payRangeMin: 80000,
    payRangeMid: 100000,
    payRangeMax: 120000,
  },
  {
    id: "emp-013",
    name: "Theo Park",
    title: "Operations Analyst",
    department: "Operations",
    location: "San Diego, CA",
    managerId: "emp-009",
    workerType: "Employee",
    fte: 1,
    hireDate: "2022-11-14",
    terminationDate: null,
    separationCategory: null,
    regrettable: null,
    annualSalary: 72000,
    payRangeMin: 57600,
    payRangeMid: 72000,
    payRangeMax: 86400,
  },
  {
    id: "emp-014",
    name: "Imani Cole",
    title: "Operations Technician",
    department: "Operations",
    location: "Oceanside, CA",
    managerId: "emp-009",
    workerType: "Employee",
    fte: 1,
    hireDate: "2024-01-22",
    terminationDate: null,
    separationCategory: null,
    regrettable: null,
    annualSalary: 65000,
    payRangeMin: 52000,
    payRangeMid: 65000,
    payRangeMax: 78000,
  },
  {
    id: "emp-015",
    name: "Rafael Ortiz",
    title: "Operations Coordinator",
    department: "Operations",
    location: "San Diego, CA",
    managerId: "emp-009",
    workerType: "Employee",
    fte: 1,
    hireDate: "2023-04-03",
    terminationDate: "2026-02-20",
    separationCategory: "Quit",
    regrettable: true,
    annualSalary: 61000,
    payRangeMin: 48800,
    payRangeMid: 61000,
    payRangeMax: 73200,
  },
  {
    id: "emp-016",
    name: "Leah Foster",
    title: "Finance Analyst",
    department: "Finance",
    location: "Remote",
    managerId: "emp-010",
    workerType: "Employee",
    fte: 1,
    hireDate: "2021-06-14",
    terminationDate: "2025-03-21",
    separationCategory: "Quit",
    regrettable: true,
    annualSalary: 74000,
    payRangeMin: 59200,
    payRangeMid: 74000,
    payRangeMax: 88800,
  },
  {
    id: "emp-017",
    name: "Ben Carter",
    title: "Client Services Consultant",
    department: "Client Services",
    location: "Carlsbad, CA",
    managerId: "emp-012",
    workerType: "Employee",
    fte: 1,
    hireDate: "2022-08-22",
    terminationDate: "2025-06-30",
    separationCategory: "Layoff/Discharge",
    regrettable: false,
    annualSalary: 79000,
    payRangeMin: 63200,
    payRangeMid: 79000,
    payRangeMax: 94800,
  },
  {
    id: "emp-018",
    name: "Ava Singh",
    title: "People Coordinator",
    department: "People",
    location: "Remote",
    managerId: "emp-002",
    workerType: "Employee",
    fte: 1,
    hireDate: "2024-02-05",
    terminationDate: null,
    separationCategory: null,
    regrettable: null,
    annualSalary: 59000,
    payRangeMin: 47200,
    payRangeMid: 59000,
    payRangeMax: 70800,
  },
  {
    id: "emp-019",
    name: "Mateo Ruiz",
    title: "Software Engineer",
    department: "Technology",
    location: "Remote",
    managerId: "emp-011",
    workerType: "Employee",
    fte: 1,
    hireDate: "2022-06-06",
    terminationDate: "2025-10-17",
    separationCategory: "Other",
    regrettable: false,
    annualSalary: 108000,
    payRangeMin: 86400,
    payRangeMid: 108000,
    payRangeMax: 129600,
  },
  {
    id: "emp-020",
    name: "Grace Kim",
    title: "Product Analyst",
    department: "Technology",
    location: "San Diego, CA",
    managerId: "emp-011",
    workerType: "Employee",
    fte: 1,
    hireDate: "2026-02-09",
    terminationDate: null,
    separationCategory: null,
    regrettable: null,
    annualSalary: 88000,
    payRangeMin: 70400,
    payRangeMid: 88000,
    payRangeMax: 105600,
  },
  {
    id: "emp-021",
    name: "Eli Brooks",
    title: "IT Support Specialist",
    department: "Technology",
    location: "San Diego, CA",
    managerId: "emp-011",
    workerType: "Employee",
    fte: 1,
    hireDate: "2024-07-15",
    terminationDate: "2025-12-12",
    separationCategory: "Layoff/Discharge",
    regrettable: false,
    annualSalary: 68000,
    payRangeMin: 54400,
    payRangeMid: 68000,
    payRangeMax: 81600,
  },
  {
    id: "emp-022",
    name: "Hannah Wells",
    title: "Senior Finance Analyst",
    department: "Finance",
    location: "San Diego, CA",
    managerId: "emp-010",
    workerType: "Employee",
    fte: 1,
    hireDate: "2024-01-08",
    terminationDate: "2026-04-30",
    separationCategory: "Layoff/Discharge",
    regrettable: false,
    annualSalary: 82000,
    payRangeMin: 65600,
    payRangeMid: 82000,
    payRangeMax: 98400,
  },
  {
    id: "emp-023",
    name: "Owen Price",
    title: "Client Services Associate",
    department: "Client Services",
    location: "Carlsbad, CA",
    managerId: "emp-012",
    workerType: "Employee",
    fte: 1,
    hireDate: "2026-02-02",
    terminationDate: "2026-08-12",
    separationCategory: "Quit",
    regrettable: true,
    annualSalary: 63000,
    payRangeMin: 50400,
    payRangeMid: 63000,
    payRangeMax: 75600,
  },
  {
    id: "emp-024",
    name: "Stella Park",
    title: "People Operations Specialist",
    department: "People",
    location: "San Diego, CA",
    managerId: "emp-002",
    workerType: "Employee",
    fte: 1,
    hireDate: "2025-07-07",
    terminationDate: null,
    separationCategory: null,
    regrettable: null,
    annualSalary: 67000,
    payRangeMin: 53600,
    payRangeMid: 67000,
    payRangeMax: 80400,
  },
];

const titleByPersonId = new Map([
  ...employees.map((person) => [person.id, person.title] as const),
  ...additionalPeople.map((person) => [person.id, person.title] as const),
]);

const people = [...basePeople, ...additionalPeople];

const monthStarts = Array.from({ length: 23 }, (_, index) => {
  const year = 2025 + Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
});

function employedOn(person: WorkforcePerson, date: string): boolean {
  return person.hireDate <= date && (person.terminationDate === null || person.terminationDate >= date);
}

function makeAbsences(count: number, planned: boolean): AbsenceRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const month = monthStarts[(index * 7 + (planned ? 4 : 0)) % monthStarts.length];
    const day = String(2 + ((index * 11) % 25)).padStart(2, "0");
    const startDate = `${month}-${day}`;
    const candidates = people.filter((person) => person.workerType === "Employee" && employedOn(person, startDate));
    const person = candidates[(index * 13) % candidates.length];
    const reason = planned ? ["Vacation", "Personal", "Holiday"][index % 3] : ["Sick", "Personal"][index % 2];
    return {
      id: `${planned ? "abs-planned" : "abs"}-${String(index + 1).padStart(3, "0")}`,
      personId: person.id,
      startDate,
      days: planned ? [1, 2, 3, 5][index % 4] : [0.5, 1, 1, 2][index % 4],
      planned,
      reason,
    };
  });
}

const absences = [...makeAbsences(40, false), ...makeAbsences(12, true)];

const extraPto: PtoRecord[] = [
  { id: "pto-005", personId: "emp-013", type: "Vacation", startDate: "2025-03-10", days: 3, status: "Approved" },
  { id: "pto-006", personId: "emp-018", type: "Personal", startDate: "2025-05-19", days: 1, status: "Approved" },
  { id: "pto-007", personId: "emp-010", type: "Vacation", startDate: "2025-07-07", days: 5, status: "Approved" },
  { id: "pto-008", personId: "emp-020", type: "Sick", startDate: "2026-05-04", days: 2, status: "Approved" },
  { id: "pto-009", personId: "emp-024", type: "Vacation", startDate: "2026-08-17", days: 4, status: "Approved" },
  { id: "pto-010", personId: "emp-011", type: "Personal", startDate: "2026-09-11", days: 1, status: "Denied" },
  { id: "pto-011", personId: "emp-009", type: "Sick", startDate: "2026-10-22", days: 1, status: "Approved" },
  { id: "pto-012", personId: "emp-018", type: "Vacation", startDate: "2026-12-28", days: 3, status: "Pending" },
];

const pto: PtoRecord[] = [
  ...ptoRequests.map((request) => ({
    id: request.id,
    personId: request.employeeId,
    type: request.type,
    startDate: request.startDate,
    days: request.days,
    status: request.status,
  })),
  ...extraPto,
];

const extraReviews: ReviewRecord[] = [
  { id: "rev-004", personId: "emp-009", cycle: "2025 Annual", status: "Complete", rating: "Meets" },
  { id: "rev-005", personId: "emp-010", cycle: "2025 Annual", status: "Complete", rating: "Exceeds" },
  { id: "rev-006", personId: "emp-011", cycle: "2025 Annual", status: "Complete", rating: "Meets" },
  { id: "rev-007", personId: "emp-012", cycle: "2025 Annual", status: "Complete", rating: "Meets" },
  { id: "rev-008", personId: "emp-013", cycle: "2025 Annual", status: "Complete", rating: "Needs improvement" },
  { id: "rev-009", personId: "emp-014", cycle: "2025 Annual", status: "Complete", rating: "Meets" },
  { id: "rev-010", personId: "emp-018", cycle: "2026 Mid-year", status: "Complete", rating: "Exceeds" },
  { id: "rev-011", personId: "emp-020", cycle: "2026 Mid-year", status: "Complete", rating: "Meets" },
  { id: "rev-012", personId: "emp-024", cycle: "2026 Mid-year", status: "In progress", rating: null },
  { id: "rev-013", personId: "emp-002", cycle: "2026 Mid-year", status: "Complete", rating: "Meets" },
  { id: "rev-014", personId: "emp-001", cycle: "2025 Annual", status: "Complete", rating: "Exceeds" },
  { id: "rev-015", personId: "emp-024", cycle: "2025 Annual", status: "Complete", rating: "Meets" },
];

const reviewRecords: ReviewRecord[] = [
  ...reviews.map((review) => ({
    id: review.id,
    personId: review.employeeId,
    cycle: review.period,
    status: review.status,
    rating: review.rating ?? null,
  })),
  ...extraReviews,
];

const jobEvents: JobEvent[] = [
  { id: "event-001", personId: "emp-002", effectiveDate: "2025-02-03", type: "Promotion" },
  { id: "event-002", personId: "emp-009", effectiveDate: "2025-04-14", type: "Promotion" },
  { id: "event-003", personId: "emp-012", effectiveDate: "2025-06-02", type: "Lateral transfer" },
  { id: "event-004", personId: "emp-013", effectiveDate: "2025-08-04", type: "Promotion" },
  { id: "event-005", personId: "emp-018", effectiveDate: "2025-10-06", type: "Lateral transfer" },
  { id: "event-006", personId: "emp-020", effectiveDate: "2026-03-16", type: "Promotion" },
  { id: "event-007", personId: "emp-010", effectiveDate: "2026-05-11", type: "Lateral transfer" },
  { id: "event-008", personId: "emp-024", effectiveDate: "2026-07-06", type: "Lateral transfer" },
];

const positions: PositionRecord[] = [
  ...people
    .filter((person) => person.workerType === "Employee" && employedOn(person, asOfDate))
    .map((person) => ({
      id: `position-${person.id}`,
      department: person.department,
      title: titleByPersonId.get(person.id)!,
      status: "Filled" as const,
    })),
  { id: "position-open-001", department: "Operations", title: "Operations Specialist", status: "Open" },
  { id: "position-open-002", department: "Client Services", title: "Client Services Associate", status: "Open" },
  { id: "position-open-003", department: "People", title: "HR Analyst", status: "Open" },
  { id: "position-open-004", department: "Technology", title: "Systems Administrator", status: "Open" },
];

const nonExemptPersonIds = new Set(["emp-003", "emp-004", "emp-014"]);
const cents = (amount: number) => Math.round(amount * 100);
const dollars = (amount: number) => cents(amount) / 100;

function semiMonthlyPayDates(): string[] {
  const dates: string[] = [];
  for (let year = 2025; year <= 2026; year++) {
    const lastMonth = year === 2026 ? 10 : 12;
    for (let month = 1; month <= lastMonth; month++) {
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      dates.push(`${year}-${String(month).padStart(2, "0")}-15`);
      dates.push(`${year}-${String(month).padStart(2, "0")}-${lastDay}`);
    }
  }
  return dates;
}

function makePayStatements(): PayStatementRecord[] {
  const statements: PayStatementRecord[] = [];
  let statementIndex = 0;
  for (const payDate of semiMonthlyPayDates()) {
    for (const person of people) {
      if (!employedOn(person, payDate)) continue;
      const salary = person.annualSalary ?? 0;
      const hourly = salary / 2080;
      const earnings: PayStatementRecord["earnings"] = [];
      if (nonExemptPersonIds.has(person.id)) {
        const hours = 86.67;
        earnings.push({ type: "wage", amount: dollars(hourly * hours), hours });
        if ((statementIndex + payDate.charCodeAt(8)) % 9 === 0) {
          const overtimeHours = 4;
          earnings.push({
            type: "overtime",
            amount: dollars(hourly * 1.5 * overtimeHours),
            hours: overtimeHours,
          });
        }
      } else {
        earnings.push({ type: "salary", amount: dollars(salary / 24), hours: 80 });
      }
      if (payDate.endsWith("-12-31") && ["emp-001", "emp-009", "emp-020"].includes(person.id)) {
        earnings.push({ type: "bonus", amount: person.id === "emp-001" ? 2500 : 1200, hours: null });
      }
      if ((statementIndex + person.id.charCodeAt(person.id.length - 1)) % 13 === 0) {
        earnings.push({ type: "reimbursement", amount: 45.75, hours: null });
      }
      const taxableWages = earnings
        .filter((earning) => earning.type !== "reimbursement")
        .reduce((sum, earning) => sum + earning.amount, 0);
      const contingent = person.workerType === "Contingent";
      statements.push({
        id: `pay-${payDate}-${person.id}`,
        personId: person.id,
        payDate,
        earnings,
        employerTaxes: contingent ? 0 : dollars(taxableWages * 0.0765),
        employerContributions: contingent ? 0 : dollars(taxableWages * 0.1),
      });
      statementIndex++;
    }
  }
  return statements;
}

export const seedJobTitles = Object.fromEntries(titleByPersonId) as Record<string, string>;
export const seedNonExemptPersonIdsList = [...nonExemptPersonIds];

export const seedWorkforce: WorkforceDataset = {
  organization: {
    id: "org-demo",
    name: "Torrey Tools Demo Client",
    asOfDate,
    hrDepartment: "People",
    annualRevenue: 6_500_000,
  },
  people,
  absences,
  jobEvents,
  positions,
  reviews: reviewRecords,
  pto,
  payStatements: makePayStatements(),
};
