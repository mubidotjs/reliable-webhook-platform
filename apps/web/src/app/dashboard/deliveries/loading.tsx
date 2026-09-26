export default function Loading() {
  return (
    <div role="status" aria-label="Loading deliveries" className="space-y-5">
      <div className="h-10 w-64 animate-pulse rounded bg-slate-800" />
      <div className="h-40 animate-pulse rounded-xl bg-slate-900" />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded bg-slate-900" />
      ))}
      <span className="sr-only">Loading deliveries…</span>
    </div>
  );
}
