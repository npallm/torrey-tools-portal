import { FinchDirectoryEntry } from "./types";

// Finch unified HRIS/payroll API. Set FINCH_API_TOKEN (access token from a
// Finch Connect session) to pull live data; without it the portal falls back
// to seed fixtures. Point FINCH_API_URL at the sandbox for testing.
const FINCH_API_URL = process.env.FINCH_API_URL ?? "https://api.tryfinch.com";
const FINCH_API_VERSION = "2020-09-17";

export function finchConfigured(): boolean {
  return Boolean(process.env.FINCH_API_TOKEN);
}

type FinchDirectoryResponse = {
  individual_id: string;
  first_name?: string;
  last_name?: string;
  department?: { name?: string } | null;
  is_active?: boolean;
};

async function finchFetch<T>(path: string): Promise<T> {
  const token = process.env.FINCH_API_TOKEN;
  if (!token) throw new Error("FINCH_API_TOKEN is not set");
  const res = await fetch(`${FINCH_API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Finch-API-Version": FINCH_API_VERSION,
    },
    // HRIS data changes slowly; cache briefly so dashboards stay snappy.
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error(`Finch ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function getFinchDirectory(): Promise<FinchDirectoryEntry[]> {
  const data = await finchFetch<{ responses?: FinchDirectoryResponse[] }>(
    "/employer/directory"
  );
  const rows = data.responses ?? (data as unknown as FinchDirectoryResponse[]);
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    id: r.individual_id,
    firstName: r.first_name ?? "",
    lastName: r.last_name ?? "",
    department: r.department?.name ?? null,
    title: null,
    isActive: r.is_active ?? true,
  }));
}

export async function getFinchCompany(): Promise<{
  legal_name?: string;
  entity?: { type?: string };
}> {
  return finchFetch("/employer/company");
}

// Providers Finch can read from — shown on the integrations page.
export const finchProviders = [
  { name: "Gusto", category: "Payroll + HRIS" },
  { name: "ADP Workforce Now", category: "Payroll + HRIS" },
  { name: "BambooHR", category: "HRIS" },
  { name: "Workday", category: "HRIS" },
  { name: "Rippling", category: "Payroll + HRIS" },
  { name: "Paylocity", category: "Payroll + HRIS" },
  { name: "Justworks", category: "PEO" },
  { name: "Zenefits", category: "HRIS" },
];
