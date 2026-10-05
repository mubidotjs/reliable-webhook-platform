export default function Loading() {
  return (
    <div role="status" aria-label="Loading workspace" className="space-y-6">
      <div className="skeleton h-9 w-48" />
      <div className="skeleton h-5 w-72 max-w-full" />
      <div className="skeleton h-24" />
      <div className="skeleton h-64" />
      <span className="sr-only">Loading workspace…</span>
    </div>
  );
}
