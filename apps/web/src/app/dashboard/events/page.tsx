import { requireDashboardWorkspace } from "@/modules/dashboard/session";
import { dashboardQueries } from "@/modules/dashboard/queries";
import {
  PageHeading,
  Pagination,
  EmptyState,
  RecordLink,
  Time,
} from "@/components/dashboard/common";
import { EventForm } from "@/components/dashboard/event-form";
import { FormDisclosure } from "@/components/dashboard/form-disclosure";
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const workspace = await requireDashboardWorkspace();
  const { cursor } = await searchParams;
  const [result, endpoints] = await Promise.all([
    dashboardQueries.events(workspace.id, cursor),
    dashboardQueries.enabledEndpoints(workspace.id),
  ]);
  return (
    <>
      <PageHeading
        title="Events"
        description="Submit an event once and follow its durable delivery. Reusing the same event ID and content returns the original delivery."
      />
      {endpoints.length ? (
        <FormDisclosure
          title="Send test event"
          initiallyOpen={!cursor && !result.data.length}
        >
          <EventForm endpoints={endpoints} />
        </FormDisclosure>
      ) : (
        <div className="mb-6">
          <EmptyState>
            You need an enabled endpoint before sending an event.{" "}
            <RecordLink href="/dashboard/endpoints">Add an endpoint</RecordLink>
            .
          </EmptyState>
        </div>
      )}
      <h2 className="mb-4 text-lg font-semibold">Accepted events</h2>
      {!result.data.length ? (
        <EmptyState>
          {cursor
            ? "No older events on this page."
            : "No events have been accepted in this workspace yet."}
        </EmptyState>
      ) : (
        <div
          className="table-region"
          role="region"
          aria-label="Event records"
          tabIndex={0}
        >
          <table className="data-table min-w-[640px]">
            <caption className="sr-only">Accepted events</caption>
            <thead>
              <tr>
                {["Event type", "Producer event ID", "Accepted (UTC)"].map(
                  (label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {result.data.map((e) => (
                <tr key={e.id}>
                  <td>
                    <RecordLink href={"/dashboard/events/" + e.id}>
                      {e.type}
                    </RecordLink>
                  </td>
                  <td
                    className="max-w-xs truncate font-mono text-xs"
                    title={e.producerEventId}
                  >
                    {e.producerEventId}
                  </td>
                  <td className="text-xs">
                    <Time value={e.createdAt} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        base="/dashboard/events"
        cursor={result.nextCursor}
        hasCursor={Boolean(cursor)}
      />
    </>
  );
}
