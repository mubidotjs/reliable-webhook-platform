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
        <EventForm endpoints={endpoints} />
      ) : (
        <EmptyState>
          You need an enabled endpoint before sending an event.{" "}
          <RecordLink href="/dashboard/endpoints">Add an endpoint</RecordLink>.
        </EmptyState>
      )}
      <h2 className="mb-4 mt-8 text-lg font-semibold">Accepted events</h2>
      {!result.data.length ? (
        <EmptyState>
          No events have been accepted in this workspace yet.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {result.data.map((e) => (
            <article
              key={e.id}
              className="rounded-xl border border-slate-800 p-5"
            >
              <RecordLink href={`/dashboard/events/${e.id}`}>
                {e.type}
              </RecordLink>
              <p className="mt-2 break-all font-mono text-xs text-slate-400">
                {e.producerEventId}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                <Time value={e.createdAt} />
              </p>
            </article>
          ))}
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
