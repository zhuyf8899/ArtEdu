import { readRepositorySql, withDatabase } from "./run-sql-file";

async function seed() {
  await withDatabase(async (pool) => {
    await pool.query(await readRepositorySql("seed", "seed.sql"));
    console.log("Seed data applied.");
  });
}

void seed();
