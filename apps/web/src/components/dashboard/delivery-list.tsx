import type { deliveryQueries } from "@/modules/deliveries/queries";
import { MAX_ATTEMPTS } from "@rwp/domain";
import { EmptyState, RecordLink, StatusBadge, Time } from "./common";
import { duration, endpointLabel, failureDescription } from "./delivery-format";
type Rows = Awaited<ReturnType<typeof deliveryQueries.list>>["data"];
export function DeliveryList({
  rows,
  query = "",
}: {
  rows: Rows;
  query?: string;
}) {
  const params = new URLSearchParams(query);
  const filtered = [
    "status",
    "search",
    "endpointId",
    "eventType",
    "from",
    "to",
  ].some((key) => params.has(key));
  if (!rows.length)
    return (
      <EmptyState>
        {filtered ? (
          <>
            No deliveries match these filters.{" "}
            <RecordLink href="/dashboard/deliveries">
              Reset this view
            </RecordLink>{" "}
            or adjust them to try again.
          </>
        ) : params.has("cursor") ? (
          <>
            No older deliveries on this page.{" "}
            <RecordLink href="/dashboard/deliveries">Newest records</RecordLink>
          </>
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
    <div
      className="table-region"
      role="region"
      aria-label="Delivery records"
      tabIndex={0}
    >
      <table className="data-table min-w-[920px] table-fixed">
        <caption className="sr-only">Webhook delivery history</caption>
        <colgroup>
          <col className="w-[158px]" />
          <col />
          <col />
          <col className="w-[135px]" />
          <col className="w-[84px]" />
          <col className="w-[120px]" />
        </colgroup>
        <thead>
          <tr>
            {[
              "Status",
              "Event / delivery",
              "Endpoint",
              "Latest result",
              "Attempts",
              "Created (UTC)",
            ].map((label) => (
              <th
                scope="col"
                key={label}
                className={label === "Attempts" ? "text-right" : ""}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const outcome = row.attempts[0]?.outcome;
            const result =
              outcome?.httpStatus != null
                ? "HTTP " + outcome.httpStatus
                : outcome?.errorClass === "TIMEOUT"
                  ? "Timeout"
                  : outcome?.status === "UNCERTAIN"
                    ? "Uncertain"
                    : outcome
                      ? "No response"
                      : row.attemptCount
                        ? "In progress"
                        : "Not attempted";
            return (
              <tr key={row.id}>
                <td>
                  <StatusBadge status={row.status} />
                </td>
                <td>
                  <div className="truncate font-medium">
                    <RecordLink
                      href={`/dashboard/deliveries/${row.id}${query ? "?list=" + encodeURIComponent(query) : ""}`}
                    >
                      {row.event.type}
                    </RecordLink>
                  </div>
                  <p
                    className="mt-1 truncate font-mono text-xs text-muted"
                    title={row.id}
                  >
                    {row.id.slice(0, 8)}…{row.id.slice(-6)}
                  </p>
                </td>
                <td>
                  <p className="truncate" title={endpointLabel(row.endpoint)}>
                    {endpointLabel(row.endpoint)}
                  </p>
                  <p
                    className="mt-1 truncate font-mono text-xs text-muted"
                    title={row.destinationUrl}
                  >
                    {row.destinationUrl}
                  </p>
                </td>
                <td>
                  <p
                    className="text-xs font-medium"
                    title={failureDescription(
                      outcome?.errorClass,
                      outcome?.httpStatus,
                    )}
                  >
                    {result}
                  </p>
                  <p className="mt-1 text-xs tabular-nums text-muted">
                    {duration(outcome?.durationMs)}
                  </p>
                </td>
                <td className="text-right tabular-nums">
                  {row.attemptCount} / {MAX_ATTEMPTS}
                </td>
                <td className="text-xs">
                  <Time value={row.createdAt} compact />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
