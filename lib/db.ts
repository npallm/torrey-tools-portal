import { Pool, types } from "pg";

types.setTypeParser(1082, (value) => value);

const globalPool = globalThis as typeof globalThis & { __torreyPgPool?: Pool };

export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  if (!globalPool.__torreyPgPool) {
    globalPool.__torreyPgPool = new Pool({ connectionString });
  }
  return globalPool.__torreyPgPool;
}
