"use client";

import { useState } from "react";
import { CalendarRange, Check, X } from "lucide-react";
import { createSeries, updateSeries } from "@/app/actions/tasks";
import { CATEGORY_ORDER, CATEGORY_STYLES } from "@/lib/categories";
import { addCalendarDays, formatTimeRange, fromTimeInputValue, isCalendarDate, toLocalDateString, toTimeInputValue } from "@/lib/datetime";
import { describeRule, expandSeries } from "@/lib/recurrence";
import { isWeekday, type RecurrenceSpec, type Task, type TaskCategory, type TaskUpdate, type Weekday } from "@/types/task";

const PRESET_KEY = "college-organizer-semester-dates";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS: { value: Weekday; label: string }[] = [
  { value: "SU", label: "S" }, { value: "MO", label: "M" }, { value: "TU", label: "T" },
  { value: "WE", label: "W" }, { value: "TH", label: "T" }, { value: "FR", label: "F" }, { value: "SA", label: "S" },
];

interface SemesterPreset { startDate: string; untilDate: string }

function loadPreset(): SemesterPreset {
  const today = toLocalDateString(new Date());
  const fallback = { startDate: today, untilDate: addCalendarDays(today, 112) };
  if (typeof window === "undefined") return fallback;
  try {
    const stored = JSON.parse(window.localStorage.getItem(PRESET_KEY) ?? "null") as SemesterPreset | null;
    return stored && isCalendarDate(stored.startDate) && isCalendarDate(stored.untilDate) ? stored : fallback;
  } catch { return fallback; }
}

function seriesWeekdays(task: Task | undefined): Weekday[] {
  const values = task?.recurrence_rule?.match(/BYDAY=([^;]+)/)?.[1]?.split(",") ?? [];
  return values.filter(isWeekday) as Weekday[];
}

