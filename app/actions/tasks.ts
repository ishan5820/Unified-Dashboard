"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { addCalendarDays, isCalendarDate } from "@/lib/datetime";
import { expandSeries } from "@/lib/recurrence";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  isTaskCategory,
  isTaskKind,
  isTaskSource,
  isWeekday,
  type NewTask,
  type RecurrenceSpec,
  type Subtask,
  type Task,
  type TaskUpdate,
  type Weekday,
} from "@/types/task";

export type TaskActionResult =
  | { ok: true; task: Task; tasks?: Task[]; count?: number }
  | { ok: false; error: string };

export type TaskDraft = Partial<NewTask> & Pick<NewTask, "title">;

export type TaskListActionResult =
  | { ok: true; tasks: Task[]; count: number }
  | { ok: false; error: string };

function revalidateTaskPages(): void {
  for (const path of ["/", "/classes", "/orgs", "/social"]) revalidatePath(path);
}

function cleanText(value: unknown, nullable = true): string | null {
  if (typeof value !== "string") return nullable ? null : "";
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned || (nullable ? null : "");
}

function cleanDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && isCalendarDate(value) ? value : null;
}

function sanitizeSubtasks(value: unknown): Subtask[] | string {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return "Subtasks must be a list.";
  if (value.length > 50) return "A task can contain at most 50 subtasks.";
  const now = new Date().toISOString();
  const rows: Subtask[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return "A subtask is invalid.";
    const input = item as Record<string, unknown>;
    const title = cleanText(input.title, false);
    if (!title) return "Every subtask needs a title.";
    if (title.length > 180) return "Subtask titles must be 180 characters or fewer.";
    const id = typeof input.id === "string" && /^[0-9a-f-]{36}$/i.test(input.id)
      ? input.id
      : randomUUID();
    rows.push({
      id,
      title,
      is_completed: Boolean(input.is_completed),
      created_at: typeof input.created_at === "string" && !Number.isNaN(Date.parse(input.created_at))
        ? input.created_at
        : now,
    });
  }
  return rows;
}

function sanitizeNewTask(value: unknown): NewTask | string {
  if (!value || typeof value !== "object") return "Task data is required.";
  const input = value as Record<string, unknown>;
  const title = cleanText(input.title, false);
  if (!title) return "Title is required.";
  const category = input.category ?? "classes";
  const source = input.source ?? "manual";
  const kind = input.kind ?? "task";
  if (!isTaskCategory(category)) return "Choose a valid category.";
  if (!isTaskSource(source)) return "Choose a valid source.";
  if (!isTaskKind(kind)) return "Choose a valid task kind.";
  const dueDate = cleanDate(input.due_date);
  if (input.due_date && !dueDate) return "Due date must be YYYY-MM-DD.";
  const isCompleted = Boolean(input.is_completed);
  if (kind === "event" && isCompleted) return "Events cannot be completed.";
  const subtasks = sanitizeSubtasks(input.subtasks);
  if (typeof subtasks === "string") return subtasks;
  if (kind === "event" && subtasks.length) return "Events cannot contain subtasks.";
  return {
    canvas_uid: cleanText(input.canvas_uid),
    title,
    description: cleanText(input.description),
    due_date: dueDate,
    due_time: cleanText(input.due_time),
    location: cleanText(input.location),
    category,
    course_code: cleanText(input.course_code)?.toUpperCase() ?? null,
    is_pinned: Boolean(input.is_pinned),
    is_completed: isCompleted,
    source,
    kind,
    end_time: kind === "event" ? cleanText(input.end_time) : null,
    series_id: cleanText(input.series_id),
    recurrence_rule: cleanText(input.recurrence_rule),
    series_until: cleanDate(input.series_until),
    import_batch_id: cleanText(input.import_batch_id),
    subtasks,
  };
}

