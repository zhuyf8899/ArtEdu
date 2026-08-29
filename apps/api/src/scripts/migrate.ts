import { readdir } from "node:fs/promises";
import path from "node:path";
import { readRepositorySql, repositoryRoot, withDatabase } from "./run-sql-file";

async function migrate() {
  await withDatabase(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(7410629)");
      await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)");
      const files = (await readdir(path.join(repositoryRoot, "migrations"))).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
      const applied = await client.query<{ filename: string }>("SELECT filename FROM schema_migrations");
      const appliedFiles = new Set(applied.rows.map((row) => row.filename));
      for (const filename of files) {
        if (appliedFiles.has(filename)) continue;
        await client.query(await readRepositorySql("migrations", filename));
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
        console.log(`Applied migration: ${filename}`);
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(7410629)").catch(() => undefined);
      client.release();
    }
  });
}

void migrate();
