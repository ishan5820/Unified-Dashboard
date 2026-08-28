import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const REQUIRED_ENVIRONMENT_VARIABLES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "DATABASE_URL",
] as const;

type EnvironmentVariableName = (typeof REQUIRED_ENVIRONMENT_VARIABLES)[number];

function readEnvironmentVariable(name: EnvironmentVariableName): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function safeErrorLabel(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return error instanceof Error ? error.name : "unknown error";
}

async function main(): Promise<void> {
  const values = new Map<EnvironmentVariableName, string>();
  let hasMissingVariable = false;

  for (const name of REQUIRED_ENVIRONMENT_VARIABLES) {
    const value = readEnvironmentVariable(name);

    if (value) {
      values.set(name, value);
      console.log(`PASS ${name}: set`);
    } else {
      hasMissingVariable = true;
      console.error(`FAIL ${name}: missing or empty`);
    }
  }

  if (hasMissingVariable) {
    process.exitCode = 1;
    return;
  }

  const supabaseUrl = values.get("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = values.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const secretKey = values.get("SUPABASE_SECRET_KEY");
  const databaseUrl = values.get("DATABASE_URL");

  if (!supabaseUrl || !publishableKey || !secretKey || !databaseUrl) {
    throw new Error("Environment verification state is inconsistent.");
  }

  try {
    const parsedUrl = new URL(supabaseUrl);

    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      throw new TypeError("Unsupported protocol");
    }

    const supabase = createClient(supabaseUrl, publishableKey);
    const { error } = await supabase.from("tasks").select("id", { count: "exact", head: true });
    if (error) throw error;
    console.log("PASS Supabase publishable client: query succeeded");
  } catch (error: unknown) {
    console.error(`FAIL Supabase publishable client: ${safeErrorLabel(error)}`);
    process.exitCode = 1;
    return;
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });

    if (error) {
      throw error;
    }

    console.log("PASS Supabase secret client: connected");
  } catch (error: unknown) {
    console.error(`FAIL Supabase secret client: ${safeErrorLabel(error)}`);
    process.exitCode = 1;
  }

  const database = new Client({ connectionString: databaseUrl });

  try {
    await database.connect();
    const result = await database.query<{ ok: number }>("select 1 as ok");

    if (result.rows[0]?.ok !== 1) {
      throw new Error("Unexpected query result");
    }

    console.log("PASS Database query: SELECT 1");
  } catch (error: unknown) {
    console.error(`FAIL Database query: ${safeErrorLabel(error)}`);
    process.exitCode = 1;
  } finally {
    await database.end();
  }
}

main().catch((error: unknown) => {
  console.error(`FAIL Environment verification: ${safeErrorLabel(error)}`);
  process.exitCode = 1;
});
