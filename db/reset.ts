import { basename } from "node:path";
import { createPool, loadEnvLocal } from "./env";
import { migrate } from "./migrate";
import { seedDemo } from "./seed";

async function main(): Promise<void> {
  await loadEnvLocal();
  const pool = createPool();
  try {
    await pool.query("drop schema public cascade; create schema public");
    await migrate(pool);
    await seedDemo(pool);
  } finally {
    await pool.end();
  }
}

if (basename(process.argv[1] ?? "") === "reset.ts") {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
