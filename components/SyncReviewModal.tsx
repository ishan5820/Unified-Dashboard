"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Link2, LoaderCircle, RefreshCw, X } from "lucide-react";
import { CATEGORY_STYLES } from "@/lib/categories";
import type { NewTask, Task } from "@/types/task";

type Diff = { field: string; from: string | null; to: string | null };
type SyncAction = {
  actionId: string;
  keepBothActionId?: string;
  type: "create" | "update" | "adopt";
  defaultApproved: boolean;
  incoming: NewTask & { canvas_uid: string };
  existing?: Task;
  diff: Diff[];
  score?: number;
  confidence?: "high" | "low";
};
type Preview = {
  ok: true;
  mode: "preview";
  planId: string;
  planHash: string;
  expandedRecurrences: number;
  truncated: boolean;
  counts: { create: number; update: number; adopt: number; unchanged: number };
  actions: SyncAction[];
  skipped: { noUid: number; noSummary: number; cancelled: number };
};
type ApplyResult = {
  ok: true;
  mode: "apply";
  applied: { created: number; updated: number; adopted: number };
  failed: Array<{ actionId: string; error: string }>;
};

interface SyncReviewModalProps { open: boolean; onClose: () => void }

const STORAGE_KEY = "college-organizer:canvas-url";

function validateFeedUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim().replace(/^webcal:\/\//i, "https://"));
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? null : "Use an http, https, or webcal URL.";
  } catch { return "Paste a complete Canvas calendar URL."; }
}

function displayValue(value: string | null): string {
  if (!value) return "None";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" })
      .format(new Date(`${year}-${month}-${day}T18:00:00Z`));
  }
  return value;
}

function FieldDiff({ diff }: { diff: Diff }) {
  return (
    <li className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
      <span className="font-semibold capitalize text-slate-500">{diff.field.replaceAll("_", " ")}</span>
      <span className="line-through decoration-rose-400">{displayValue(diff.from)}</span>
      <span aria-hidden="true">→</span>
      <span className="font-semibold text-emerald-700">{displayValue(diff.to)}</span>
    </li>
  );
}

