"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, CalendarPlus, Download, GraduationCap, Heart, LayoutDashboard, RefreshCw, Trophy, Users } from "lucide-react";
import { getAllTasks } from "@/app/actions/tasks";
import { CATEGORY_STYLES } from "@/lib/categories";
import { RecurringEventModal } from "@/components/RecurringEventModal";
import { SyncReviewModal } from "@/components/SyncReviewModal";

const items = [
  { href: "/", label: "Overview", icon: LayoutDashboard, dot: null },
  { href: "/classes", label: "Classes", icon: GraduationCap, dot: CATEGORY_STYLES.classes.dot },
  { href: "/orgs", label: "Orgs", icon: Users, dot: CATEGORY_STYLES.orgs.dot },
  { href: "/social", label: "Social", icon: Heart, dot: CATEGORY_STYLES.social.dot },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [syncOpen, setSyncOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const exportData = async () => {
    setExportBusy(true); setExportError(null);
    const result = await getAllTasks();
    setExportBusy(false);
    if (!result.ok) { setExportError(result.error); return; }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const blob = new Blob([JSON.stringify(result.tasks, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `college-organizer-${timestamp}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-5 md:flex">
        <Link href="/" className="flex items-center gap-3 rounded-2xl px-2 py-2" aria-label="College Organizer home">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm"><CalendarDays className="h-5 w-5" /></span>
          <span><span className="block text-sm font-bold tracking-tight text-slate-950">College Organizer</span><span className="block text-xs text-slate-500">Your semester, together</span></span>
        </Link>
        <nav className="mt-8 space-y-1" aria-label="Primary navigation">
          {items.map(({ href, label, icon: Icon, dot }) => {
            const active = href === "/" ? pathname === "/" : href === "/social" ? pathname === "/social" : pathname.startsWith(href);
            return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}><Icon className="h-[18px] w-[18px]" /><span className="flex-1">{label}</span>{dot && <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />}</Link>;
          })}
          <Link href="/social/sports" aria-current={pathname === "/social/sports" ? "page" : undefined} className={`ml-5 flex items-center gap-2.5 rounded-xl border-l-2 px-3 py-2 text-xs font-bold transition ${pathname === "/social/sports" ? "border-indigo-500 bg-indigo-50 text-indigo-950" : "border-slate-200 text-slate-500 hover:border-indigo-300 hover:bg-slate-100 hover:text-slate-900"}`}><Trophy className="h-4 w-4" />Sporting Events</Link>
        </nav>
        <div className="mt-auto space-y-3 rounded-2xl bg-slate-50 p-3">
          <button type="button" onClick={() => setRecurringOpen(true)} className="flex w-full items-center gap-3 rounded-xl bg-slate-950 px-3 py-3 text-left text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10"><CalendarPlus className="h-4 w-4" /></span><span><span className="block">Add recurring</span><span className="block text-xs font-normal text-slate-300">Build a semester routine</span></span></button>
          <button type="button" onClick={() => void exportData()} disabled={exportBusy} className="w-full rounded-xl bg-white px-3 py-2.5 text-center text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 disabled:opacity-50"><Download className="mr-2 inline h-4 w-4 text-indigo-600" />{exportBusy ? "Exporting…" : "Export data"}</button>
          {exportError && <p role="alert" className="rounded-lg bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-700">{exportError}</p>}
          <div>
          <p className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Canvas</p>
          <button type="button" onClick={() => setSyncOpen(true)} className="mt-2 flex w-full items-center gap-3 rounded-xl bg-white px-3 py-3 text-left text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600"><RefreshCw className="h-4 w-4" /></span><span><span className="block">Sync Canvas</span><span className="block text-xs font-normal text-slate-500">Review before saving</span></span></button>
          </div>
        </div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-8 border-t border-slate-200 bg-white/95 px-1 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-1.5 backdrop-blur md:hidden" aria-label="Mobile navigation">
        {items.map(({ href, label, icon: Icon, dot }) => {
          const active = href === "/" ? pathname === "/" : href === "/social" ? pathname === "/social" : pathname.startsWith(href);
          return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold ${active ? "bg-slate-100 text-slate-950" : "text-slate-500"}`}><span className="relative"><Icon className="h-5 w-5" />{dot && <span className={`absolute -right-1 -top-0.5 h-2 w-2 rounded-full ring-2 ring-white ${dot}`} />}</span>{label}</Link>;
        })}
        <Link href="/social/sports" aria-current={pathname === "/social/sports" ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold ${pathname === "/social/sports" ? "bg-indigo-50 text-indigo-950" : "text-indigo-600"}`}><Trophy className="h-5 w-5" />Sports</Link>
        <button type="button" onClick={() => setRecurringOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-indigo-600"><CalendarPlus className="h-5 w-5" />Recurring</button>
        <button type="button" onClick={() => void exportData()} disabled={exportBusy} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-indigo-700 disabled:opacity-50"><Download className="h-5 w-5" />Export</button>
        <button type="button" onClick={() => setSyncOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-orange-600"><RefreshCw className="h-5 w-5" />Sync</button>
      </nav>
      <SyncReviewModal open={syncOpen} onClose={() => setSyncOpen(false)} />
      {recurringOpen && <RecurringEventModal open onClose={() => setRecurringOpen(false)} onChanged={() => router.refresh()} />}
    </>
  );
}
