import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const MIGRATION_LOCK_NAME = "college-organizer-migrations";
const MIGRATIONS_DIRECTORY = path.join(
  process.cwd(),
  "supabase",
  "migrations",
);

interface AppliedMigration {
  filename: string;
  checksum: string;
}

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is missing. Add it to .env.local before running migrations.",
    );
  }

  return databaseUrl;
}

function checksum(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

async function migrationFilenames(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIRECTORY, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: requireDatabaseUrl() });
  let lockAcquired = false;

  try {
    await client.connect();
    console.log("Connected to the database.");

    await client.query(
      "select pg_advisory_lock(hashtext($1))",
      [MIGRATION_LOCK_NAME],
    );
    lockAcquired = true;

    await client.query(`
      create table if not exists public._migrations (
        filename text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const appliedResult = await client.query<AppliedMigration>(
      "select filename, checksum from public._migrations",
    );
    const applied = new Map(
      appliedResult.rows.map((row) => [row.filename, row.checksum]),
    );
    const filenames = await migrationFilenames();
    let appliedCount = 0;

    for (const filename of filenames) {
      const filePath = path.join(MIGRATIONS_DIRECTORY, filename);
      const sql = await readFile(filePath, "utf8");
      const fileChecksum = checksum(sql);
      const previousChecksum = applied.get(filename);

      if (previousChecksum === fileChecksum) {
        console.log(`Skipped ${filename} (already applied).`);
        continue;
      }

      if (previousChecksum) {
        throw new Error(
          `Migration ${filename} changed after it was applied. Add a new migration file instead.`,
        );
      }

      if (!sql.trim()) {
        throw new Error(`Migration ${filename} is empty.`);
      }

      await client.query("begin");

      try {
        await client.query(sql);
        await client.query(
          "insert into public._migrations (filename, checksum) values ($1, $2)",
          [filename, fileChecksum],
        );
        await client.query("commit");
      } catch (error: unknown) {
        await client.query("rollback");
        throw error;
      }

      appliedCount += 1;
      console.log(`Applied ${filename}.`);
    }

    if (filenames.length === 0) {
      console.log("No SQL migration files found.");
    } else if (appliedCount === 0) {
      console.log("Database is already up to date.");
    } else {
      console.log(`Migration complete: ${appliedCount} file(s) applied.`);
    }
  } finally {
    if (lockAcquired) {
      await client.query("select pg_advisory_unlock(hashtext($1))", [
        MIGRATION_LOCK_NAME,
      ]);
    }

    await client.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown migration error";
  console.error(`Migration failed: ${message}`);
  process.exitCode = 1;
});
