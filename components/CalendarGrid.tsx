"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfWeek, format, isSameDay,
  isSameMonth, startOfMonth, startOfWeek, subMonths, subWeeks,
} from "date-fns";
import { AlignLeft, CalendarDays, CalendarPlus, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, MapPin, Pencil, Pin, Trash2, X } from "lucide-react";
import { createTask, deleteSeries, deleteTask, updateSeries, updateTask, type TaskDraft } from "@/app/actions/tasks";
import { CATEGORY_ORDER, CATEGORY_STYLES } from "@/lib/categories";
import { formatTimeRange, fromTimeInputValue, toLocalDateString, toTimeInputValue } from "@/lib/datetime";
import type { Task, TaskCategory, TaskUpdate } from "@/types/task";

export interface CalendarGridProps {
  tasks: Task[];
  scopeCategory?: TaskCategory;
  variant?: "full" | "compact";
  defaultView?: "month" | "week";
  onTasksChange?: (tasks: Task[]) => void;
}

type EditorState = { task: Task | null; date: string | null } | null;

function parseCalendarDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function calendarKey(value: Date): string {
  return format(value, "yyyy-MM-dd");
}

function sortDayTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "task" ? -1 : 1;
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99") || a.title.localeCompare(b.title);
  });
}

function TaskChip({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const style = CATEGORY_STYLES[task.category];
  const event = task.kind === "event";
  const time = event ? formatTimeRange(task.due_time, task.end_time) : task.due_time;
  return (
    <button type="button" onClick={(eventClick) => { eventClick.stopPropagation(); onOpen(); }} className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] leading-4 transition hover:brightness-95 focus:z-10 ${event ? `${style.soft} border-l-[3px] ${style.border}` : style.chip} ${task.is_completed ? "opacity-45" : ""}`} title={`${task.title}${time ? ` · ${time}` : ""}`}>
      <span className="flex min-w-0 items-center gap-1">
        {task.is_pinned && <Pin className="h-2.5 w-2.5 shrink-0 fill-current" />}
        {time && <span className="shrink-0 font-bold">{time}</span>}
        {task.course_code && <span className="shrink-0 opacity-80">{task.course_code}</span>}
        <span className={`truncate ${task.is_completed ? "line-through" : ""}`}>{task.title}</span>
      </span>
    </button>
  );
}

function TaskDetailsModal({ task, onClose, onEdit }: { task: Task; onClose: () => void; onEdit: () => void }) {
  const style = CATEGORY_STYLES[task.category];
  const dateLabel = task.due_date ? format(parseCalendarDate(task.due_date), "EEEE, MMMM d, yyyy") : "No date";
  const timeLabel = task.kind === "event" ? formatTimeRange(task.due_time, task.end_time) : task.due_time;
  const completedSubtasks = task.subtasks.filter((subtask) => subtask.is_completed).length;
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="task-details-title" className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        <header className="sticky top-0 z-10 -mx-5 -mt-5 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-5 py-5 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${style.soft}`}>{CATEGORY_STYLES[task.category].label}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold capitalize text-slate-500">{task.kind}</span>{task.is_pinned && <Pin className="h-4 w-4 fill-amber-500 text-amber-500" />}</div><h2 id="task-details-title" className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{task.title}</h2>{task.course_code && <p className="mt-1 text-sm font-bold text-slate-500">{task.course_code}</p>}</div><div className="flex shrink-0 items-center gap-1"><button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white"><Pencil className="h-3.5 w-3.5" />Edit</button><button type="button" onClick={onClose} aria-label="Close details" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div></header>
        <div className="mt-6 space-y-3">
          <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3"><CalendarDays className="mt-0.5 h-4 w-4 text-slate-400" /><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Date</p><p className="mt-0.5 text-sm font-semibold text-slate-800">{dateLabel}</p></div></div>
          <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3"><Clock3 className="mt-0.5 h-4 w-4 text-slate-400" /><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Time</p><p className="mt-0.5 text-sm font-semibold text-slate-800">{timeLabel || "No time"}</p></div></div>
          {task.kind === "event" && <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3"><MapPin className="mt-0.5 h-4 w-4 text-slate-400" /><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Location</p><p className="mt-0.5 text-sm font-semibold text-slate-800">{task.location || "No location added"}</p></div></div>}
          <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3"><AlignLeft className="mt-0.5 h-4 w-4 text-slate-400" /><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Notes</p><p className="mt-0.5 whitespace-pre-wrap text-sm leading-6 text-slate-700">{task.description || "No notes added"}</p></div></div>
          {task.kind === "task" && task.subtasks.length > 0 && <div className="rounded-2xl border border-slate-200 p-3"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Subtasks · {completedSubtasks}/{task.subtasks.length}</p><ul className="mt-2 space-y-2">{task.subtasks.map((subtask) => <li key={subtask.id} className={`flex items-center gap-2 text-sm ${subtask.is_completed ? "text-slate-400 line-through" : "text-slate-700"}`}><span className={`h-2 w-2 rounded-full ${subtask.is_completed ? "bg-emerald-500" : "bg-slate-300"}`} />{subtask.title}</li>)}</ul></div>}
        </div>
      </div>
    </div>
  );
}

