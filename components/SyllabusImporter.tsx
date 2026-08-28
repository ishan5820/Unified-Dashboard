"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, DatabaseBackup, FileJson, FileText, FileUp, RotateCcw, X } from "lucide-react";
import {
  bulkCreateTasks, deleteImportBatch, getAllTasks, updateTask, type TaskDraft,
} from "@/app/actions/tasks";
import { CATEGORY_ORDER, CATEGORY_STYLES } from "@/lib/categories";
import { fromTimeInputValue, isCalendarDate, toTimeInputValue } from "@/lib/datetime";
import { findMatch, type MatchResult } from "@/lib/matchTasks";
import { extractPdfText } from "@/lib/extractPdfText";
import { parseSyllabus } from "@/lib/parseSyllabus";
import { isTaskCategory, isTaskKind, isTaskSource, type Task, type TaskCategory } from "@/types/task";

interface PreviewRow {
  key: string;
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  category: TaskCategory;
  parseConfidence: "high" | "low";
  match: MatchResult<Task> | null;
  include: boolean;
  duplicateMode: "skip" | "description";
}

interface ImportSummary {
  inserted: number;
  updated: number;
  failed: string[];
  batchId: string | null;
  undone?: number;
}

export interface SyllabusImporterProps {
  open: boolean;
  onClose: () => void;
  initialCategory?: TaskCategory;
  existingTasks?: Task[];
  onImported?: (created: Task[], updated: Task[]) => void;
  onUndone?: (batchId: string) => void;
}

function taskCandidate(row: Pick<PreviewRow, "title" | "dueDate" | "category">) {
  return { title: row.title, due_date: row.dueDate, category: row.category, course_code: null, kind: "task" as const };
}

function jsonTask(value: unknown, fallbackCategory: TaskCategory): TaskDraft | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.title !== "string" || !row.title.trim()) return null;
  const category = isTaskCategory(row.category) ? row.category : fallbackCategory;
  const kind = isTaskKind(row.kind) ? row.kind : "task";
  const source = isTaskSource(row.source) ? row.source : "manual";
  const dueDate = typeof row.due_date === "string" && isCalendarDate(row.due_date) ? row.due_date : null;
  const seriesUntil = typeof row.series_until === "string" && isCalendarDate(row.series_until) ? row.series_until : null;
  const subtasks = Array.isArray(row.subtasks) ? row.subtasks.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const subtask = value as Record<string, unknown>;
    if (typeof subtask.title !== "string" || !subtask.title.trim()) return [];
    return [{
      id: typeof subtask.id === "string" ? subtask.id : crypto.randomUUID(),
      title: subtask.title.trim(),
      is_completed: Boolean(subtask.is_completed),
      created_at: typeof subtask.created_at === "string" ? subtask.created_at : new Date().toISOString(),
    }];
  }) : [];
  return {
    title: row.title.trim(),
    description: typeof row.description === "string" ? row.description : null,
    due_date: dueDate,
    due_time: typeof row.due_time === "string" ? row.due_time : null,
    location: typeof row.location === "string" ? row.location : null,
    category,
    course_code: typeof row.course_code === "string" ? row.course_code : null,
    is_pinned: Boolean(row.is_pinned),
    is_completed: kind === "event" ? false : Boolean(row.is_completed),
    source,
    kind,
    canvas_uid: typeof row.canvas_uid === "string" ? row.canvas_uid : null,
    end_time: kind === "event" && typeof row.end_time === "string" ? row.end_time : null,
    series_id: typeof row.series_id === "string" ? row.series_id : null,
    recurrence_rule: typeof row.recurrence_rule === "string" ? row.recurrence_rule : null,
    series_until: seriesUntil,
    import_batch_id: null,
    subtasks,
  };
}

