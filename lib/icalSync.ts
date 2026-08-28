import { createHash } from "node:crypto";
import ical, { type DateWithTimeZone, type ParameterValue, type VEvent } from "node-ical";
import { addCalendarDays, toLocalDateString, toLocalTimeString } from "@/lib/datetime";
import { findMatch } from "@/lib/matchTasks";
import type { NewTask, Task } from "@/types/task";

export interface SyncDiff { field: "title" | "description" | "due_date" | "due_time" | "canvas_uid" | "source"; from: string | null; to: string | null }
export type IncomingTask = NewTask & { canvas_uid: string };
export interface SyncAction {
  actionId: string;
  keepBothActionId?: string;
  type: "create" | "update" | "adopt";
  defaultApproved: boolean;
  incoming: IncomingTask;
  existing?: Task;
  diff: SyncDiff[];
  score?: number;
  confidence?: "high" | "low";
}
export interface SyncPlan {
  planId: string;
  planHash: string;
  expandedRecurrences: number;
  truncated: boolean;
  counts: { create: number; update: number; adopt: number; unchanged: number };
  actions: SyncAction[];
  skipped: { noUid: number; noSummary: number; cancelled: number };
}
export interface ParsedCalendar {
  items: IncomingTask[];
  expandedRecurrences: number;
  truncated: boolean;
  skipped: SyncPlan["skipped"];
}

function text(value: ParameterValue | undefined): string {
  if (!value) return "";
  return (typeof value === "string" ? value : value.val).trim();
}

function normalizeCourseCode(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/^([A-Za-z]{2,4})\s*(\d{3}[A-Za-z]?)$/i, "$1 $2").toUpperCase();
}

export function extractCourseAndTitle(summary: string): { title: string; courseCode: string | null } {
  const original = summary.trim();
  const bracket = original.match(/\s*\[([^\]]+)\]\s*$/);
  if (bracket) {
    const token = bracket[1].match(/\b([A-Z]{2,4}\s?\d{3}[A-Z]?)\b/i)?.[1] ?? bracket[1].trim();
    const stripped = original.slice(0, bracket.index).trim();
    return { title: stripped || original, courseCode: normalizeCourseCode(token) };
  }
  const prefix = original.match(/^([A-Z]{2,4}\s?\d{3}[A-Z]?)\s*[-–—:]\s*/i);
  if (prefix) {
    const stripped = original.slice(prefix[0].length).trim();
    return { title: stripped || original, courseCode: normalizeCourseCode(prefix[1]) };
  }
  return { title: original, courseCode: null };
}

function toIncoming(event: VEvent, uid: string, start: DateWithTimeZone | undefined, end: DateWithTimeZone | undefined, recurringTimed: boolean): IncomingTask {
  const summary = text(event.summary);
  const { title, courseCode } = extractCourseAndTitle(summary);
  const isAllDay = Boolean(start?.dateOnly || event.datetype === "date");
  const dueDate = start ? toLocalDateString(start) : null;
  return {
    canvas_uid: uid,
    title,
    description: text(event.description) || null,
    due_date: dueDate,
    due_time: start && !isAllDay ? toLocalTimeString(start) : null,
    category: "classes",
    course_code: courseCode,
    is_pinned: false,
    is_completed: false,
    source: "ical",
    kind: recurringTimed ? "event" : "task",
    end_time: recurringTimed && end ? toLocalTimeString(end) : null,
    series_id: null,
    recurrence_rule: event.rrule?.toString() ?? null,
    series_until: null,
    import_batch_id: null,
  };
}

function recurrenceOverride(event: VEvent, occurrence: Date): Omit<VEvent, "recurrences"> | undefined {
  const dateKey = toLocalDateString(occurrence);
  return event.recurrences?.[occurrence.toISOString()] ?? event.recurrences?.[dateKey];
}

