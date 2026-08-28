import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/task";

export class SupabaseAdminEnvironmentError extends Error {
  constructor(variableName: string) {
    super(`Missing required server environment variable: ${variableName}`);
    this.name = "SupabaseAdminEnvironmentError";
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim();

if (!supabaseUrl) {
  throw new SupabaseAdminEnvironmentError("NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseSecretKey) {
  throw new SupabaseAdminEnvironmentError("SUPABASE_SECRET_KEY");
}

export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
