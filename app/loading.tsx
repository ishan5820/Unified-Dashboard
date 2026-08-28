export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[1500px] animate-pulse px-4 py-6 sm:px-6 sm:py-8 lg:px-10" aria-label="Loading calendar">
      <div className="mb-6"><div className="h-5 w-40 rounded-full bg-slate-200" /><div className="mt-3 h-10 w-96 max-w-full rounded-xl bg-slate-200" /><div className="mt-3 h-5 w-[34rem] max-w-full rounded-lg bg-slate-100" /></div>
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5"><div><div className="h-3 w-20 rounded bg-slate-100" /><div className="mt-2 h-6 w-36 rounded bg-slate-200" /></div><div className="h-10 w-56 rounded-xl bg-slate-100" /></div>
        <div className="grid min-w-[700px] grid-cols-7 border-b border-slate-100">{Array.from({ length: 7 }, (_, index) => <div key={index} className="h-9 border-r border-slate-100 bg-slate-50" />)}</div>
        <div className="grid min-w-[700px] grid-cols-7">{Array.from({ length: 42 }, (_, index) => <div key={index} className="min-h-32 border-b border-r border-slate-100 p-2"><div className="h-6 w-6 rounded-full bg-slate-100" />{index % 4 === 0 && <div className="mt-3 h-5 w-full rounded bg-slate-100" />}{index % 7 === 0 && <div className="mt-1 h-5 w-3/4 rounded bg-slate-50" />}</div>)}</div>
      </section>
    </main>
  );
}