export async function parseCalendar(textBody: string, now = new Date()): Promise<ParsedCalendar> {
  const parsed = await ical.async.parseICS(textBody);
  const items: IncomingTask[] = [];
  const skipped = { noUid: 0, noSummary: 0, cancelled: 0 };
  let expandedRecurrences = 0;
  let truncated = false;
  const lower = new Date(now.getTime() - 30 * 86400000);
  const upper = new Date(now.getTime() + 180 * 86400000);

  for (const component of Object.values(parsed)) {
    if (!component || component.type !== "VEVENT") continue;
    const event = component as VEvent;
    if (!event.uid?.trim()) { skipped.noUid += 1; continue; }
    if (!text(event.summary)) { skipped.noSummary += 1; continue; }
    if (event.status === "CANCELLED") { skipped.cancelled += 1; continue; }
    if (!event.rrule) {
      items.push(toIncoming(event, event.uid, event.start, event.end, false));
      continue;
    }
    const duration = event.start && event.end ? event.end.getTime() - event.start.getTime() : null;
    const excluded = new Set(Object.values(event.exdate ?? {}).map((date) => toLocalDateString(date as DateWithTimeZone)));
    for (const occurrence of event.rrule.between(lower, upper, true)) {
      if (items.length >= 1000) { truncated = true; break; }
      const occurrenceDate = toLocalDateString(occurrence);
      const override = recurrenceOverride(event, occurrence);
      if (excluded.has(occurrenceDate) && !override) continue;
      if (override?.status === "CANCELLED") { skipped.cancelled += 1; continue; }
      const instance = override ? ({ ...event, ...override } as VEvent) : event;
      const start: DateWithTimeZone = (override?.start as DateWithTimeZone | undefined) ?? (occurrence as DateWithTimeZone);
      const end: DateWithTimeZone | undefined = (override?.end as DateWithTimeZone | undefined)
        ?? (duration === null ? undefined : new Date(occurrence.getTime() + duration) as DateWithTimeZone);
      items.push(toIncoming(instance, `${event.uid}::${occurrenceDate}`, start, end, Boolean(start && end && !start.dateOnly)));
      expandedRecurrences += 1;
    }
    if (truncated) break;
  }
  return { items, expandedRecurrences, truncated, skipped };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function digest(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

const canvasFields = ["title", "description", "due_date", "due_time"] as const;

function canvasDiff(existing: Task, incoming: IncomingTask): SyncDiff[] {
  return canvasFields.flatMap((field) => {
    if (field === "description" && !incoming.description) return [];
    return existing[field] === incoming[field] ? [] : [{ field, from: existing[field], to: incoming[field] }];
  });
}

export function buildSyncPlan(parsed: ParsedCalendar, linked: Task[], unlinked: Task[]): SyncPlan {
  const linkedByUid = new Map(linked.filter((row) => row.canvas_uid).map((row) => [row.canvas_uid, row]));
  const consumed = new Set<string>();
  const actions: SyncAction[] = [];
  let unchanged = 0;
  for (const incoming of parsed.items) {
    const existing = linkedByUid.get(incoming.canvas_uid);
    let action: Omit<SyncAction, "actionId"> | null = null;
    if (existing) {
      const diff = canvasDiff(existing, incoming);
      if (!diff.length) { unchanged += 1; continue; }
      action = { type: "update", defaultApproved: true, incoming, existing, diff };
    } else {
      const match = findMatch(incoming, unlinked.filter((row) => !consumed.has(row.id)));
      if (match) {
        consumed.add(match.row.id);
        const diff: SyncDiff[] = [
          ...canvasDiff(match.row, incoming),
          { field: "canvas_uid", from: null, to: incoming.canvas_uid },
          ...(match.row.source === "ical" ? [] : [{ field: "source" as const, from: match.row.source, to: "ical" }]),
        ];
        action = { type: "adopt", defaultApproved: match.confidence === "high", incoming, existing: match.row, diff, score: match.score, confidence: match.confidence };
      } else {
        action = { type: "create", defaultApproved: true, incoming, diff: [] };
      }
    }
    const actionId = digest({ type: action.type, uid: incoming.canvas_uid, existingId: action.existing?.id ?? null, incoming });
    actions.push({
      ...action,
      actionId,
      ...(action.type === "adopt" ? { keepBothActionId: digest({ actionId, alternative: "keep-both" }) } : {}),
    });
  }
  const counts = {
    create: actions.filter((action) => action.type === "create").length,
    update: actions.filter((action) => action.type === "update").length,
    adopt: actions.filter((action) => action.type === "adopt").length,
    unchanged,
  };
  const affected = [...linked, ...unlinked.filter((row) => consumed.has(row.id))]
    .map(({ id, updated_at }) => ({ id, updated_at })).sort((a, b) => a.id.localeCompare(b.id));
  return {
    planId: digest(parsed.items),
    planHash: digest(affected),
    expandedRecurrences: parsed.expandedRecurrences,
    truncated: parsed.truncated,
    counts,
    actions,
    skipped: parsed.skipped,
  };
}

export function applyActionToRow(action: SyncAction): NewTask | (NewTask & { id: string }) {
  if (action.type === "create") return action.incoming;
  const existing = action.existing;
  if (!existing) throw new Error(`Action ${action.actionId} is missing its existing row.`);
  const description = action.incoming.description || existing.description;
  return {
    ...existing,
    title: action.incoming.title,
    description,
    due_date: action.incoming.due_date,
    due_time: action.incoming.due_time,
    canvas_uid: action.type === "adopt" ? action.incoming.canvas_uid : existing.canvas_uid,
    source: action.type === "adopt" ? "ical" : existing.source,
  };
}

export function syncWindow(now = new Date()): { from: string; to: string } {
  const today = toLocalDateString(now);
  return { from: addCalendarDays(today, -30), to: addCalendarDays(today, 180) };
}
