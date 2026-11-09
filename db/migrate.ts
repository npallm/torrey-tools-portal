import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { Pool } from "pg";
import { createPool, loadEnvLocal } from "./env";

export async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      "create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now())",
    );
    const appliedResult = await client.query<{ filename: string }>("select filename from schema_migrations");
    const applied = new Set(appliedResult.rows.map((row) => row.filename));
    const directory = resolve(process.cwd(), "db/migrations");
    const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();

    for (const filename of files) {
      if (applied.has(filename)) continue;
      const sql = await readFile(resolve(directory, filename), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (filename) values ($1)", [filename]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
      console.info(`Applied ${filename}`);
    }
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  await loadEnvLocal();
  const pool = createPool();
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
}

if (basename(process.argv[1] ?? "") === "migrate.ts") {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