export function SyncReviewModal({ open, onClose }: SyncReviewModalProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<"url" | "review" | "result">("url");
  const [url, setUrl] = useState(() => typeof window === "undefined" ? "" : localStorage.getItem(STORAGE_KEY) ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<SyncAction["type"]>>(new Set(["create", "update", "adopt"]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    if (busy) return;
    setStep("url"); setPreview(null); setResult(null); setSelected(new Set()); setError(null);
    onClose();
  }, [busy, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    requestAnimationFrame(() => dialog?.querySelector<HTMLElement>("input,button")?.focus());
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); previous?.focus(); };
  }, [close, open]);

  const setDefaults = (plan: Preview) => {
    setSelected(new Set(plan.actions.filter((action) => action.defaultApproved).map((action) => action.actionId)));
  };

  const requestPreview = async (staleMessage?: string) => {
    const validation = validateFeedUrl(url);
    if (validation) { setError(validation); return; }
    setBusy(true); setError(staleMessage ?? null);
    try {
      localStorage.setItem(STORAGE_KEY, url.trim());
      const response = await fetch("/api/sync-ical", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ icalUrl: url.trim(), mode: "preview" }),
      });
      const body = await response.json() as Preview | { ok: false; error: string };
      if (!response.ok || !body.ok) throw new Error(body.ok ? "Could not preview this feed." : body.error);
      setPreview(body); setDefaults(body); setStep("review");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not preview this feed."); }
    finally { setBusy(false); }
  };

  const groups = useMemo(() => {
    const actions = preview?.actions ?? [];
    return {
      create: actions.filter((action) => action.type === "create"),
      update: actions.filter((action) => action.type === "update"),
      adopt: actions.filter((action) => action.type === "adopt"),
    };
  }, [preview]);

  const choose = (action: SyncAction, value: "skip" | "main" | "both") => {
    setSelected((current) => {
      const next = new Set(current); next.delete(action.actionId);
      if (action.keepBothActionId) next.delete(action.keepBothActionId);
      if (value === "main") next.add(action.actionId);
      if (value === "both" && action.keepBothActionId) next.add(action.keepBothActionId);
      return next;
    });
  };

  const setGroup = (type: SyncAction["type"], approved: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const action of groups[type]) {
        next.delete(action.actionId); if (action.keepBothActionId) next.delete(action.keepBothActionId);
        if (approved) next.add(action.actionId);
      }
      return next;
    });
  };

  const apply = async () => {
    if (!preview || selected.size === 0) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/sync-ical", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ icalUrl: url.trim(), mode: "apply", planId: preview.planId, planHash: preview.planHash, approvedActionIds: [...selected] }),
      });
      const body = await response.json() as ApplyResult | { ok: false; error: string };
      if (response.status === 409) { await requestPreview("The calendar changed while you were reviewing it. Here is a fresh preview."); return; }
      if (!response.ok || !body.ok) throw new Error(body.ok ? "Could not apply the sync." : body.error);
      setResult(body); setStep("result"); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not apply the sync."); }
    finally { setBusy(false); }
  };

  if (!open) return null;
  const groupLabels = { create: "New", update: "Changes", adopt: "Possible matches" } as const;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="sync-title" className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-5 sm:px-7">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700"><RefreshCw className="h-3.5 w-3.5" /> Canvas sync</div>
            <h2 id="sync-title" className="text-xl font-bold tracking-tight text-slate-950">{step === "url" ? "Connect your Canvas calendar" : step === "review" ? "Review every change" : "Sync complete"}</h2>
            <p className="mt-1 text-sm text-slate-500">{step === "url" ? "Nothing is saved until you review and approve it." : step === "review" ? "Checked items are the only changes that will be applied." : "Your approved changes are now reflected in the organizer."}</p>
          </div>
          <button type="button" onClick={close} disabled={busy} aria-label="Close Canvas sync" className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X className="h-5 w-5" /></button>
        </header>

        {step === "url" && (
          <div className="p-5 sm:p-7">
            <label htmlFor="canvas-url" className="text-sm font-semibold text-slate-800">Canvas calendar feed URL</label>
            <div className="mt-2 flex items-center rounded-xl border border-slate-300 bg-white px-3 shadow-sm focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-100">
              <Link2 className="h-4 w-4 shrink-0 text-slate-400" />
              <input id="canvas-url" value={url} onChange={(event) => { setUrl(event.target.value); setError(null); }} onKeyDown={(event) => { if (event.key === "Enter") void requestPreview(); }} placeholder="webcal://utexas.instructure.com/feeds/..." className="w-full border-0 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-slate-400" />
            </div>
            {error && <p className="mt-2 text-sm font-medium text-rose-600" role="alert">{error}</p>}
            <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm leading-6 text-sky-900"><strong>Your data stays under your control.</strong> The feed is compared with your organizer first. New items, date changes, and possible duplicates are shown separately.</div>
            <div className="mt-6 flex justify-end"><button type="button" disabled={busy || !url.trim()} onClick={() => void requestPreview()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45">{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}{busy ? "Building preview…" : "Preview changes"}</button></div>
          </div>
        )}

        {step === "review" && preview && (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
              {error && <div className="mb-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
              <div className="mb-5 flex flex-wrap gap-x-2 gap-y-1 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white">
                <span>{preview.counts.create} new</span><span className="text-slate-500">·</span>
                <span>{preview.counts.update} date changes</span><span className="text-slate-500">·</span>
                <span>{preview.counts.adopt} possible matches</span><span className="text-slate-500">·</span>
                <span>{preview.counts.unchanged} unchanged</span>
              </div>
              {preview.actions.length === 0 && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center"><Check className="mx-auto h-8 w-8 text-emerald-600" /><p className="mt-2 font-semibold text-emerald-950">Everything is already up to date.</p><p className="mt-1 text-sm text-emerald-700">No decisions or database changes are needed.</p></div>}
              <div className="space-y-3">
                {(["create", "update", "adopt"] as const).map((type) => {
                  const items = groups[type]; if (!items.length) return null;
                  const isOpen = expanded.has(type);
                  return (
                    <section key={type} className="overflow-hidden rounded-2xl border border-slate-200">
                      <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3">
                        <button type="button" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(type)) next.delete(type); else next.add(type); return next; })} className="flex items-center gap-2 text-left text-sm font-bold text-slate-900">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{groupLabels[type]} <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{items.length}</span></button>
                        <div className="flex gap-1 text-xs font-semibold"><button type="button" onClick={() => setGroup(type, true)} className="rounded-lg px-2 py-1 text-emerald-700 hover:bg-emerald-50">Approve all</button><button type="button" onClick={() => setGroup(type, false)} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">Skip all</button></div>
                      </div>
                      {isOpen && <div className="divide-y divide-slate-100">{items.map((action) => {
                        const mainSelected = selected.has(action.actionId);
                        const bothSelected = Boolean(action.keepBothActionId && selected.has(action.keepBothActionId));
                        return (
                          <div key={action.actionId} className="p-4">
                            <div className="flex items-start gap-3">
                              {type !== "adopt" ? <input type="checkbox" aria-label={`Approve ${action.incoming.title}`} checked={mainSelected} onChange={() => choose(action, mainSelected ? "skip" : "main")} className="mt-1 h-4 w-4 accent-emerald-600" /> : null}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">{action.incoming.title}</p>{action.incoming.course_code && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CATEGORY_STYLES.classes.soft}`}>{action.incoming.course_code}</span>}{action.confidence && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{Math.round((action.score ?? 0) * 100)}% {action.confidence}</span>}</div>
                                <p className="mt-1 text-sm text-slate-500">{displayValue(action.incoming.due_date)}{action.incoming.due_time ? ` · ${action.incoming.due_time}` : ""}</p>
                                {action.diff.length > 0 && <ul className="mt-2 space-y-1">{action.diff.map((diff, index) => <FieldDiff key={`${diff.field}-${index}`} diff={diff} />)}</ul>}
                                {type === "adopt" && action.existing && <div className="mt-3 rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Existing organizer task</p><p className="mt-1 text-sm font-semibold text-slate-900">{action.existing.title} · {displayValue(action.existing.due_date)}</p><p className="mt-2 text-xs font-medium text-slate-600">Keeps: {action.existing.is_completed ? "completed ✓, " : ""}{action.existing.is_pinned ? "pinned, " : ""}category {CATEGORY_STYLES[action.existing.category].label}, course code {action.existing.course_code ?? "none"}</p></div>}
                                {type === "adopt" && <fieldset className="mt-3 flex flex-wrap gap-2 text-xs font-semibold"><legend className="sr-only">Decision for {action.incoming.title}</legend>{(["main", "skip", "both"] as const).map((value) => <label key={value} className={`cursor-pointer rounded-lg border px-3 py-2 ${value === "main" && mainSelected || value === "both" && bothSelected || value === "skip" && !mainSelected && !bothSelected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}><input className="sr-only" type="radio" name={`decision-${action.actionId}`} checked={value === "main" ? mainSelected : value === "both" ? bothSelected : !mainSelected && !bothSelected} onChange={() => choose(action, value)} />{value === "main" ? "Adopt match" : value === "both" ? "Keep both" : "Skip"}</label>)}</fieldset>}
                              </div>
                            </div>
                          </div>
                        );
                      })}</div>}
                    </section>
                  );
                })}
              </div>
            </div>
            <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-7"><button type="button" onClick={close} disabled={busy} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button><button type="button" onClick={() => void apply()} disabled={busy || selected.size === 0} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45">{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Apply {selected.size} {selected.size === 1 ? "change" : "changes"}</button></footer>
          </>
        )}

        {step === "result" && result && <div className="p-7 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-7 w-7" /></div><p className="mt-4 text-lg font-bold text-slate-950">Canvas is synced</p><p className="mt-2 text-sm text-slate-600">{result.applied.created} created · {result.applied.updated} updated · {result.applied.adopted} matched</p>{result.failed.length > 0 && <div className="mt-4 rounded-xl bg-rose-50 p-3 text-left text-sm text-rose-700">{result.failed.length} changes failed. You can close this window and preview again.</div>}<button type="button" onClick={close} className="mt-6 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Done</button></div>}
      </div>
    </div>
  );
}