function sanitizePatch(value: unknown, existing: Task): TaskUpdate | string {
  if (!value || typeof value !== "object") return "Task changes are required.";
  const input = value as Record<string, unknown>;
  const merged = sanitizeNewTask({ ...existing, ...input });
  if (typeof merged === "string") return merged;
  const allowed = new Set<keyof NewTask>([
    "title", "description", "due_date", "due_time", "location", "category", "course_code", "is_pinned",
    "is_completed", "source", "kind", "end_time", "series_id", "recurrence_rule", "series_until",
    "subtasks",
  ]);
  return Object.fromEntries(Object.keys(input).filter((key) => allowed.has(key as keyof NewTask)).map((key) => [key, merged[key as keyof NewTask]])) as TaskUpdate;
}

async function getTask(id: string): Promise<Task | null> {
  const { data } = await supabaseAdmin.from("tasks").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function getAllTasks(): Promise<TaskListActionResult> {
  try {
    const { data, error } = await supabaseAdmin.from("tasks").select("*")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("due_time", { ascending: true, nullsFirst: false });
    if (error) return { ok: false, error: error.message };
    return { ok: true, tasks: data ?? [], count: data?.length ?? 0 };
  } catch { return { ok: false, error: "Could not load organizer data." }; }
}

export async function createTask(input: TaskDraft): Promise<TaskActionResult> {
  try {
    const row = sanitizeNewTask(input);
    if (typeof row === "string") return { ok: false, error: row };
    const { data, error } = await supabaseAdmin.from("tasks").insert(row).select("*").single();
    if (error) return { ok: false, error: error.message };
    revalidateTaskPages();
    return { ok: true, task: data };
  } catch { return { ok: false, error: "Could not create the task." }; }
}

export async function updateTask(id: string, input: TaskUpdate): Promise<TaskActionResult> {
  try {
    if (!id) return { ok: false, error: "Task id is required." };
    const existing = await getTask(id);
    if (!existing) return { ok: false, error: "Task not found." };
    const patch = sanitizePatch(input, existing);
    if (typeof patch === "string") return { ok: false, error: patch };
    const { data, error } = await supabaseAdmin.from("tasks").update(patch).eq("id", id).select("*").single();
    if (error) return { ok: false, error: error.message };
    revalidateTaskPages();
    return { ok: true, task: data };
  } catch { return { ok: false, error: "Could not update the task." }; }
}

export async function toggleComplete(id: string, completed: boolean): Promise<TaskActionResult> {
  const existing = await getTask(id);
  if (!existing) return { ok: false, error: "Task not found." };
  if (existing.kind === "event") return { ok: false, error: "Events cannot be completed." };
  return updateTask(id, { is_completed: Boolean(completed) });
}

export async function togglePin(id: string, pinned: boolean): Promise<TaskActionResult> {
  return updateTask(id, { is_pinned: Boolean(pinned) });
}

export async function addSubtask(taskId: string, titleInput: string): Promise<TaskActionResult> {
  try {
    const existing = await getTask(taskId);
    if (!existing) return { ok: false, error: "Task not found." };
    if (existing.kind !== "task") return { ok: false, error: "Only tasks can contain subtasks." };
    const title = cleanText(titleInput, false);
    if (!title) return { ok: false, error: "Enter a subtask title." };
    if (title.length > 180) return { ok: false, error: "Subtask titles must be 180 characters or fewer." };
    if (existing.subtasks.length >= 50) return { ok: false, error: "This task already has 50 subtasks." };
    return updateTask(taskId, {
      subtasks: [...existing.subtasks, {
        id: randomUUID(), title, is_completed: false, created_at: new Date().toISOString(),
      }],
    });
  } catch { return { ok: false, error: "Could not add the subtask." }; }
}

export async function toggleSubtask(taskId: string, subtaskId: string, completed: boolean): Promise<TaskActionResult> {
  try {
    const existing = await getTask(taskId);
    if (!existing) return { ok: false, error: "Task not found." };
    if (!existing.subtasks.some((subtask) => subtask.id === subtaskId)) return { ok: false, error: "Subtask not found." };
    return updateTask(taskId, {
      subtasks: existing.subtasks.map((subtask) => subtask.id === subtaskId
        ? { ...subtask, is_completed: Boolean(completed) }
        : subtask),
    });
  } catch { return { ok: false, error: "Could not update the subtask." }; }
}

export async function deleteSubtask(taskId: string, subtaskId: string): Promise<TaskActionResult> {
  try {
    const existing = await getTask(taskId);
    if (!existing) return { ok: false, error: "Task not found." };
    if (!existing.subtasks.some((subtask) => subtask.id === subtaskId)) return { ok: false, error: "Subtask not found." };
    return updateTask(taskId, { subtasks: existing.subtasks.filter((subtask) => subtask.id !== subtaskId) });
  } catch { return { ok: false, error: "Could not delete the subtask." }; }
}

export async function deleteTask(id: string): Promise<TaskActionResult> {
  try {
    const existing = await getTask(id);
    if (!existing) return { ok: false, error: "Task not found." };
    const { error } = await supabaseAdmin.from("tasks").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidateTaskPages();
    return { ok: true, task: existing };
  } catch { return { ok: false, error: "Could not delete the task." }; }
}

export async function deleteTasks(ids: string[]): Promise<TaskActionResult> {
  try {
    const uniqueIds = [...new Set(ids.filter((id) => typeof id === "string" && id.trim()))];
    if (!uniqueIds.length || uniqueIds.length > 500) return { ok: false, error: "Choose between 1 and 500 tasks to delete." };
    const { data, error } = await supabaseAdmin.from("tasks").delete().in("id", uniqueIds).select("*");
    if (error || !data?.length) return { ok: false, error: error?.message ?? "No tasks were deleted." };
    revalidateTaskPages();
    return { ok: true, task: data[0], tasks: data, count: data.length };
  } catch { return { ok: false, error: "Could not delete the selected tasks." }; }
}

export async function deleteImportBatch(batchId: string): Promise<TaskActionResult> {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(batchId)) {
      return { ok: false, error: "Import batch id is invalid." };
    }
    const { data, error } = await supabaseAdmin.from("tasks").delete().eq("import_batch_id", batchId).select("*");
    if (error || !data?.length) return { ok: false, error: error?.message ?? "No rows from this import remain." };
    revalidateTaskPages();
    return { ok: true, task: data[0], tasks: data, count: data.length };
  } catch { return { ok: false, error: "Could not undo this import." }; }
}

