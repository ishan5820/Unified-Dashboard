import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Task, TaskCategory } from "@/types/task";

export async function getCategoryTasks(category: TaskCategory): Promise<Task[]> {
  const { data, error } = await supabaseAdmin
    .from("tasks")
    .select("*")
    .eq("category", category)
    .order("is_completed", { ascending: true })
    .order("is_pinned", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("due_time", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`The ${category} workspace could not load.`);
  return data ?? [];
}
