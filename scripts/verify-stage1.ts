import { createClient } from "@supabase/supabase-js";
import type { Database, Task } from "../types/task";

const GATE_BATCH_ID = "c011e9e0-0000-4000-8000-000000000010";
const GATE_UID = "stage1-problem-set-3@example.test";
const API_URL = `${process.env.STAGE1_API_BASE_URL ?? "http://localhost:3000"}/api/sync-ical`;
const ICS = [
  "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//College Organizer//Stage 1 Gate//EN",
  "BEGIN:VEVENT", `UID:${GATE_UID}`, "DTSTAMP:20260827T140000Z",
  "DTSTART;VALUE=DATE:20260305", "SUMMARY:Problem Set 3 [PHI 317K]",
  "DESCRIPTION:Canvas assignment", "END:VEVENT", "END:VCALENDAR", "",
].join("\r\n");
const ICAL_URL = `https://httpbin.org/base64/${Buffer.from(ICS).toString("base64")}`;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function post(body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(API_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, json: await response.json() as Record<string, unknown> };
}

async function main(): Promise<void> {
  const client = createClient<Database>(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const cleanup = async () => {
    const { error } = await client.from("tasks").delete().eq("import_batch_id", GATE_BATCH_ID);
    if (error) throw new Error(`Gate cleanup failed: ${error.message}`);
  };
  const loadGateRows = async (): Promise<Task[]> => {
    const { data, error } = await client.from("tasks").select("*").eq("import_batch_id", GATE_BATCH_ID).order("id");
    if (error) throw new Error(`Gate read failed: ${error.message}`);
    return data;
  };

  await cleanup();
  try {
    const { error } = await client.from("tasks").insert({
      title: "Problem Set 3", description: "Syllabus detail", due_date: "2026-03-03", due_time: null,
      category: "classes", course_code: "PHI 317K", is_pinned: false, is_completed: true,
      source: "manual", kind: "task", canvas_uid: null, end_time: null, series_id: null,
      recurrence_rule: null, series_until: null, import_batch_id: GATE_BATCH_ID,
    });
    if (error) throw new Error(`Gate insert failed: ${error.message}`);

    const beforePreview = JSON.stringify(await loadGateRows());
    const preview = await post({ icalUrl: ICAL_URL, mode: "preview" });
    assert(preview.status === 200 && preview.json.ok === true, `Preview failed: ${JSON.stringify(preview.json)}`);
    const actions = preview.json.actions as Array<Record<string, unknown>>;
    const adopt = actions.find((action) => action.type === "adopt");
    assert(adopt, "Preview did not propose an adopt action.");
    const diff = adopt.diff as Array<Record<string, unknown>>;
    assert(diff.some((item) => item.field === "due_date" && item.from === "2026-03-03" && item.to === "2026-03-05"), "Preview omitted the Mar 3 → Mar 5 diff.");
    const afterPreview = JSON.stringify(await loadGateRows());
    assert(beforePreview === afterPreview, "Preview changed the database.");
    console.log("PASS preview proposed adopt with due_date 2026-03-03 → 2026-03-05");
    console.log("PASS preview left the row byte-for-byte unchanged");

    const apply = await post({
      icalUrl: ICAL_URL, mode: "apply", planId: preview.json.planId,
      planHash: preview.json.planHash, approvedActionIds: [adopt.actionId],
    });
    assert(apply.status === 200 && apply.json.ok === true, `Apply failed: ${JSON.stringify(apply.json)}`);
    const appliedRows = await loadGateRows();
    assert(appliedRows.length === 1 && appliedRows[0].due_date === "2026-03-05" && appliedRows[0].canvas_uid === GATE_UID && appliedRows[0].is_completed, "Apply did not preserve one completed row while adopting Canvas scheduling.");
    console.log("PASS apply produced one linked Mar 5 row and preserved is_completed=true");

    const secondPreview = await post({ icalUrl: ICAL_URL, mode: "preview" });
    assert(secondPreview.status === 200 && (secondPreview.json.actions as unknown[]).length === 0, "Re-preview was not unchanged.");
    const secondApply = await post({
      icalUrl: ICAL_URL, mode: "apply", planId: secondPreview.json.planId,
      planHash: secondPreview.json.planHash, approvedActionIds: [],
    });
    const applied = secondApply.json.applied as Record<string, number>;
    assert(secondApply.status === 200 && Object.values(applied).every((count) => count === 0), "Second apply reported changes.");
    console.log("PASS re-preview/re-apply reported zero changes");

    const beforeStale = JSON.stringify(await loadGateRows());
    const stale = await post({
      icalUrl: ICAL_URL, mode: "apply", planId: preview.json.planId,
      planHash: preview.json.planHash, approvedActionIds: [adopt.actionId],
    });
    const afterStale = JSON.stringify(await loadGateRows());
    assert(stale.status === 409 && beforeStale === afterStale, "Stale apply did not return 409 without writes.");
    console.log("PASS stale plan returned 409 and made no writes");
  } finally {
    await cleanup();
  }
}

main().catch((error: unknown) => {
  console.error(`FAIL ${error instanceof Error ? error.message : "Unknown Stage 1 gate error"}`);
  process.exitCode = 1;
});