export function TaskEditorModal({ state, scopeCategory, seriesCount, onClose, onSave, onDelete }: {
  state: NonNullable<EditorState>;
  scopeCategory?: TaskCategory;
  seriesCount: number;
  onClose: () => void;
  onSave: (draft: TaskDraft, scope: "one" | "all") => Promise<string | null>;
  onDelete: (scope: "one" | "all") => Promise<string | null>;
}) {
  const existing = state.task;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(existing?.due_date ?? state.date ?? "");
  const [time, setTime] = useState(toTimeInputValue(existing?.due_time ?? null));
  const [category, setCategory] = useState<TaskCategory>(scopeCategory ?? existing?.category ?? "classes");
  const [pinned, setPinned] = useState(existing?.is_pinned ?? false);
  const [completed, setCompleted] = useState(existing?.is_completed ?? false);
  const [location, setLocation] = useState(existing?.location ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [scope, setScope] = useState<"one" | "all">("one");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSeries = Boolean(existing?.series_id);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) { setError("Title is required."); return; }
    setBusy(true); setError(null);
    const result = await onSave({
      title: title.trim(), description: description.trim() || null, due_date: date || null,
      due_time: fromTimeInputValue(time), category: scopeCategory ?? category,
      location: location.trim() || null,
      course_code: existing?.course_code ?? null, is_pinned: pinned,
      is_completed: existing?.kind === "event" ? false : completed,
      source: existing?.source ?? "manual", kind: existing?.kind ?? "task",
      canvas_uid: existing?.canvas_uid ?? null, end_time: existing?.end_time ?? null,
      series_id: existing?.series_id ?? null, recurrence_rule: existing?.recurrence_rule ?? null,
      series_until: existing?.series_until ?? null, import_batch_id: existing?.import_batch_id ?? null,
    }, scope);
    setBusy(false);
    if (result) setError(result); else onClose();
  };

  const remove = async () => {
    setBusy(true); setError(null);
    const result = await onDelete(scope);
    setBusy(false);
    if (result) { setError(result); setConfirmDelete(false); } else onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="task-editor-title" className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{existing ? "Quick edit" : "New calendar task"}</p><h2 id="task-editor-title" className="mt-1 text-xl font-bold text-slate-950">{existing ? existing.title : "Add something due"}</h2></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close task editor" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block"><span className="text-sm font-semibold text-slate-700">Title</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-950 focus:ring-4 focus:ring-slate-100" /></label>
          <div className="grid grid-cols-2 gap-3"><label><span className="text-sm font-semibold text-slate-700">Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label><label><span className="text-sm font-semibold text-slate-700">Time</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label></div>
          {existing?.kind === "event" && <label className="block"><span className="text-sm font-semibold text-slate-700">Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Room, building, or link" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" /></label>}
          <label className="block"><span className="text-sm font-semibold text-slate-700">Notes</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Add details or preparation notes" className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-sm leading-6" /></label>
          <div><span className="text-sm font-semibold text-slate-700">Category</span>{scopeCategory ? <div className={`mt-1.5 inline-flex rounded-full px-3 py-1.5 text-sm font-semibold ${CATEGORY_STYLES[scopeCategory].soft}`}>{CATEGORY_STYLES[scopeCategory].label}</div> : <select value={category} onChange={(event) => setCategory(event.target.value as TaskCategory)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm">{CATEGORY_ORDER.map((item) => <option key={item} value={item}>{CATEGORY_STYLES[item].label}</option>)}</select>}</div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setPinned((value) => !value)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${pinned ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600"}`}><Pin className={`h-4 w-4 ${pinned ? "fill-current" : ""}`} />Pinned</button>{existing?.kind !== "event" && <button type="button" onClick={() => setCompleted((value) => !value)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${completed ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-600"}`}><Check className="h-4 w-4" />Completed</button>}</div>
          {isSeries && <fieldset className="rounded-2xl border border-violet-200 bg-violet-50 p-3"><legend className="px-1 text-sm font-bold text-violet-950">Apply to</legend><div className="mt-2 grid grid-cols-2 gap-2">{(["one", "all"] as const).map((value) => <label key={value} className={`cursor-pointer rounded-xl border p-3 text-sm ${scope === value ? "border-violet-500 bg-white font-semibold text-violet-950" : "border-transparent text-violet-700"}`}><input type="radio" name="series-scope" value={value} checked={scope === value} onChange={() => setScope(value)} className="mr-2 accent-violet-600" />{value === "one" ? "This occurrence" : `All ${seriesCount} occurrences`}</label>)}</div><p className="mt-2 text-xs text-violet-700">Editing one occurrence detaches it from future series updates.</p></fieldset>}
          {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            {existing ? (!confirmDelete ? <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" />Delete</button> : <div className="flex items-center gap-2 text-sm"><span className="font-semibold text-rose-700">Delete {isSeries && scope === "all" ? `${seriesCount} occurrences` : "this item"}?</span><button type="button" onClick={() => void remove()} className="rounded-lg bg-rose-600 px-2.5 py-1.5 font-semibold text-white">Yes</button><button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg px-2 py-1.5 text-slate-500">No</button></div>) : <span />}
            <button type="submit" disabled={busy || !title.trim()} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-45">{busy ? "Saving…" : existing && isSeries && scope === "all" ? `Update ${seriesCount} occurrences` : existing ? "Save changes" : "Add task"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CalendarGrid({ tasks, scopeCategory, variant = "full", defaultView, onTasksChange }: CalendarGridProps) {
  const router = useRouter();
  const [view, setView] = useState<"month" | "week">(defaultView ?? "month");
  const todayKey = toLocalDateString(new Date());
  const [anchor, setAnchor] = useState(() => parseCalendarDate(todayKey));
  const [localTasks, setLocalTasks] = useState(tasks);
  const [previousTasks, setPreviousTasks] = useState(tasks);
  const [editor, setEditor] = useState<EditorState>(null);
  const [detailsTask, setDetailsTask] = useState<Task | null>(null);
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const [unscheduledOpen, setUnscheduledOpen] = useState(true);
  const [mutationError, setMutationError] = useState<string | null>(null);
  if (tasks !== previousTasks) {
    setPreviousTasks(tasks);
    setLocalTasks(tasks);
  }

  const activeTasks = onTasksChange ? tasks : localTasks;
  const replaceTasks = (next: Task[]) => {
    if (onTasksChange) onTasksChange(next);
    else setLocalTasks(next);
  };

  const scopedTasks = useMemo(() => scopeCategory ? activeTasks.filter((task) => task.category === scopeCategory) : activeTasks, [activeTasks, scopeCategory]);
  const byDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of scopedTasks) {
      if (!task.due_date) continue;
      const rows = map.get(task.due_date) ?? []; rows.push(task); map.set(task.due_date, rows);
    }
    for (const [key, rows] of map) map.set(key, sortDayTasks(rows));
    return map;
  }, [scopedTasks]);
  const unscheduled = useMemo(() => scopedTasks.filter((task) => !task.due_date), [scopedTasks]);
  const days = useMemo(() => {
    const start = view === "month" ? startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 }) : startOfWeek(anchor, { weekStartsOn: 0 });
    const end = view === "month" ? addDays(start, 41) : endOfWeek(start, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [anchor, view]);
  const visibleLimit = variant === "compact" ? 2 : 3;

  const navigate = (direction: -1 | 1) => setAnchor((current) => view === "month" ? (direction < 0 ? subMonths(current, 1) : addMonths(current, 1)) : (direction < 0 ? subWeeks(current, 1) : addWeeks(current, 1)));

  const saveTask = async (draft: TaskDraft, scope: "one" | "all"): Promise<string | null> => {
    setMutationError(null);
    if (!editor) return "Task editor is not open.";
    if (!editor.task) {
      const tempId = `optimistic-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const optimistic = { ...draft, id: tempId, created_at: now, updated_at: now } as Task;
      replaceTasks([...activeTasks, optimistic]);
      const result = await createTask(draft);
      if (!result.ok) { replaceTasks(activeTasks); setMutationError(result.error); return result.error; }
      replaceTasks([...activeTasks, result.task]); router.refresh(); return null;
    }
    const original = activeTasks;
    const row = editor.task;
    const patch = draft as TaskUpdate;
    const { due_date: _occurrenceDate, ...seriesPatch } = patch;
    void _occurrenceDate;
    replaceTasks(activeTasks.map((task) => {
      if (row.series_id && scope === "all" && task.series_id === row.series_id) return { ...task, ...seriesPatch };
      if (task.id === row.id) return { ...task, ...patch, ...(row.series_id && scope === "one" ? { series_id: null, recurrence_rule: null, series_until: null } : {}) };
      return task;
    }));
    const result = row.series_id ? await updateSeries(row.series_id, row.id, patch, scope) : await updateTask(row.id, patch);
    if (!result.ok) { replaceTasks(original); setMutationError(result.error); return result.error; }
    if (result.tasks) {
      const changed = new Map(result.tasks.map((task) => [task.id, task]));
      replaceTasks(original.map((task) => changed.get(task.id) ?? task));
    } else replaceTasks(original.map((task) => task.id === result.task.id ? result.task : task));
    router.refresh(); return null;
  };

  const removeTask = async (scope: "one" | "all"): Promise<string | null> => {
    if (!editor?.task) return "Task not found.";
    const original = activeTasks; const row = editor.task;
    replaceTasks(activeTasks.filter((task) => row.series_id && scope === "all" ? task.series_id !== row.series_id : task.id !== row.id));
    const result = row.series_id ? await deleteSeries(row.series_id, row.id, scope) : await deleteTask(row.id);
    if (!result.ok) { replaceTasks(original); setMutationError(result.error); return result.error; }
    router.refresh(); return null;
  };

  const periodLabel = view === "month" ? format(anchor, "MMMM yyyy") : `${format(days[0], "MMM d")} – ${format(days.at(-1)!, "MMM d, yyyy")}`;
  return (
    <section className={`overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${variant === "compact" ? "text-sm" : ""}`}>
      <header className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Calendar</p><h2 className="mt-1 text-xl font-bold tracking-tight text-slate-950">{periodLabel}</h2></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-200 p-1"><button type="button" onClick={() => navigate(-1)} aria-label={`Previous ${view}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={() => setAnchor(parseCalendarDate(todayKey))} className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">Today</button><button type="button" onClick={() => navigate(1)} aria-label={`Next ${view}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button></div>
          <div className="flex rounded-xl bg-slate-100 p-1" aria-label="Calendar view">{(["month", "week"] as const).map((item) => <button key={item} type="button" onClick={() => setView(item)} className={`rounded-lg px-3 py-2 text-xs font-bold capitalize ${view === item ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>{item}</button>)}</div>
        </div>
      </header>
      {mutationError && <div className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-sm font-medium text-rose-700" role="alert">{mutationError}</div>}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day} className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400">{day}</div>)}</div>
          <div className="grid grid-cols-7">{days.map((day) => {
            const key = calendarKey(day); const dayTasks = byDate.get(key) ?? []; const overflow = dayTasks.length - visibleLimit;
            const currentMonth = view === "week" || isSameMonth(day, anchor); const today = isSameDay(day, parseCalendarDate(todayKey));
            return <div key={key} role="button" tabIndex={0} aria-label={`Add task on ${format(day, "MMMM d, yyyy")}`} onClick={() => setEditor({ task: null, date: key })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setEditor({ task: null, date: key }); } }} className={`relative min-h-28 border-b border-r border-slate-100 p-1.5 text-left focus:z-10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-900 ${variant === "compact" ? "min-h-24" : "sm:min-h-32"} ${currentMonth ? "bg-white" : "bg-slate-50/70"}`}>
              <div className="mb-1 flex items-center justify-between"><span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-bold ${today ? "bg-slate-950 text-white ring-4 ring-slate-200" : currentMonth ? "text-slate-700" : "text-slate-300"}`}>{format(day, "d")}</span>{dayTasks.length === 0 && <CalendarPlus className="h-3.5 w-3.5 text-slate-200" />}</div>
              <div className="space-y-1">{dayTasks.slice(0, visibleLimit).map((task) => <TaskChip key={task.id} task={task} onOpen={() => setDetailsTask(task)} />)}{overflow > 0 && <button type="button" onClick={(event) => { event.stopPropagation(); setDetailDate(detailDate === key ? null : key); }} className="w-full rounded-md px-1.5 py-0.5 text-left text-[11px] font-bold text-slate-500 hover:bg-slate-100">+{overflow} more</button>}</div>
              {detailDate === key && <div className="absolute left-2 top-10 z-30 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="mb-2 flex items-center justify-between"><p className="text-sm font-bold text-slate-900">{format(day, "EEEE, MMM d")}</p><button type="button" onClick={() => setDetailDate(null)} aria-label="Close day details"><X className="h-4 w-4 text-slate-400" /></button></div><div className="max-h-56 space-y-1 overflow-y-auto">{dayTasks.map((task) => <TaskChip key={task.id} task={task} onOpen={() => { setDetailDate(null); setDetailsTask(task); }} />)}</div></div>}
            </div>;
          })}</div>
        </div>
      </div>
      <div className="border-t border-slate-200 bg-slate-50/70">
        <button type="button" onClick={() => setUnscheduledOpen((open) => !open)} className="flex w-full items-center justify-between px-4 py-3 text-left sm:px-6"><span className="flex items-center gap-2 text-sm font-bold text-slate-700"><Clock3 className="h-4 w-4 text-slate-400" />Unscheduled <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">{unscheduled.length}</span></span>{unscheduledOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}</button>
        {unscheduledOpen && <div className="border-t border-slate-200 px-4 py-3 sm:px-6">{unscheduled.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{unscheduled.map((task) => <TaskChip key={task.id} task={task} onOpen={() => setDetailsTask(task)} />)}</div> : <p className="text-sm text-slate-500">Everything has a date. Tasks without one will stay safely visible here.</p>}</div>}
      </div>
      {detailsTask && <TaskDetailsModal task={detailsTask} onClose={() => setDetailsTask(null)} onEdit={() => { setDetailsTask(null); setEditor({ task: detailsTask, date: detailsTask.due_date }); }} />}
      {editor && <TaskEditorModal state={editor} scopeCategory={scopeCategory} seriesCount={editor.task?.series_id ? activeTasks.filter((task) => task.series_id === editor.task?.series_id).length : 0} onClose={() => setEditor(null)} onSave={saveTask} onDelete={removeTask} />}
    </section>
  );
}
