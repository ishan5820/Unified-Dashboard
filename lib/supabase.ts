import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/task";

export class SupabaseEnvironmentError extends Error {
  constructor(variableName: string) {
    super(`Missing required environment variable: ${variableName}`);
    this.name = "SupabaseEnvironmentError";
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!supabaseUrl) {
  throw new SupabaseEnvironmentError("NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabasePublishableKey) {
  throw new SupabaseEnvironmentError(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey);
