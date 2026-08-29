import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const repositoryRoot = process.env.ARTEDU_REPOSITORY_ROOT ?? path.resolve(process.cwd(), "../..");

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required. Copy apps/api/.env.example to apps/api/.env first.");
  return databaseUrl;
}

export async function withDatabase(action: (pool: Pool) => Promise<void>) {
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  try {
    await action(pool);
  } finally {
    await pool.end();
  }
}

export async function readRepositorySql(...segments: string[]) {
  return readFile(path.join(repositoryRoot, ...segments), "utf8");
}

export { repositoryRoot };
