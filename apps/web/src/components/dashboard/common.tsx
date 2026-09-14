import Link from "next/link";
export const panel =
  "rounded-xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6";
export const inputStyle =
  "mt-2 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:opacity-60";
export function PageHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-7">
      <h1 className="text-3xl font-semibold tracking-tight text-white">
        {title}
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
        {description}
      </p>
    </div>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const tone = ["SUCCEEDED", "ENABLED"].includes(status)
    ? "status-success"
    : ["EXHAUSTED", "FAILED"].includes(status)
      ? "status-danger"
      : "status-warning";
  return (
    <span className={`status-badge ${tone}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}
export function Time({ value }: { value: Date | null }) {
  return value ? (
    <time dateTime={value.toISOString()}>
      {value.toISOString().replace("T", " ").slice(0, 19)} UTC
    </time>
  ) : (
    <span>—</span>
  );
}
export function Pagination({
  base,
  cursor,
  hasCursor,
}: {
  base: string;
  cursor: string | null;
  hasCursor: boolean;
}) {
  return (
    <div className="mt-5 flex gap-5 text-sm text-cyan-300">
      {hasCursor && <Link href={base}>Newest records</Link>}
      {cursor && (
        <Link href={`${base}?cursor=${encodeURIComponent(cursor)}`}>
          Older records →
        </Link>
      )}
    </div>
  );
}
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className={panel + " text-sm leading-7 text-slate-400"}>
      {children}
    </div>
  );
}
export function RecordLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      className="break-all text-cyan-300 underline decoration-cyan-300/30 underline-offset-4 hover:text-cyan-200"
      href={href}
    >
      {children}
    </Link>
  );
}