export function SyllabusImporter({ open, onClose, initialCategory = "classes", existingTasks = [], onImported, onUndone }: SyllabusImporterProps) {
  const [tab, setTab] = useState<"syllabus" | "backup">("syllabus");
  const [sourceText, setSourceText] = useState("");
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [jsonRows, setJsonRows] = useState<TaskDraft[]>([]);
  const [jsonName, setJsonName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);

  if (!open) return null;

  const loadExisting = async (): Promise<Task[]> => {
    const result = await getAllTasks();
    if (!result.ok) {
      if (existingTasks.length) return existingTasks;
      throw new Error(result.error);
    }
    return result.tasks;
  };

  const previewText = async (text = sourceText) => {
    setError(null); setSummary(null);
    if (!text.trim()) { setError("Paste at least one syllabus line."); return; }
    setBusy(true);
    try {
      const existing = await loadExisting();
      const parsed = parseSyllabus(text);
      if (!parsed.length) { setError("No non-empty lines were found."); return; }
      setRows(parsed.map((row) => {
        const match = findMatch(taskCandidate({ ...row, category: initialCategory }), existing);
        return {
          key: crypto.randomUUID(), title: row.title, dueDate: row.dueDate, dueTime: row.dueTime,
          category: initialCategory, parseConfidence: row.confidence, match,
          include: row.confidence === "high" && match?.confidence !== "high",
          duplicateMode: "skip" as const,
        };
      }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not prepare the preview."); }
    finally { setBusy(false); }
  };

  const loadPdf = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError(null); setSummary(null); setRows([]); setPdfName(file.name);
    try {
      const text = await extractPdfText(file);
      setSourceText(text);
      await previewText(text);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read this PDF.");
    } finally { setBusy(false); }
  };

  const updateRow = (key: string, patch: Partial<PreviewRow>) => {
    setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  };

  const importPreview = async () => {
    const selected = rows.filter((row) => row.include);
    if (!selected.length) { setError("Choose at least one row or description update."); return; }
    setBusy(true); setError(null); setSummary(null);
    const batchId = crypto.randomUUID();
    const newRows = selected.filter((row) => !(row.match?.confidence === "high" && row.duplicateMode === "description"));
    const descriptionRows = selected.filter((row) => row.match?.confidence === "high" && row.duplicateMode === "description");
    const failedKeys = new Set<string>();
    const failed: string[] = [];
    const created: Task[] = [];
    const updated: Task[] = [];

    if (newRows.length) {
      const result = await bulkCreateTasks(newRows.map((row) => ({
        title: row.title, description: null, due_date: row.dueDate,
        due_time: row.dueTime, category: row.category, course_code: null,
        location: null,
        is_pinned: false, is_completed: false, source: "manual", kind: "task",
        canvas_uid: null, end_time: null, series_id: null, recurrence_rule: null,
        series_until: null, import_batch_id: batchId,
      })));
      if (result.ok) created.push(...(result.tasks ?? [result.task]));
      else {
        for (const row of newRows) { failedKeys.add(row.key); failed.push(`${row.title}: ${result.error}`); }
      }
    }

    for (const row of descriptionRows) {
      const existing = row.match?.row;
      if (!existing) continue;
      const result = await updateTask(existing.id, { description: row.title });
      if (result.ok) updated.push(result.task);
      else { failedKeys.add(row.key); failed.push(`${row.title}: ${result.error}`); }
    }

    const committedBatch = created.length ? batchId : null;
    setRows((current) => current.filter((row) => failedKeys.has(row.key)));
    setSummary({ inserted: created.length, updated: updated.length, failed, batchId: committedBatch });
    onImported?.(created, updated);
    setBusy(false);
  };

  const loadJson = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setSummary(null); setJsonRows([]); setJsonName(file.name);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!Array.isArray(parsed)) throw new Error("Backup JSON must contain an array of organizer rows.");
      const restored = parsed.map((row) => jsonTask(row, initialCategory)).filter((row): row is TaskDraft => Boolean(row));
      if (!restored.length) throw new Error("No valid organizer rows were found in this file.");
      if (restored.length > 500) throw new Error("A single restore can contain at most 500 rows.");
      setJsonRows(restored);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not read this JSON file."); }
  };

  const restoreJson = async () => {
    if (!jsonRows.length) return;
    setBusy(true); setError(null); setSummary(null);
    const batchId = crypto.randomUUID();
    const result = await bulkCreateTasks(jsonRows.map((row) => ({ ...row, import_batch_id: batchId })));
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    const created = result.tasks ?? [result.task];
    setSummary({ inserted: created.length, updated: 0, failed: [], batchId });
    setJsonRows([]);
    onImported?.(created, []);
  };

  const undoImport = async () => {
    if (!summary?.batchId) return;
    setBusy(true); setError(null);
    const batchId = summary.batchId;
    const result = await deleteImportBatch(batchId);
    setBusy(false); setConfirmUndo(false);
    if (!result.ok) { setError(result.error); return; }
    onUndone?.(batchId);
    setSummary({ inserted: 0, updated: summary.updated, failed: [], batchId: null, undone: result.count ?? 1 });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="syllabus-import-title" className="max-h-[96vh] w-full max-w-6xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <header className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur sm:px-7"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">Import & backup</p><h2 id="syllabus-import-title" className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Bring your semester in.</h2><p className="mt-1 text-sm text-slate-500">Review every row before anything is saved.</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close importer" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></header>

        <div className="px-5 pt-5 sm:px-7"><div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1" aria-label="Import type"><button type="button" onClick={() => { setTab("syllabus"); setError(null); }} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold ${tab === "syllabus" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}><FileText className="h-4 w-4" />Syllabus text</button><button type="button" onClick={() => { setTab("backup"); setError(null); }} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold ${tab === "backup" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}><FileJson className="h-4 w-4" />JSON backup</button></div></div>

        <div className="p-5 sm:p-7">
          {summary && <section className={`mb-5 rounded-2xl p-4 ${summary.failed.length ? "bg-amber-50 text-amber-950" : "bg-emerald-50 text-emerald-950"}`}><div className="flex items-start gap-3">{summary.failed.length ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />}<div className="min-w-0 flex-1"><p className="font-bold">{summary.undone ? `Removed ${summary.undone} imported rows.` : `${summary.inserted} inserted · ${summary.updated} descriptions updated · ${summary.failed.length} failed`}</p>{summary.failed.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{summary.failed.map((failure) => <li key={failure}>{failure}</li>)}</ul>}{summary.batchId && <div className="mt-3">{confirmUndo ? <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold">Remove all {summary.inserted} rows from this import?</span><button type="button" onClick={() => void undoImport()} className="rounded-lg bg-rose-600 px-2.5 py-1.5 font-bold text-white">Undo import</button><button type="button" onClick={() => setConfirmUndo(false)} className="font-bold text-slate-600">Cancel</button></div> : <button type="button" onClick={() => setConfirmUndo(true)} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold shadow-sm ring-1 ring-emerald-200"><RotateCcw className="h-3.5 w-3.5" />Undo this import</button>}</div>}</div></div></section>}
          {error && <p role="alert" className="mb-5 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

          {tab === "syllabus" ? <>
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]">
                <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/60 p-5 text-center"><FileUp className="mx-auto h-8 w-8 text-emerald-700" /><p className="mt-2 text-sm font-bold text-emerald-950">Upload syllabus PDF</p><p className="mt-1 text-xs leading-5 text-emerald-700">Text is extracted on this device, then opened in the same editable preview.</p><label className="mt-4 inline-flex cursor-pointer rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm"><input type="file" accept="application/pdf,.pdf" onChange={(event) => void loadPdf(event.target.files?.[0])} className="sr-only" />{busy ? "Reading PDF…" : "Choose PDF"}</label>{pdfName && <p className="mt-2 truncate text-xs font-semibold text-emerald-800">{pdfName}</p>}</div>
                <label className="block"><span className="text-sm font-bold text-slate-800">Or paste syllabus text</span><textarea value={sourceText} onChange={(event) => { setSourceText(event.target.value); setPdfName(null); }} rows={8} placeholder={'- Mar 3 — Essay draft\n2. Mon 3/10 7:00 PM — Problem Set 4\n• Reading response (date TBA)'} className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm leading-6" /></label>
              </div><div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Undated lines are kept and flagged for review. Scanned PDFs need OCR first.</p><button type="button" onClick={() => void previewText()} disabled={busy || !sourceText.trim()} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-45">{busy ? "Checking…" : "Preview rows"}</button></div>
            </section>

            {rows.length > 0 && <section className="mt-5"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-lg font-bold text-slate-950">Editable preview</h3><p className="text-xs text-slate-500">Canvas matches stay excluded unless you choose description-only.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{rows.filter((row) => row.include).length} selected</span></div><div className="overflow-x-auto rounded-2xl border border-slate-200"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-3">Include</th><th className="px-3 py-3">Title</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Time</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Review</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key} className="border-t border-slate-100 align-top"><td className="px-3 py-3"><input type="checkbox" checked={row.include} onChange={(event) => updateRow(row.key, { include: event.target.checked })} aria-label={`Include ${row.title}`} className="h-4 w-4 accent-emerald-600" /></td><td className="px-3 py-3"><input value={row.title} onChange={(event) => updateRow(row.key, { title: event.target.value })} aria-label={`Title for ${row.title}`} className="w-full min-w-56 rounded-lg border border-slate-200 px-2.5 py-2" /></td><td className="px-3 py-3"><input type="date" value={row.dueDate ?? ""} onChange={(event) => updateRow(row.key, { dueDate: event.target.value || null })} aria-label={`Date for ${row.title}`} className="rounded-lg border border-slate-200 px-2.5 py-2" /></td><td className="px-3 py-3"><input type="time" value={toTimeInputValue(row.dueTime)} onChange={(event) => updateRow(row.key, { dueTime: fromTimeInputValue(event.target.value) })} aria-label={`Time for ${row.title}`} className="rounded-lg border border-slate-200 px-2.5 py-2" /></td><td className="px-3 py-3"><select value={row.category} onChange={(event) => updateRow(row.key, { category: event.target.value as TaskCategory })} aria-label={`Category for ${row.title}`} className="rounded-lg border border-slate-200 px-2.5 py-2">{CATEGORY_ORDER.map((category) => <option key={category} value={category}>{CATEGORY_STYLES[category].label}</option>)}</select></td><td className="w-64 px-3 py-3">{row.match?.confidence === "high" ? <div><span className="inline-flex rounded-full bg-orange-50 px-2 py-1 text-[11px] font-bold text-orange-700">Already in Canvas</span><p className="mt-1 text-xs text-slate-500">Parsed {row.dueDate ?? "no date"} · Existing {row.match.row.due_date ?? "no date"}</p><select value={row.duplicateMode} onChange={(event) => { const mode = event.target.value as "skip" | "description"; updateRow(row.key, { duplicateMode: mode, include: mode === "description" }); }} aria-label={`Duplicate action for ${row.title}`} className="mt-2 w-full rounded-lg border border-orange-200 bg-white px-2 py-1.5 text-xs"><option value="skip">Skip Canvas match</option><option value="description">Update description only</option></select></div> : row.match?.confidence === "low" ? <div><span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">Possible duplicate</span><p className="mt-1 text-xs text-slate-500">Similar to “{row.match.row.title}”</p></div> : row.parseConfidence === "low" ? <span className="inline-flex rounded-full bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700">Check date</span> : <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">Ready</span>}</td></tr>)}</tbody></table></div><div className="mt-4 flex justify-end"><button type="button" onClick={() => void importPreview()} disabled={busy || !rows.some((row) => row.include)} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-45">{busy ? "Importing…" : `Import ${rows.filter((row) => row.include).length} selected`}</button></div></section>}
          </> : <section className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><DatabaseBackup className="mx-auto h-10 w-10 text-slate-400" /><h3 className="mt-3 text-lg font-bold text-slate-950">Restore a JSON backup</h3><p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-slate-500">Choose a file created by Export data. You will see the row count before restoring it.</p><label className="mt-5 inline-flex cursor-pointer rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-300"><input type="file" accept="application/json,.json" onChange={(event) => void loadJson(event.target.files?.[0])} className="sr-only" />Choose JSON file</label>{jsonName && <p className="mt-3 text-sm font-semibold text-slate-700">{jsonName} · {jsonRows.length} valid rows</p>}{jsonRows.length > 0 && <button type="button" onClick={() => void restoreJson()} disabled={busy} className="mt-4 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-45">{busy ? "Restoring…" : `Restore ${jsonRows.length} rows`}</button>}</section>}
        </div>
      </div>
    </div>
  );
}
