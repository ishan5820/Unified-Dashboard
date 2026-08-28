import { CalendarDays, Sparkles } from "lucide-react";
import { CalendarGrid } from "@/components/CalendarGrid";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { data, error } = await supabaseAdmin
    .from("tasks")
    .select("*")
    .order("is_completed", { ascending: true })
    .order("is_pinned", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("due_time", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw new Error("The organizer could not load your calendar.");
  const tasks = data ?? [];

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm"><Sparkles className="h-3.5 w-3.5 text-amber-500" /> Unified semester view</div>
          <h1 className="text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">Everything on one calendar.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">Deadlines stay prominent, recurring meetings stay outlined, and every part of college life has its own color.</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white"><CalendarDays className="h-4 w-4" /></span><span><span className="block text-lg font-bold leading-none text-slate-950">{tasks.length}</span><span className="mt-1 block text-xs font-medium text-slate-500">calendar items</span></span></div>
      </header>

      {tasks.length === 0 && <section className="mb-5 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-4"><p className="font-semibold text-slate-900">Your semester is ready for its first task.</p><p className="mt-1 text-sm text-slate-500">Click any calendar day to add something due, or use Sync Canvas in the navigation.</p></section>}
      <CalendarGrid tasks={tasks} variant="full" defaultView="month" />
    </main>
  );
}