export async function bulkCreateTasks(input: TaskDraft[]): Promise<TaskActionResult> {
  try {
    if (!Array.isArray(input) || input.length === 0 || input.length > 500) return { ok: false, error: "Provide between 1 and 500 tasks." };
    const rows: NewTask[] = [];
    for (const item of input) {
      const row = sanitizeNewTask(item);
      if (typeof row === "string") return { ok: false, error: row };
      rows.push(row);
    }
    const { data, error } = await supabaseAdmin.from("tasks").insert(rows).select("*");
    if (error || !data?.length) return { ok: false, error: error?.message ?? "No tasks were created." };
    revalidateTaskPages();
    return { ok: true, task: data[0], tasks: data, count: data.length };
  } catch { return { ok: false, error: "Could not create the tasks." }; }
}

function validateRecurrenceSpec(value: RecurrenceSpec): string | null {
  if (!value.title.trim()) return "Title is required.";
  if (!isTaskCategory(value.category) || !isTaskKind(value.kind)) return "Recurring item settings are invalid.";
  if (!isCalendarDate(value.startDate) || !isCalendarDate(value.untilDate)) return "Start and end dates are required.";
  if (!Array.isArray(value.byDay) || !value.byDay.every(isWeekday)) return "Choose valid weekdays.";
  return null;
}

