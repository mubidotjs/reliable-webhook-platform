import Link from "next/link";
import {
  Ban,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock3,
  LoaderCircle,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { deliveryLabels } from "./delivery-format";

export const panel = "rounded-lg border border-line bg-surface p-4 sm:p-6";
export const inputStyle =
  "mt-2 block min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2.5 text-sm text-foreground placeholder:text-slate-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60";
export function PageHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-9 tracking-tight [overflow-wrap:anywhere]">
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted [overflow-wrap:anywhere]">
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
const states: Record<
  string,
  { label: string; tone: string; icon: LucideIcon }
> = {
  PENDING: {
    label: deliveryLabels.PENDING!,
    tone: "status-neutral",
    icon: Clock3,
  },
  PROCESSING: {
    label: deliveryLabels.PROCESSING!,
    tone: "status-info",
    icon: LoaderCircle,
  },
  RETRY_SCHEDULED: {
    label: deliveryLabels.RETRY_SCHEDULED!,
    tone: "status-warning",
    icon: RotateCcw,
  },
  SUCCEEDED: {
    label: deliveryLabels.SUCCEEDED!,
    tone: "status-success",
    icon: CircleCheck,
  },
  EXHAUSTED: {
    label: deliveryLabels.EXHAUSTED!,
    tone: "status-danger",
    icon: CircleX,
  },
  CANCELLED: {
    label: deliveryLabels.CANCELLED!,
    tone: "status-neutral",
    icon: Ban,
  },
  ENABLED: { label: "Enabled", tone: "status-success", icon: CircleCheck },
  DISABLED: { label: "Disabled", tone: "status-neutral", icon: Ban },
  FAILED: { label: "Failed", tone: "status-danger", icon: CircleX },
  UNCERTAIN: { label: "Uncertain", tone: "status-warning", icon: CircleHelp },
  STARTED: { label: "Started", tone: "status-info", icon: LoaderCircle },
};
export function StatusBadge({ status }: { status: string }) {
  const state = states[status] ?? {
    label: "Unknown",
    tone: "status-neutral",
    icon: CircleHelp,
  };
  const Icon = state.icon;
  return (
    <span className={"status-badge " + state.tone}>
      <Icon className="size-3.5" aria-hidden="true" />
      {state.label}
    </span>
  );
}
export function Time({
  value,
  compact = false,
}: {
  value: Date | null;
  compact?: boolean;
}) {
  if (!value) return <span>—</span>;
  const iso = value.toISOString();
  return (
    <time dateTime={iso} title={iso} className="tabular-nums">
      {compact ? (
        <>
          <span className="block">{iso.slice(0, 10)}</span>
          <span className="text-xs text-muted">
            {iso.slice(11, 19)}
            <span className="sr-only"> UTC</span>
          </span>
        </>
      ) : (
        iso.replace("T", " ").slice(0, 19) + " UTC"
      )}
    </time>
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
    <nav
      aria-label="Record pagination"
      className="mt-4 flex flex-wrap gap-5 text-sm text-accent"
    >
      {hasCursor && (
        <Link className="inline-flex min-h-11 items-center" href={base}>
          Newest records
        </Link>
      )}
      {cursor && (
        <Link
          className="inline-flex min-h-11 items-center"
          href={base + "?cursor=" + encodeURIComponent(cursor)}
        >
          Older records →
        </Link>
      )}
    </nav>
  );
}
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-5 py-8 text-sm leading-7 text-muted">
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
      className="break-words text-accent underline decoration-accent/30 underline-offset-4 hover:text-cyan-200 [overflow-wrap:anywhere]"
      href={href}
    >
      {children}
    </Link>
  );
}
