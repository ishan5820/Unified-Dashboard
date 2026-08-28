"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, CircleAlert, FileUp, ListTodo, Plus } from "lucide-react";
import { CalendarGrid } from "@/components/CalendarGrid";
import { CategoryTaskList } from "@/components/CategoryTaskList";
import { RecurringEventModal } from "@/components/RecurringEventModal";
import { SyllabusImporter } from "@/components/SyllabusImporter";
import { CATEGORY_STYLES } from "@/lib/categories";
import { toLocalDateString } from "@/lib/datetime";
import type { Task, TaskCategory } from "@/types/task";

export interface CategoryWorkspaceProps {
  category: TaskCategory;
  initialTasks: Task[];
}

export function CategoryWorkspace({ category, initialTasks }: CategoryWorkspaceProps) {
  const [tasks, setTasks] = useState(initialTasks);
  const [previousTasks, setPreviousTasks] = useState(initialTasks);
  const [mobileView, setMobileView] = useState<"list" | "calendar">("list");
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [seriesToEdit, setSeriesToEdit] = useState<Task[]>([]);
  const style = CATEGORY_STYLES[category];

  if (initialTasks !== previousTasks) {
    setPreviousTasks(initialTasks);
    setTasks(initialTasks);
  }

  useEffect(() => {
    const stored = window.localStorage.getItem(`college-organizer-${category}-view`);
    if (stored === "list" || stored === "calendar") {
      const timer = window.setTimeout(() => setMobileView(stored), 0);
      return () => window.clearTimeout(timer);
    }
  }, [category]);

  const changeView = (view: "list" | "calendar") => {
    setMobileView(view);
    window.localStorage.setItem(`college-organizer-${category}-view`, view);
  };
  const today = toLocalDateString(new Date());
  const taskRows = tasks.filter((task) => task.kind === "task");
  const open = taskRows.filter((task) => !task.is_completed).length;
  const overdue = taskRows.filter((task) => !task.is_completed && task.due_date && task.due_date < today).length;
  const completed = taskRows.filter((task) => task.is_completed).length;

  const openSeriesEditor = (rows: Task[]) => { setSeriesToEdit(rows); setRecurringOpen(true); };
  const closeRecurring = () => { setRecurringOpen(false); setSeriesToEdit([]); };
  const handleSeriesChanged = (changed: Task[], mode: "created" | "updated") => {
    if (mode === "created") setTasks((current) => [...current, ...changed]);
    else {
      const replacements = new Map(changed.map((task) => [task.id, task]));
      setTasks((current) => current.map((task) => replacements.get(task.id) ?? task));
    }
  };
  const handleImported = (created: Task[], updated: Task[]) => {
    const replacements = new Map(updated.map((task) => [task.id, task]));
    setTasks((current) => [
      ...current.map((task) => replacements.get(task.id) ?? task),
      ...created.filter((task) => task.category === category),
    ]);
  };

  return (
    <main className="mx-auto w-full max-w-[1700px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4"><span className={`h-12 w-2 rounded-full ${style.dot}`} aria-hidden="true" /><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Category workspace</p><h1 className="mt-1 text-3xl font-bold tracking-[-0.035em] text-slate-950">{style.label}</h1></div></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600"><ListTodo className="h-4 w-4" />{open} open</div>
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${overdue ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-500"}`}><CircleAlert className="h-4 w-4" />{overdue} overdue</div>
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />{completed} completed</div>
            <button type="button" onClick={() => setImportOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm"><FileUp className="h-4 w-4 text-emerald-600" />Import syllabus</button>
            <button type="button" onClick={() => { setSeriesToEdit([]); setRecurringOpen(true); }} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm ${style.dot}`}><Plus className="h-4 w-4" />Add recurring</button>
          </div>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 rounded-2xl bg-slate-200 p-1 lg:hidden" aria-label={`${style.label} view`}>
        <button type="button" onClick={() => changeView("list")} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold ${mobileView === "list" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}><ListTodo className="h-4 w-4" />List</button>
        <button type="button" onClick={() => changeView("calendar")} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold ${mobileView === "calendar" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}><CalendarDays className="h-4 w-4" />Calendar</button>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.8fr)] lg:gap-5">
        <div className={`${mobileView === "list" ? "block" : "hidden"} lg:block lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:rounded-3xl`}><CategoryTaskList category={category} initialTasks={tasks} onTasksChange={setTasks} onEditSeries={openSeriesEditor} /></div>
        <div className={`${mobileView === "calendar" ? "block" : "hidden"} lg:block lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:rounded-3xl`}><div className="lg:sticky lg:top-0"><CalendarGrid tasks={tasks} scopeCategory={category} variant="compact" defaultView="month" onTasksChange={setTasks} /></div></div>
      </div>

      {recurringOpen && <RecurringEventModal key={`${category}-${seriesToEdit[0]?.series_id ?? "new"}`} open onClose={closeRecurring} initialCategory={category} lockCategory existingSeries={seriesToEdit} onChanged={handleSeriesChanged} />}
      {importOpen && <SyllabusImporter open onClose={() => setImportOpen(false)} initialCategory={category} existingTasks={tasks} onImported={handleImported} onUndone={(batchId) => setTasks((current) => current.filter((task) => task.import_batch_id !== batchId))} />}
    </main>
  );
}
