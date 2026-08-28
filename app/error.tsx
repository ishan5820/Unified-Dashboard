"use client";

import { AlertTriangle } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="flex min-h-[70vh] items-center justify-center p-6"><section className="max-w-md rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600"><AlertTriangle className="h-6 w-6" /></span><h1 className="mt-4 text-xl font-bold text-slate-950">The calendar did not load</h1><p className="mt-2 text-sm leading-6 text-slate-600">Your data is still safe. Check your connection and try loading it again.</p><button type="button" onClick={reset} className="mt-5 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white">Try again</button></section></main>;
}
