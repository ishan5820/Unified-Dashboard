"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, CalendarPlus, Check, Clock3, MapPin, Trophy } from "lucide-react";
import { createTask } from "@/app/actions/tasks";
import type { SportGroup, TexasSportsEvent, TexasSportsTeam } from "@/lib/texasSports";

const FILTERS: ReadonlyArray<{ id: "all" | SportGroup; label: string }> = [
  { id: "all", label: "All sports" },
  { id: "football", label: "Football" },
  { id: "basketball", label: "Basketball" },
  { id: "tennis", label: "Tennis" },
  { id: "volleyball", label: "Volleyball" },
  { id: "other", label: "Other sports" },
];

function dateLabel(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    .format(new Date(year, month - 1, day, 12));
}

function sportsKey(event: TexasSportsEvent): string {
  return `texas-sports:${event.id}`;
}

function EventRow({ event, added, busy, onAdd }: { event: TexasSportsEvent; added: boolean; busy: boolean; onAdd: () => void }) {
  return (
    <article className="grid gap-4 border-t border-slate-100 px-4 py-4 first:border-t-0 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <div>
        <p className="text-sm font-bold text-slate-950">{dateLabel(event.date)}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Clock3 className="h-3.5 w-3.5" />{event.timeLabel}</p>
      </div>
      <div className="min-w-0">
        <p className="font-bold text-slate-900">vs. {event.opponent}</p>
        <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-slate-500"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{event.location}</span></p>
        {event.tournament && <p className="mt-1 text-xs font-semibold text-indigo-600">{event.tournament}</p>}
      </div>
      <button type="button" disabled={added || busy} onClick={onAdd} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition disabled:cursor-default ${added ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-50"}`}>{added ? <Check className="h-4 w-4" /> : <CalendarPlus className="h-4 w-4" />}{added ? "Added" : busy ? "Adding…" : "Add to calendar"}</button>
    </article>
  );
}

export function SportsSchedule({ teams, initiallyAdded }: { teams: TexasSportsTeam[]; initiallyAdded: string[] }) {
  const [filter, setFilter] = useState<"all" | SportGroup>("all");
  const [addedKeys, setAddedKeys] = useState(() => new Set(initiallyAdded));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filteredTeams = useMemo(() => teams.filter((team) => filter === "all" || team.group === filter), [filter, teams]);
  const teamsWithEvents = filteredTeams.filter((team) => team.events.length > 0);
  const teamsWithoutEvents = filteredTeams.filter((team) => team.events.length === 0);
  const eventCount = teams.reduce((sum, team) => sum + team.events.length, 0);

  const addEvent = async (event: TexasSportsEvent) => {
    setBusyId(event.id);
    setError(null);
    const result = await createTask({
      canvas_uid: sportsKey(event),
      title: `${event.sport} vs ${event.opponent}`,
      description: `Official Texas Athletics home event. Posted time: ${event.timeLabel}.${event.tournament ? ` ${event.tournament}.` : ""} Source: ${event.sourceUrl}`,
      due_date: event.date,
      due_time: event.time,
      location: event.location,
      category: "social",
      course_code: null,
      is_pinned: false,
      is_completed: false,
      source: "manual",
      kind: "event",
      end_time: null,
      series_id: null,
      recurrence_rule: null,
      series_until: null,
      import_batch_id: null,
    });
    setBusyId(null);
    if (!result.ok) {
      if (result.error.toLowerCase().includes("duplicate")) {
        setAddedKeys((current) => new Set(current).add(sportsKey(event)));
        return;
      }
      setError(`Could not add ${event.sport} vs ${event.opponent}. Please try again.`);
      return;
    }
    setAddedKeys((current) => new Set(current).add(sportsKey(event)));
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 text-white shadow-xl sm:px-8 sm:py-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-indigo-100 ring-1 ring-white/15"><Trophy className="h-3.5 w-3.5" />Texas home games</div><h1 className="mt-4 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Sporting Events</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Browse upcoming home schedules across Texas Athletics. Add only the games and meets you want to your Social calendar.</p></div>
          <div className="grid grid-cols-2 gap-2"><div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15"><span className="block text-2xl font-bold">{teams.length}</span><span className="text-xs font-semibold text-slate-300">team schedules</span></div><div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15"><span className="block text-2xl font-bold">{eventCount}</span><span className="text-xs font-semibold text-slate-300">upcoming home events</span></div></div>
        </div>
      </header>

      <section className="mt-6">
        <div className="flex gap-2 overflow-x-auto pb-2" aria-label="Filter sporting events">{FILTERS.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} aria-pressed={filter === item.id} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${filter === item.id ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"}`}>{item.label}</button>)}</div>
        {error && <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-100">{error}</p>}
      </section>

      <div className="mt-4 space-y-4">
        {teamsWithEvents.map((team) => <section key={team.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><header className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><h2 className="text-lg font-bold text-slate-950">{team.name}</h2><p className="mt-0.5 text-xs font-semibold text-slate-500">{team.season} · {team.events.length} upcoming home {team.events.length === 1 ? "event" : "events"}</p></div><a href={team.sourceUrl.replace(/\/text$/, "")} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">Official schedule <ArrowUpRight className="h-3.5 w-3.5" /></a></header>{team.events.map((event) => <EventRow key={event.id} event={event} added={addedKeys.has(sportsKey(event))} busy={busyId === event.id} onAdd={() => void addEvent(event)} />)}</section>)}
      </div>

      {teamsWithEvents.length === 0 && <section className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center"><Trophy className="mx-auto h-7 w-7 text-slate-300" /><h2 className="mt-3 font-bold text-slate-900">No upcoming home events are posted in this filter.</h2><p className="mt-1 text-sm text-slate-500">The list will update as Texas Athletics publishes new schedules.</p></section>}

      {teamsWithoutEvents.length > 0 && <section className="mt-6 rounded-3xl border border-slate-200 bg-white px-5 py-5"><h2 className="text-sm font-bold text-slate-900">Schedules with no upcoming home events posted</h2><p className="mt-1 text-xs leading-5 text-slate-500">Some spring schedules are not published yet, and completed seasons do not show past games here.</p><div className="mt-3 flex flex-wrap gap-2">{teamsWithoutEvents.map((team) => <a key={team.id} href={team.sourceUrl.replace(/\/text$/, "")} target="_blank" rel="noreferrer" className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">{team.name}{team.season ? ` · ${team.season}` : " · awaiting schedule"}</a>)}</div></section>}

      <p className="mt-5 text-center text-xs leading-5 text-slate-500">Schedule details come from Texas Athletics and refresh automatically. Times can change; use the official schedule link to confirm before heading out.</p>
    </main>
  );
}
