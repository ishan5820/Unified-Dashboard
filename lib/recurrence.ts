import { addCalendarDays, isCalendarDate, weekdayForDate } from "@/lib/datetime";
import type { NewTask, RecurrenceSpec, Weekday } from "@/types/task";

const DAY_INDEX: Record<Weekday, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const DAY_LABEL: Record<Weekday, string> = { SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat" };
export const MAX_SERIES_OCCURRENCES = 500;

export class RecurrenceLimitError extends Error {
  constructor(limit = MAX_SERIES_OCCURRENCES) {
    super(`Recurring series exceeds the ${limit}-occurrence safety limit.`);
    this.name = "RecurrenceLimitError";
  }
}

export function expandSeries(spec: RecurrenceSpec, seriesId: string): NewTask[] {
  if (!isCalendarDate(spec.startDate) || !isCalendarDate(spec.untilDate)) return [];
  if (spec.untilDate < spec.startDate || spec.byDay.length === 0) return [];
  const allowed = new Set(spec.byDay.map((day) => DAY_INDEX[day]));
  const skipped = new Set(spec.skipDates ?? []);
  const recurrenceRule = `WEEKLY;BYDAY=${spec.byDay.join(",")}`;
  const results: NewTask[] = [];
  for (let date = spec.startDate; date <= spec.untilDate; date = addCalendarDays(date, 1)) {
    if (!allowed.has(weekdayForDate(date)) || skipped.has(date)) continue;
    if (results.length >= MAX_SERIES_OCCURRENCES) throw new RecurrenceLimitError();
    results.push({
      canvas_uid: null,
      title: spec.title,
      description: null,
      due_date: date,
      due_time: spec.startTime,
      category: spec.category,
      course_code: spec.courseCode,
      is_pinned: false,
      is_completed: false,
      source: "manual",
      kind: spec.kind,
      end_time: spec.kind === "event" ? spec.endTime : null,
      series_id: seriesId,
      recurrence_rule: recurrenceRule,
      series_until: spec.untilDate,
      import_batch_id: null,
    });
  }
  return results;
}

export function describeRule(rule: string): string {
  const byDay = rule.match(/(?:^|;)BYDAY=([^;]+)/i)?.[1];
  if (!byDay) return "Weekly";
  const labels = byDay.split(",").map((day) => DAY_LABEL[day.toUpperCase() as Weekday]).filter(Boolean);
  return labels.length ? `Every ${labels.join(", ")}` : "Weekly";
}
