"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body className="bg-slate-50 text-slate-950"><main className="flex min-h-screen items-center justify-center p-6"><section className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">College Organizer</p><h1 className="mt-3 text-2xl font-bold">Something interrupted the app</h1><p className="mt-2 text-sm leading-6 text-slate-600">Nothing was changed. Reload the organizer to continue.</p><button type="button" onClick={reset} className="mt-5 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white">Reload organizer</button></section></main></body></html>;
}
