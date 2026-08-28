"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, ListPlus, MoreHorizontal, Pin, Plus, Trash2 } from "lucide-react";
import {
  addSubtask, createTask, deleteSeries, deleteSubtask, deleteTask, deleteTasks,
  toggleComplete, togglePin, toggleSubtask, updateSeries, updateTask, type TaskDraft,
} from "@/app/actions/tasks";
import { TaskEditorModal } from "@/components/CalendarGrid";
import { CATEGORY_STYLES } from "@/lib/categories";
import { addCalendarDays, compareTimes, formatTimeRange, fromTimeInputValue, toLocalDateString, weekdayForDate } from "@/lib/datetime";
import { describeRule } from "@/lib/recurrence";
import { formatRelativeDue, type RelativeDueTone } from "@/lib/relativeDate";
import type { Task, TaskCategory, TaskUpdate } from "@/types/task";

interface CategoryTaskListProps {
  category: TaskCategory;
  initialTasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
  onEditSeries: (seriesTasks: Task[]) => void;
}

const TONE_CLASS: Record<RelativeDueTone, string> = {
  none: "text-slate-400", overdue: "text-rose-600", today: "text-emerald-700",
  soon: "text-amber-700", normal: "text-slate-500",
};
const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function sortTasks(rows: Task[]): Task[] {
  return [...rows].sort((a, b) =>
    (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99") ||
    compareTimes(a.due_time, b.due_time) ||
    a.title.localeCompare(b.title));
}

function Section({ title, count, open, onToggle, children }: {
  title: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <section className="border-b border-slate-200 last:border-0">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2 px-4 py-3 text-left sm:px-5">
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">{title}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{count}</span>
      </button>
      {open && children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 pb-5 text-sm leading-6 text-slate-500">{children}</p>;
}

export function CategoryTaskList({ category, initialTasks, onTasksChange, onEditSeries }: CategoryTaskListProps) {
  const router = useRouter();
  const style = CATEGORY_STYLES[category];
  const tasks = initialTasks;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [newKind, setNewKind] = useState<"task" | "event">("task");
  const [pinned, setPinned] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sections, setSections] = useState({ pinned: true, tasks: true, completed: false, schedule: false });
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmSeries, setConfirmSeries] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [addingSubtaskId, setAddingSubtaskId] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskBusyId, setSubtaskBusyId] = useState<string | null>(null);

  const taskRows = useMemo(() => tasks.filter((task) => task.kind === "task"), [tasks]);
  const pinnedRows = useMemo(() => sortTasks(taskRows.filter((task) => task.is_pinned && !task.is_completed)), [taskRows]);
  const openRows = useMemo(() => sortTasks(taskRows.filter((task) => !task.is_pinned && !task.is_completed)), [taskRows]);
  const completedRows = useMemo(() => sortTasks(taskRows.filter((task) => task.is_completed)), [taskRows]);
  const events = useMemo(() => sortTasks(tasks.filter((task) => task.kind === "event")), [tasks]);

  const today = toLocalDateString(new Date());
  const weekStart = addCalendarDays(today, -weekdayForDate(today));
  const weekEnd = addCalendarDays(weekStart, 6);
  const weeklyEvents = events.filter((task) => task.due_date && task.due_date >= weekStart && task.due_date <= weekEnd);
  const seriesGroups = useMemo(() => {
    const groups = new Map<string, Task[]>();
    for (const task of weeklyEvents) {
      const key = task.series_id ?? task.id;
      groups.set(key, [...(groups.get(key) ?? []), task]);
    }
    return [...groups.entries()].map(([key, occurrences]) => ({
      key,
      occurrences,
      all: tasks.filter((task) => task.series_id ? task.series_id === occurrences[0].series_id : task.id === occurrences[0].id),
    }));
  }, [tasks, weeklyEvents]);

  const toggleSection = (key: keyof typeof sections) => setSections((current) => ({ ...current, [key]: !current[key] }));

  const addTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) { setAddError("Enter a task title."); return; }
    setBusy(true); setAddError(null);
    const tempId = `optimistic-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const draft: TaskDraft = {
      title: title.trim(), due_date: date || null, due_time: fromTimeInputValue(time), category,
      location: newKind === "event" ? location.trim() || null : null,
      course_code: null, is_pinned: pinned, is_completed: false, source: "manual", kind: newKind,
      canvas_uid: null, description: null, end_time: newKind === "event" ? fromTimeInputValue(endTime) : null, series_id: null,
      recurrence_rule: null, series_until: null, import_batch_id: null,
    };
    const optimistic = { ...draft, id: tempId, created_at: now, updated_at: now } as Task;
    onTasksChange([...tasks, optimistic]);
    const result = await createTask(draft);
    setBusy(false);
    if (!result.ok) { onTasksChange(tasks); setAddError(result.error); return; }
    onTasksChange([...tasks, result.task]);
    setTitle(""); setDate(""); setTime(""); setEndTime(""); setLocation(""); setPinned(false); setNewKind("task");
    router.refresh();
  };

  const optimisticUpdate = async (row: Task, patch: TaskUpdate, action: () => ReturnType<typeof updateTask>) => {
    const original = tasks;
    setMutationError(null);
    onTasksChange(tasks.map((task) => task.id === row.id ? { ...task, ...patch } : task));
    const result = await action();
    if (!result.ok) { onTasksChange(original); setMutationError(result.error); return; }
    onTasksChange(original.map((task) => task.id === row.id ? result.task : task));
    router.refresh();
  };

  const saveEdit = async (draft: TaskDraft, scope: "one" | "all"): Promise<string | null> => {
    if (!editing) return "Task not found.";
    const original = tasks;
    const patch = draft as TaskUpdate;
    const { due_date: _occurrenceDate, ...seriesPatch } = patch;
    void _occurrenceDate;
    onTasksChange(tasks.map((task) => {
      if (editing.series_id && scope === "all" && task.series_id === editing.series_id) return { ...task, ...seriesPatch };
      if (task.id === editing.id) return { ...task, ...patch, ...(editing.series_id && scope === "one" ? { series_id: null, recurrence_rule: null, series_until: null } : {}) };
      return task;
    }));
    const result = editing.series_id
      ? await updateSeries(editing.series_id, editing.id, patch, scope)
      : await updateTask(editing.id, patch);
    if (!result.ok) { onTasksChange(original); return result.error; }
    const changed = new Map((result.tasks ?? [result.task]).map((task) => [task.id, task]));
    onTasksChange(original.map((task) => changed.get(task.id) ?? task));
    router.refresh(); return null;
  };

  const deleteEdit = async (scope: "one" | "all"): Promise<string | null> => {
    if (!editing) return "Task not found.";
    const original = tasks;
    onTasksChange(tasks.filter((task) => editing.series_id && scope === "all" ? task.series_id !== editing.series_id : task.id !== editing.id));
    const result = editing.series_id ? await deleteSeries(editing.series_id, editing.id, scope) : await deleteTask(editing.id);
    if (!result.ok) { onTasksChange(original); return result.error; }
    router.refresh(); return null;
  };

  const clearCompleted = async () => {
    const original = tasks;
    const ids = completedRows.map((task) => task.id);
    onTasksChange(tasks.filter((task) => !ids.includes(task.id)));
    const result = await deleteTasks(ids);
    setConfirmClear(false);
    if (!result.ok) { onTasksChange(original); setMutationError(result.error); return; }
    router.refresh();
  };

  const removeSeries = async (group: { key: string; occurrences: Task[]; all: Task[] }) => {
    const representative = group.occurrences[0];
    const original = tasks;
    onTasksChange(tasks.filter((task) => representative.series_id ? task.series_id !== representative.series_id : task.id !== representative.id));
    const result = representative.series_id
      ? await deleteSeries(representative.series_id, representative.id, "all")
      : await deleteTask(representative.id);
    setConfirmSeries(null);
    if (!result.ok) { onTasksChange(original); setMutationError(result.error); return; }
    router.refresh();
  };

  const toggleExpanded = (taskId: string) => {
    setExpandedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };

  const beginAddingSubtask = (taskId: string) => {
    setExpandedTaskIds((current) => new Set(current).add(taskId));
    setAddingSubtaskId(taskId);
    setSubtaskTitle("");
    setMenuId(null);
    setMutationError(null);
  };

  const submitSubtask = async (event: React.FormEvent, task: Task) => {
    event.preventDefault();
    if (!subtaskTitle.trim()) return;
    setSubtaskBusyId(task.id); setMutationError(null);
    const result = await addSubtask(task.id, subtaskTitle);
    setSubtaskBusyId(null);
    if (!result.ok) { setMutationError(result.error); return; }
    onTasksChange(tasks.map((row) => row.id === task.id ? result.task : row));
    setSubtaskTitle(""); setAddingSubtaskId(null);
    router.refresh();
  };

  const changeSubtaskCompletion = async (task: Task, subtaskId: string, completed: boolean) => {
    const original = tasks;
    setSubtaskBusyId(subtaskId); setMutationError(null);
    onTasksChange(tasks.map((row) => row.id === task.id ? {
      ...row,
      subtasks: row.subtasks.map((subtask) => subtask.id === subtaskId ? { ...subtask, is_completed: completed } : subtask),
    } : row));
    const result = await toggleSubtask(task.id, subtaskId, completed);
    setSubtaskBusyId(null);
    if (!result.ok) { onTasksChange(original); setMutationError(result.error); return; }
    onTasksChange(original.map((row) => row.id === task.id ? result.task : row));
    router.refresh();
  };

  const removeSubtask = async (task: Task, subtaskId: string) => {
    const original = tasks;
    setSubtaskBusyId(subtaskId); setMutationError(null);
    onTasksChange(tasks.map((row) => row.id === task.id ? {
      ...row, subtasks: row.subtasks.filter((subtask) => subtask.id !== subtaskId),
    } : row));
    const result = await deleteSubtask(task.id, subtaskId);
    setSubtaskBusyId(null);
    if (!result.ok) { onTasksChange(original); setMutationError(result.error); return; }
    onTasksChange(original.map((row) => row.id === task.id ? result.task : row));
    router.refresh();
  };

  const row = (task: Task) => {
    const due = formatRelativeDue(task.due_date, task.due_time);
    const expanded = expandedTaskIds.has(task.id);
    const completedSubtasks = task.subtasks.filter((subtask) => subtask.is_completed).length;
    return (
      <article key={task.id} className="group border-t border-slate-100 first:border-0">
        <div className="flex items-start gap-2 px-4 py-3 sm:px-5">
          <button type="button" onClick={() => toggleExpanded(task.id)} disabled={!task.subtasks.length && addingSubtaskId !== task.id} aria-label={`${expanded ? "Collapse" : "Expand"} subtasks for ${task.title}`} aria-expanded={expanded} className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 disabled:text-transparent">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
          <button type="button" onClick={() => void optimisticUpdate(task, { is_completed: !task.is_completed }, () => toggleComplete(task.id, !task.is_completed))} aria-label={`${task.is_completed ? "Reopen" : "Complete"} ${task.title}`} className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${task.is_completed ? `${style.dot} border-transparent text-white` : "border-slate-300 bg-white text-transparent hover:border-slate-500"}`}><Check className="h-3.5 w-3.5" /></button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><p className={`min-w-0 truncate text-sm font-semibold text-slate-900 ${task.is_completed ? "line-through opacity-55" : ""}`}>{task.title}</p>{task.course_code && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${style.soft}`}>{task.course_code}</span>}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2"><p className={`text-xs font-semibold ${TONE_CLASS[due.tone]}`}>{due.label || "No due date"}</p>{task.subtasks.length > 0 && <span className="text-[11px] font-bold text-slate-400">{completedSubtasks}/{task.subtasks.length} subtasks</span>}</div>
          </div>
          <button type="button" onClick={() => beginAddingSubtask(task.id)} aria-label={`Add subtask to ${task.title}`} className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-700"><ListPlus className="h-4 w-4" /></button>
          <button type="button" onClick={() => void optimisticUpdate(task, { is_pinned: !task.is_pinned }, () => togglePin(task.id, !task.is_pinned))} aria-label={`${task.is_pinned ? "Unpin" : "Pin"} ${task.title}`} className={`rounded-lg p-1.5 ${task.is_pinned ? "text-amber-600" : "text-slate-300 hover:text-slate-600"}`}><Pin className={`h-4 w-4 ${task.is_pinned ? "fill-current" : ""}`} /></button>
          <div className="relative"><button type="button" onClick={() => setMenuId(menuId === task.id ? null : task.id)} aria-label={`More actions for ${task.title}`} aria-expanded={menuId === task.id} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><MoreHorizontal className="h-4 w-4" /></button>{menuId === task.id && <div className="absolute right-0 top-8 z-20 w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"><button type="button" onClick={() => beginAddingSubtask(task.id)} className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100">Add subtask</button><button type="button" onClick={() => { setEditing(task); setMenuId(null); }} className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100">Edit</button><button type="button" onClick={() => { setMenuId(null); void deleteEditForRow(task); }} className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50">Delete</button></div>}</div>
        </div>
        {expanded && <div className="border-t border-slate-100 bg-slate-50/70 py-2 pl-14 pr-4 sm:pl-[4.25rem] sm:pr-5">
          {task.subtasks.length > 0 && <ul className="space-y-1">{task.subtasks.map((subtask) => <li key={subtask.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-white"><button type="button" disabled={subtaskBusyId === subtask.id} onClick={() => void changeSubtaskCompletion(task, subtask.id, !subtask.is_completed)} aria-label={`${subtask.is_completed ? "Reopen" : "Complete"} subtask ${subtask.title}`} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${subtask.is_completed ? `${style.dot} border-transparent text-white` : "border-slate-300 bg-white text-transparent"} disabled:opacity-50`}><Check className="h-3.5 w-3.5" /></button><span className={`min-w-0 flex-1 text-sm text-slate-700 ${subtask.is_completed ? "line-through opacity-50" : ""}`}>{subtask.title}</span><button type="button" disabled={subtaskBusyId === subtask.id} onClick={() => void removeSubtask(task, subtask.id)} aria-label={`Delete subtask ${subtask.title}`} className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button></li>)}</ul>}
          {addingSubtaskId === task.id ? <form onSubmit={(event) => void submitSubtask(event, task)} className="mt-1 flex items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-slate-200"><input autoFocus value={subtaskTitle} onChange={(event) => setSubtaskTitle(event.target.value)} maxLength={180} placeholder="Add a subtask…" aria-label={`New subtask for ${task.title}`} className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-slate-400" /><button type="submit" disabled={subtaskBusyId === task.id || !subtaskTitle.trim()} className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">{subtaskBusyId === task.id ? "Adding…" : "Add"}</button><button type="button" onClick={() => { setAddingSubtaskId(null); setSubtaskTitle(""); }} className="px-2 py-1.5 text-xs font-semibold text-slate-500">Cancel</button></form> : <button type="button" onClick={() => beginAddingSubtask(task.id)} className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-500 hover:bg-white hover:text-slate-900"><Plus className="h-3.5 w-3.5" />Add subtask</button>}
        </div>}
      </article>
    );
  };

  const deleteEditForRow = async (task: Task) => {
    const original = tasks;
    onTasksChange(tasks.filter((item) => item.id !== task.id));
    const result = await deleteTask(task.id);
    if (!result.ok) { onTasksChange(original); setMutationError(result.error); return; }
    router.refresh();
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <form onSubmit={addTask} className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 p-4 backdrop-blur sm:p-5">
        <div className="flex items-center gap-2"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${style.dot}`}><Plus className="h-4 w-4" /></span><input aria-label={`Add a ${style.label} calendar item`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`Add a ${style.label.toLowerCase()} ${newKind}…`} className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400" /><button type="button" onClick={() => setPinned((value) => !value)} aria-pressed={pinned} aria-label="Pin new item" className={`rounded-lg p-2 ${pinned ? "bg-amber-50 text-amber-600" : "text-slate-400 hover:bg-slate-100"}`}><Pin className={`h-4 w-4 ${pinned ? "fill-current" : ""}`} /></button><button type="submit" disabled={busy || !title.trim()} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{busy ? "Adding…" : newKind === "event" ? "Add event" : "Add task"}</button></div>
        <div className={`mt-3 grid gap-2 pl-11 ${newKind === "event" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}><label className="sr-only" htmlFor={`${category}-new-date`}>Date</label><input id={`${category}-new-date`} type="date" value={date} onChange={(event) => setDate(event.target.value)} className={`rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600 ${newKind === "event" ? "col-span-2 sm:col-span-1" : ""}`} /><label className="sr-only" htmlFor={`${category}-new-time`}>{newKind === "event" ? "Start time" : "Due time"}</label><input id={`${category}-new-time`} type="time" value={time} onChange={(event) => setTime(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600" />{newKind === "event" && <><label className="sr-only" htmlFor={`${category}-new-end-time`}>End time</label><input id={`${category}-new-end-time`} type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600" /></>}</div>
        <div className="mt-2 flex flex-col gap-2 pl-11 sm:flex-row"><div className="flex shrink-0 rounded-xl bg-slate-100 p-1" aria-label="New item display style">{(["task", "event"] as const).map((value) => <button key={value} type="button" onClick={() => setNewKind(value)} aria-pressed={newKind === value} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold capitalize ${newKind === value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}><span className={`h-3 w-4 rounded-sm ${value === "task" ? style.dot : `${style.soft} border-l-2 ${style.border}`}`} />{value}</button>)}</div>{newKind === "event" && <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location or meeting link" aria-label="Event location" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600" />}</div>
        {addError && <p role="alert" className="mt-2 pl-11 text-xs font-semibold text-rose-600">{addError}</p>}
      </form>
      {mutationError && <p role="alert" className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-sm font-medium text-rose-700">{mutationError}</p>}

      <Section title="Pinned" count={pinnedRows.length} open={sections.pinned} onToggle={() => toggleSection("pinned")}>{pinnedRows.length ? <div>{pinnedRows.map(row)}</div> : <Empty>Pin the things that cannot slip. They will stay at the top.</Empty>}</Section>
      <Section title="Tasks" count={openRows.length} open={sections.tasks} onToggle={() => toggleSection("tasks")}>{openRows.length ? <div>{openRows.map(row)}</div> : <Empty>No open tasks here. Add one above or enjoy the breathing room.</Empty>}</Section>
      <Section title="Completed" count={completedRows.length} open={sections.completed} onToggle={() => toggleSection("completed")}>
        {completedRows.length ? <div><div>{completedRows.map(row)}</div><div className="border-t border-slate-100 px-5 py-3">{confirmClear ? <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold text-rose-700">Delete {completedRows.length} completed tasks?</span><button type="button" onClick={() => void clearCompleted()} className="rounded-lg bg-rose-600 px-2.5 py-1.5 font-bold text-white">Delete {completedRows.length}</button><button type="button" onClick={() => setConfirmClear(false)} className="rounded-lg px-2 py-1.5 font-semibold text-slate-500">Cancel</button></div> : <button type="button" onClick={() => setConfirmClear(true)} className="text-xs font-bold text-rose-600 hover:text-rose-700">Clear completed</button>}</div></div> : <Empty>Completed tasks will collect here, safely out of the way.</Empty>}
      </Section>
      <Section title="Schedule" count={weeklyEvents.length} open={sections.schedule} onToggle={() => toggleSection("schedule")}>
        {seriesGroups.length ? <div className="space-y-3 px-4 pb-5 sm:px-5">{seriesGroups.map((group) => { const first = group.occurrences[0]; const isSeries = Boolean(first.series_id); return <article key={group.key} className={`rounded-2xl border-l-4 bg-slate-50 p-3 ${style.border}`}><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900">{first.title}</h3><p className="mt-1 text-xs font-semibold text-slate-500">{isSeries && first.recurrence_rule ? describeRule(first.recurrence_rule) : "One-time event"}{formatTimeRange(first.due_time, first.end_time) ? ` · ${formatTimeRange(first.due_time, first.end_time)}` : ""}</p></div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => isSeries ? onEditSeries(group.all) : setEditing(first)} className="rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 hover:bg-white">{isSeries ? "Edit series" : "Edit event"}</button><button type="button" onClick={() => setConfirmSeries(group.key)} aria-label={`Delete ${isSeries ? "series" : "event"} ${first.title}`} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button></div></div><div className="mt-3 flex flex-wrap gap-2">{group.occurrences.map((occurrence) => <span key={occurrence.id} className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{WEEKDAY_LABELS[weekdayForDate(occurrence.due_date!)]}</span>)}</div>{confirmSeries === group.key && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 text-xs"><span className="font-semibold text-rose-700">Delete {isSeries ? `all ${group.all.length} occurrences` : "this event"}?</span><button type="button" onClick={() => void removeSeries(group)} className="rounded-lg bg-rose-600 px-2.5 py-1.5 font-bold text-white">Delete {isSeries ? "series" : "event"}</button><button type="button" onClick={() => setConfirmSeries(null)} className="font-semibold text-slate-500">Cancel</button></div>}</article>; })}</div> : <Empty>No scheduled events in this week. Add a recurring event when your routine is ready.</Empty>}
      </Section>

      {editing && <TaskEditorModal state={{ task: editing, date: editing.due_date }} scopeCategory={category} seriesCount={editing.series_id ? tasks.filter((task) => task.series_id === editing.series_id).length : 0} onClose={() => setEditing(null)} onSave={saveEdit} onDelete={deleteEdit} />}
    </section>
  );
}
