export default function Loading() {
  return (
    <div role="status" aria-label="Loading deliveries" className="space-y-4">
      <div className="skeleton h-9 w-48" />
      <div className="skeleton h-5 w-72 max-w-full" />
      <div className="skeleton h-20" />
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="skeleton h-11 rounded-none" />
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-[68px] border-t border-line px-4 py-5">
            <div className="skeleton h-5 w-3/4" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading deliveries…</span>
    </div>
  );
}
