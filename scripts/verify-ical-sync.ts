import assert from "node:assert/strict";
import { parseCalendar } from "../lib/icalSync";

async function main(): Promise<void> {
  process.env.TZ = "UTC";
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:all-day-assignment",
    "DTSTART;VALUE=DATE:20260908",
    "SUMMARY:All-day Canvas assignment [ECO 304K]",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:timed-assignment",
    "DTSTART:20260909T045900Z",
    "SUMMARY:Timed Canvas assignment [ECO 304K]",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:all-day-series",
    "DTSTART;VALUE=DATE:20260908",
    "RRULE:FREQ=WEEKLY;COUNT=2",
    "SUMMARY:All-day series [ECO 304K]",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const parsed = await parseCalendar(calendar, new Date("2026-08-28T17:00:00Z"));
  const byUid = new Map(parsed.items.map((item) => [item.canvas_uid, item]));
  assert.equal(byUid.get("all-day-assignment")?.due_date, "2026-09-08", "All-day dates must not shift on a UTC server.");
  assert.equal(byUid.get("all-day-assignment")?.due_time, null);
  assert.equal(byUid.get("timed-assignment")?.due_date, "2026-09-08", "Timed UTC events should convert to the app timezone.");
  assert.equal(byUid.get("timed-assignment")?.due_time, "11:59 PM");
  assert.equal(byUid.get("all-day-series::2026-09-08")?.due_date, "2026-09-08");
  assert.equal(byUid.get("all-day-series::2026-09-15")?.due_date, "2026-09-15");
  console.log("PASS Canvas all-day and timed dates remain correct on UTC servers.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Canvas date verification failed.");
  process.exitCode = 1;
});
