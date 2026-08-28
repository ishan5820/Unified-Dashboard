import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { addCalendarDays, toLocalDateString, weekdayForDate } from "../lib/datetime";
import { expandSeries } from "../lib/recurrence";
import type { Database, NewTask, TaskCategory } from "../types/task";

const SEED_BATCH_ID = "c011e9e0-0000-4000-8000-000000000001";
const CLASS_SERIES_ID = "c011e9e0-0000-4000-8000-000000000002";
const CLUB_SERIES_ID = "c011e9e0-0000-4000-8000-000000000003";

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Add it to .env.local before seeding.`);
  return value;
}

function task(
  title: string,
  offset: number | null,
  category: TaskCategory,
  courseCode: string | null,
  options: Partial<Pick<NewTask, "due_time" | "is_completed" | "is_pinned" | "description">> = {},
): NewTask {
  return {
    canvas_uid: null,
    title,
    description: options.description ?? null,
    due_date: offset === null ? null : addCalendarDays(toLocalDateString(new Date()), offset),
    due_time: options.due_time ?? null,
    category,
    course_code: courseCode,
    is_pinned: options.is_pinned ?? false,
    is_completed: options.is_completed ?? false,
    source: "manual",
    kind: "task",
    end_time: null,
    series_id: null,
    recurrence_rule: null,
    series_until: null,
    import_batch_id: SEED_BATCH_ID,
  };
}

function buildSeedRows(): NewTask[] {
  const today = toLocalDateString(new Date());
  const rows: NewTask[] = [
    task("Read Plato, Republic Book I", -8, "classes", "PHL 301", { is_completed: true }),
    task("Calculus problem set 2", -5, "classes", "M 408D", { is_completed: true }),
    task("Submit officer interest form", -3, "orgs", null, { is_completed: true }),
    task("Buy birthday card", -2, "social", null, { is_completed: true }),
    task("Chemistry pre-lab", -1, "classes", "CH 301", { is_completed: true }),
    task("Problem Set 3", 0, "classes", "PHI 317K", { due_time: "11:59 PM", is_pinned: true }),
    task("Weekly reading response", 0, "classes", "GOV 310L", { due_time: "5:00 PM" }),
    task("Confirm guest speaker", 1, "orgs", null, { is_pinned: true }),
    task("Coffee with Maya", 2, "social", null, { due_time: "3:30 PM" }),
    task("Linear algebra quiz", 3, "classes", "M 341", { due_time: "9:00 AM" }),
    task("Reserve meeting room", 4, "orgs", null),
    task("Film night RSVP", 5, "social", null),
    task("Research outline", 6, "classes", "HIS 315K", { is_pinned: true }),
    task("Volunteer shift signup", 7, "orgs", null),
    task("Call home", 8, "social", null),
    task("Midterm study guide", 12, "classes", "BIO 311C"),
    task("Budget proposal", 14, "orgs", null),
    task("Dinner reservation", 18, "social", null),
    task("Draft seminar paper", 28, "classes", "PHI 317K"),
    task("Spring retreat plan", 40, "orgs", null),
    task("Concert tickets", 55, "social", null),
    task("Final presentation", 75, "classes", "GOV 310L"),
    task("Choose research topic", null, "classes", "HIS 315K"),
    task("Brainstorm service project", null, "orgs", null),
    task("Plan weekend trip", null, "social", null),
  ];
  const mondayOffset = (8 - weekdayForDate(today)) % 7;
  const classStart = addCalendarDays(today, mondayOffset);
  rows.push(...expandSeries({
    title: "PHI 317K Lecture", category: "classes", courseCode: "PHI 317K", kind: "event",
    byDay: ["MO", "WE", "FR"], startDate: classStart, untilDate: addCalendarDays(classStart, 83),
    startTime: "10:00 AM", endTime: "11:00 AM",
  }, CLASS_SERIES_ID).map((row) => ({ ...row, import_batch_id: SEED_BATCH_ID })));
  const tuesdayOffset = (9 - weekdayForDate(today)) % 7;
  const clubStart = addCalendarDays(today, tuesdayOffset);
  rows.push(...expandSeries({
    title: "Student Organization Meeting", category: "orgs", courseCode: null, kind: "event",
    byDay: ["TU"], startDate: clubStart, untilDate: addCalendarDays(clubStart, 77),
    startTime: "6:00 PM", endTime: "7:30 PM",
  }, CLUB_SERIES_ID).map((row) => ({ ...row, import_batch_id: SEED_BATCH_ID })));
  return rows;
}

async function main(): Promise<void> {
  const supabase = createClient<Database>(
    requireEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnvironmentVariable("SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const reset = process.argv.includes("--reset");
  const yes = process.argv.includes("--yes");
  const { count, error: countError } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("import_batch_id", SEED_BATCH_ID);
  if (countError) throw new Error(`Could not inspect seed rows: ${countError.message}`);

  if (reset) {
    if (!count) { console.log("No scoped seed rows to delete."); return; }
    if (!yes) {
      const prompt = createInterface({ input, output });
      const answer = await prompt.question(`Delete ${count} rows from seed batch ${SEED_BATCH_ID}? Type yes: `);
      prompt.close();
      if (answer.trim().toLowerCase() !== "yes") { console.log("Reset cancelled."); return; }
    }
    const { error } = await supabase.from("tasks").delete().eq("import_batch_id", SEED_BATCH_ID);
    if (error) throw new Error(`Could not reset seed rows: ${error.message}`);
    console.log(`Deleted ${count} scoped seed rows. Run npm run seed to recreate them.`);
    return;
  }

  if (count) { console.log(`Seed batch already contains ${count} rows; no changes made.`); return; }
  const rows = buildSeedRows();
  const { error } = await supabase.from("tasks").insert(rows);
  if (error) throw new Error(`Could not insert seed data: ${error.message}`);
  console.log(`Inserted ${rows.length} seed rows in batch ${SEED_BATCH_ID}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unknown seed error");
  process.exitCode = 1;
});
