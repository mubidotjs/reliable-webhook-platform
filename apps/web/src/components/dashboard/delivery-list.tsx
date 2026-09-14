import type { dashboardQueries } from "@/modules/dashboard/queries";
import { EmptyState, RecordLink, StatusBadge, Time } from "./common";
type Rows = Awaited<ReturnType<typeof dashboardQueries.deliveries>>["data"];
export function DeliveryList({ rows }: { rows: Rows }) {
  if (!rows.length)
    return (
      <EmptyState>
        No deliveries yet.{" "}
        <RecordLink href="/dashboard/events">
          Send your first test event
        </RecordLink>{" "}
        to see its delivery here.
      </EmptyState>
    );
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-400">
          <tr>
            {[
              "Event / destination",
              "Status",
              "Attempts",
              "Accepted (UTC)",
            ].map((label) => (
              <th key={label} className="px-5 py-4">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="max-w-sm px-5 py-4">
                <RecordLink href={`/dashboard/deliveries/${row.id}`}>
                  {row.event.type}
                </RecordLink>
                <p className="mt-1 break-all font-mono text-xs text-slate-500">
                  {row.event.producerEventId}
                </p>
                <p
                  className="mt-2 truncate text-slate-400"
                  title={row.destinationUrl}
                >
                  {row.destinationUrl}
                </p>
              </td>
              <td className="px-5 py-4">
                <StatusBadge status={row.status} />
              </td>
              <td className="px-5 py-4">{row.attemptCount} / 5</td>
              <td className="px-5 py-4 text-xs text-slate-400">
                <Time value={row.createdAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