function shortDate(value: string | null | undefined): string {
  if (!value) return "";
  const [, month, day] = value.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

export interface RecurringEventModalProps {
  open: boolean;
  onClose: () => void;
  initialCategory?: TaskCategory;
  lockCategory?: boolean;
  existingSeries?: Task[];
  onChanged?: (tasks: Task[], mode: "created" | "updated") => void;
}

export function RecurringEventModal({ open, onClose, initialCategory = "classes", lockCategory = false, existingSeries = [], onChanged }: RecurringEventModalProps) {
  const representative = existingSeries[0];
  const [preset] = useState(() => loadPreset());
  const sortedDates = existingSeries.map((task) => task.due_date).filter((date): date is string => Boolean(date)).sort();
  const editing = Boolean(representative?.series_id);
  const [title, setTitle] = useState(representative?.title ?? "");
  const [courseCode, setCourseCode] = useState(representative?.course_code ?? "");
  const [category, setCategory] = useState<TaskCategory>(initialCategory ?? representative?.category ?? "classes");
  const [weekdays, setWeekdays] = useState<Weekday[]>(seriesWeekdays(representative).length ? seriesWeekdays(representative) : ["MO", "WE", "FR"]);
  const [startTime, setStartTime] = useState(toTimeInputValue(representative?.due_time ?? "9:00 AM"));
  const [endTime, setEndTime] = useState(toTimeInputValue(representative?.end_time ?? "10:00 AM"));
  const [startDate, setStartDate] = useState(sortedDates[0] ?? preset.startDate);
  const [untilDate, setUntilDate] = useState(sortedDates.at(-1) ?? preset.untilDate);
  const [skipText, setSkipText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const skipDates = skipText.split(",").map((value) => value.trim()).filter(Boolean);
  const invalidSkip = skipDates.find((value) => !isCalendarDate(value));
  const spec: RecurrenceSpec = {
    title: title.trim() || "Preview", category: lockCategory ? initialCategory : category, courseCode: courseCode.trim() || null,
    kind: "event", byDay: weekdays, startDate, untilDate,
    startTime: fromTimeInputValue(startTime), endTime: fromTimeInputValue(endTime), skipDates,
  };
  let preview: ReturnType<typeof expandSeries> = [];
  try { preview = invalidSkip ? [] : expandSeries(spec, "preview"); }
  catch { preview = []; }

  if (!open) return null;

  const toggleWeekday = (day: Weekday) => setWeekdays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!title.trim()) { setError("Title is required."); return; }
    if (!weekdays.length) { setError("Choose at least one weekday."); return; }
    if (!isCalendarDate(startDate) || !isCalendarDate(untilDate) || untilDate < startDate) { setError("Choose a valid semester date range."); return; }
    if (invalidSkip) { setError(`Skip date ${invalidSkip} must use YYYY-MM-DD.`); return; }
    if (!preview.length && !editing) { setError("These settings do not create any occurrences."); return; }
    setBusy(true);
    window.localStorage.setItem(PRESET_KEY, JSON.stringify({ startDate, untilDate } satisfies SemesterPreset));
    const targetCategory = lockCategory ? initialCategory : category;
    if (editing && representative?.series_id) {
      const patch: TaskUpdate = {
        title: title.trim(), category: targetCategory, course_code: courseCode.trim() || null,
        due_time: fromTimeInputValue(startTime), end_time: fromTimeInputValue(endTime), kind: "event",
      };
      const result = await updateSeries(representative.series_id, representative.id, patch, "all");
      setBusy(false);
      if (!result.ok) { setError(result.error); return; }
      const changed = result.tasks ?? [result.task];
      onChanged?.(changed, "updated");
      setSuccess(`Updated ${result.count ?? changed.length} occurrences.`);
    } else {
      const result = await createSeries({ ...spec, category: targetCategory });
      setBusy(false);
      if (!result.ok) { setError(result.error); return; }
      const changed = result.tasks ?? [result.task];
      onChanged?.(changed, "created");
      setSuccess(`Added ${result.count ?? changed.length} recurring events.`);
    }
  };

  const firstThree = preview.slice(0, 3).map((row) => row.due_date).filter(Boolean);
  const finalDate = preview.at(-1)?.due_date;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="recurring-title" className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        <header className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-500">{editing ? "Edit routine" : "Add recurring"}</p><h2 id="recurring-title" className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{editing ? representative?.title : "Plan the whole semester once."}</h2><p className="mt-1 text-sm text-slate-500">Lectures, meetings, practices, and everything else that repeats.</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close recurring event editor" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></header>
        {success ? <div className="mt-8 rounded-3xl bg-emerald-50 p-8 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white"><Check className="h-6 w-6" /></span><p className="mt-4 text-lg font-bold text-emerald-950">{success}</p><button type="button" onClick={onClose} className="mt-5 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white">Done</button></div> : <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="text-sm font-semibold text-slate-700">Title</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Weekly project meeting" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label><label><span className="text-sm font-semibold text-slate-700">Course or group code</span><input value={courseCode} onChange={(event) => setCourseCode(event.target.value)} placeholder="PHI 317K" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label><label><span className="text-sm font-semibold text-slate-700">Category</span>{lockCategory ? <div className={`mt-1.5 rounded-xl px-3 py-2.5 text-sm font-bold ${CATEGORY_STYLES[initialCategory].soft}`}>{CATEGORY_STYLES[initialCategory].label}</div> : <select value={category} onChange={(event) => setCategory(event.target.value as TaskCategory)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">{CATEGORY_ORDER.map((item) => <option key={item} value={item}>{CATEGORY_STYLES[item].label}</option>)}</select>}</label></div>
          <fieldset><legend className="text-sm font-semibold text-slate-700">Repeats on</legend><div className="mt-2 grid grid-cols-7 gap-2">{DAYS.map((day, index) => <button key={day.value} type="button" disabled={editing} onClick={() => toggleWeekday(day.value)} aria-pressed={weekdays.includes(day.value)} aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][index]} className={`aspect-square rounded-xl text-sm font-bold ${weekdays.includes(day.value) ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500"} disabled:opacity-65`}>{day.label}</button>)}</div></fieldset>
          <div className="grid grid-cols-2 gap-4"><label><span className="text-sm font-semibold text-slate-700">Starts</span><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label><label><span className="text-sm font-semibold text-slate-700">Ends</span><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label></div>
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4"><div className="flex items-center gap-2 text-sm font-bold text-indigo-950"><CalendarRange className="h-4 w-4" />Semester preset</div><p className="mt-1 text-xs leading-5 text-indigo-700">These dates are remembered on this device and prefilled next time.</p><div className="mt-3 grid grid-cols-2 gap-3"><label><span className="text-xs font-semibold text-indigo-900">First day</span><input disabled={editing} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm disabled:bg-indigo-50" /></label><label><span className="text-xs font-semibold text-indigo-900">Last day</span><input disabled={editing} type="date" value={untilDate} onChange={(event) => setUntilDate(event.target.value)} className="mt-1 w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm disabled:bg-indigo-50" /></label></div>{editing && <p className="mt-2 text-xs font-medium text-indigo-700">Editing changes the details and time for this series. Its established meeting dates stay in place.</p>}</div>
          <label className="block"><span className="text-sm font-semibold text-slate-700">Skip dates <span className="font-normal text-slate-400">(optional)</span></span><input disabled={editing} value={skipText} onChange={(event) => setSkipText(event.target.value)} placeholder="2026-09-07, 2026-11-27" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-50" /><span className="mt-1 block text-xs text-slate-400">Comma-separated YYYY-MM-DD dates</span></label>
          {!editing && <div className="rounded-2xl bg-slate-950 p-4 text-white"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Live preview</p><p className="mt-1 text-lg font-bold">Creates {preview.length} occurrences{preview.length ? `, ${shortDate(preview[0].due_date)} – ${shortDate(finalDate)}` : ""}</p></div><p className="text-right text-xs text-slate-300">{describeRule(`WEEKLY;BYDAY=${weekdays.join(",")}`)}<br />{formatTimeRange(fromTimeInputValue(startTime), fromTimeInputValue(endTime))}</p></div><p className="mt-3 text-xs leading-5 text-slate-300">{preview.length ? `${firstThree.join(" · ")}${preview.length > 3 && finalDate ? ` … last on ${finalDate}` : ""}` : "Choose days and a valid date range to see the schedule."}</p></div>}
          {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button><button type="submit" disabled={busy || !title.trim()} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-45">{busy ? "Saving…" : editing ? "Update series" : `Add ${preview.length || ""} events`}</button></div>
        </form>}
      </div>
    </div>
  );
}
