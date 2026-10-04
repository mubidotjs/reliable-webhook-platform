export function RecordLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-6">
      <div className="skeleton h-5 w-32" />
      <div className="skeleton h-9 w-56 max-w-full" />
      <div className="skeleton h-24" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
        <div className="skeleton h-64" />
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}