export async function createSeries(spec: RecurrenceSpec): Promise<TaskActionResult> {
  try {
    const validation = validateRecurrenceSpec(spec);
    if (validation) return { ok: false, error: validation };
    const rows = expandSeries(spec, randomUUID());
    if (!rows.length) return { ok: false, error: "The recurrence does not produce any dates." };
    return bulkCreateTasks(rows);
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not create the series." }; }
}

export async function updateSeries(seriesId: string, occurrenceId: string, input: TaskUpdate, scope: "one" | "all"): Promise<TaskActionResult> {
  try {
    if (!seriesId || !occurrenceId || !["one", "all"].includes(scope)) return { ok: false, error: "Series update request is invalid." };
    const existing = await getTask(occurrenceId);
    if (!existing || existing.series_id !== seriesId) return { ok: false, error: "Series occurrence not found." };
    const patch = sanitizePatch(input, existing);
    if (typeof patch === "string") return { ok: false, error: patch };
    const { due_date: _occurrenceDate, ...seriesPatch } = patch;
    void _occurrenceDate;
    const query = supabaseAdmin.from("tasks").update(scope === "one" ? { ...patch, series_id: null, recurrence_rule: null, series_until: null } : seriesPatch);
    const { data, error } = await (scope === "one" ? query.eq("id", occurrenceId) : query.eq("series_id", seriesId)).select("*");
    if (error || !data?.length) return { ok: false, error: error?.message ?? "Series was not updated." };
    revalidateTaskPages();
    return { ok: true, task: data[0], tasks: data, count: data.length };
  } catch { return { ok: false, error: "Could not update the series." }; }
}

export async function deleteSeries(seriesId: string, occurrenceId: string, scope: "one" | "all"): Promise<TaskActionResult> {
  try {
    if (scope === "one") return deleteTask(occurrenceId);
    const existing = await getTask(occurrenceId);
    if (!existing || existing.series_id !== seriesId) return { ok: false, error: "Series occurrence not found." };
    const { data, error } = await supabaseAdmin.from("tasks").delete().eq("series_id", seriesId).select("*");
    if (error || !data?.length) return { ok: false, error: error?.message ?? "Series was not deleted." };
    revalidateTaskPages();
    return { ok: true, task: data[0], tasks: data, count: data.length };
  } catch { return { ok: false, error: "Could not delete the series." }; }
}

export async function extendSeries(seriesId: string, newUntil: string): Promise<TaskActionResult> {
  try {
    if (!seriesId || !isCalendarDate(newUntil)) return { ok: false, error: "Choose a valid new end date." };
    const { data: rows, error } = await supabaseAdmin.from("tasks").select("*").eq("series_id", seriesId).order("due_date", { ascending: false });
    if (error || !rows?.length) return { ok: false, error: error?.message ?? "Series not found." };
    const sample = rows[0];
    const previousUntil = sample.series_until ?? sample.due_date;
    if (!previousUntil || newUntil <= previousUntil) return { ok: false, error: "The new end date must be after the current end date." };
    const byDay = (sample.recurrence_rule?.match(/BYDAY=([^;]+)/)?.[1]?.split(",") ?? []).filter(isWeekday) as Weekday[];
    const generated = expandSeries({
      title: sample.title, category: sample.category, courseCode: sample.course_code, kind: sample.kind,
      byDay, startDate: addCalendarDays(previousUntil, 1), untilDate: newUntil,
      startTime: sample.due_time, endTime: sample.end_time,
    }, seriesId);
    if (!generated.length) return { ok: false, error: "The extension does not produce any dates." };
    const { data, error: insertError } = await supabaseAdmin.from("tasks").insert(generated).select("*");
    if (insertError || !data?.length) return { ok: false, error: insertError?.message ?? "Series was not extended." };
    const { error: metadataError } = await supabaseAdmin.from("tasks").update({ series_until: newUntil }).eq("series_id", seriesId);
    if (metadataError) return { ok: false, error: metadataError.message };
    revalidateTaskPages();
    return { ok: true, task: data[0], tasks: data, count: data.length };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not extend the series." }; }
}
