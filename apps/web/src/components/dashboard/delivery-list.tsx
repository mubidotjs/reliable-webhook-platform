import type { deliveryQueries } from "@/modules/deliveries/queries";
import { MAX_ATTEMPTS } from "@rwp/domain";
import { EmptyState, RecordLink, StatusBadge, Time } from "./common";
import { duration, endpointLabel } from "./delivery-format";
type Rows = Awaited<ReturnType<typeof deliveryQueries.list>>["data"];
export function DeliveryList({
  rows,
  query = "",
}: {
  rows: Rows;
  query?: string;
}) {
  if (!rows.length)
    return (
      <EmptyState>
        {query ? (
          "No deliveries match these filters. Clear or adjust the filters to try again."
        ) : (
          <>
            No webhook deliveries yet.{" "}
            <RecordLink href="/dashboard/events">
              Send your first test event
            </RecordLink>{" "}
            to see its delivery here.
          </>
        )}
      </EmptyState>
    );
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full min-w-[1150px] text-left text-sm">
        <caption className="sr-only">Webhook delivery history</caption>
        <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-400">
          <tr>
            {[
              "Status",
              "Delivery / Event",
              "Endpoint",
              "Attempts",
              "Last HTTP",
              "Created (UTC)",
              "Last attempt (UTC)",
              "Duration",
            ].map((label) => (
              <th scope="col" key={label} className="px-4 py-4">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row) => {
            const attempt = row.attempts[0];
            return (
              <tr key={row.id}>
                <td className="px-4 py-4">
                  <StatusBadge status={row.status} />
                </td>
                <td className="max-w-xs px-4 py-4">
                  <RecordLink
                    href={`/dashboard/deliveries/${row.id}${query ? "?list=" + encodeURIComponent(query) : ""}`}
                  >
                    {row.event.type}
                  </RecordLink>
                  <p className="mt-2 break-all font-mono text-xs">
                    Delivery: {row.id}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-400">
                    Event: {row.event.producerEventId}
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-500">
                    Record: {row.eventId}
                  </p>
                </td>
                <td className="max-w-xs px-4 py-4">
                  <p>{endpointLabel(row.endpoint)}</p>
                  <p
                    className="mt-1 truncate text-xs text-slate-400"
                    title={row.destinationUrl}
                  >
                    {row.destinationUrl}
                  </p>
                </td>
                <td className="px-4 py-4">
                  {row.attemptCount} / {MAX_ATTEMPTS}
                </td>
                <td className="px-4 py-4">
                  {attempt?.outcome?.httpStatus ?? "—"}
                </td>
                <td className="px-4 py-4 text-xs">
                  <Time value={row.createdAt} />
                </td>
                <td className="px-4 py-4 text-xs">
                  <Time value={attempt?.startedAt ?? null} />
                </td>
                <td className="px-4 py-4">
                  {duration(attempt?.outcome?.durationMs)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
