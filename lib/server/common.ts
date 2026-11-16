import type { Pool, PoolClient } from "pg";
import { cookies } from "next/headers";
import { getPool } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export const DATABASE_REQUIRED_MESSAGE =
  "This feature needs the database: npm run db:up && npm run db:reset";

export class DatabaseRequiredError extends Error {
  constructor() {
    super(DATABASE_REQUIRED_MESSAGE);
    this.name = "DatabaseRequiredError";
  }
}

const CONNECTION_ERROR_CODES = new Set([
  "08000",
  "08001",
  "08003",
  "08006",
  "57P01",
  "57P02",
  "57P03",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
]);

function isConnectionError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return typeof error.code === "string" && CONNECTION_ERROR_CODES.has(error.code);
}

export function isDatabaseRequiredError(error: unknown): error is DatabaseRequiredError {
  return error instanceof DatabaseRequiredError;
}

export async function withFeatureDatabase<T>(work: (pool: Pool) => Promise<T>): Promise<T> {
  if (!process.env.DATABASE_URL) throw new DatabaseRequiredError();
  try {
    return await work(getPool());
  } catch (error) {
    if (isConnectionError(error)) throw new DatabaseRequiredError();
    throw error;
  }
}

export async function demoOrganizationId(pool: Pool | PoolClient): Promise<string> {
  try {
    await cookies();
  } catch {
    const demo = await pool.query<{ id: string }>(
      "select id from organizations where slug = 'demo'",
    );
    const demoId = demo.rows[0]?.id;
    if (!demoId) throw new Error("The demo organization has not been seeded.");
    return demoId;
  }
  const user = await getCurrentUser();
  if (!user) throw new Error("Authentication required.");
  return user.organizationId;
}

export function isoDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
