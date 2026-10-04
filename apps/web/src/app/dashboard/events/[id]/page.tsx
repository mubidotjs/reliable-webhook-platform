import { notFound } from "next/navigation";
import { requireDashboardWorkspace } from "@/modules/dashboard/session";
import { dashboardQueries } from "@/modules/dashboard/queries";
import {
  PageHeading,
  RecordLink,
  StatusBadge,
  Time,
} from "@/components/dashboard/common";
import { CopyId } from "@/components/dashboard/copy-id";
import { CodeViewer } from "@/components/dashboard/code-viewer";
export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const workspace = await requireDashboardWorkspace();
  const event = await dashboardQueries.event(workspace.id, (await params).id);
  if (!event) notFound();
  return (
    <>
      <div className="mb-4">
        <RecordLink href="/dashboard/events">← Back to events</RecordLink>
      </div>
      <PageHeading
        title={event.type}
        description="The delivery body was stored at acceptance and is reused unchanged for every attempt."
      />
      <dl className="mb-6 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Producer event ID</dt>
          <dd>
            <CopyId value={event.producerEventId} label="event ID" />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Event record ID</dt>
          <dd>
            <CopyId value={event.id} label="event record ID" />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Accepted</dt>
          <dd className="mt-2">
            <Time value={event.createdAt} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted">Endpoint</dt>
          <dd className="mt-2">
            <RecordLink href={"/dashboard/endpoints/" + event.endpointId}>
              {event.endpoint.url}
            </RecordLink>
          </dd>
        </div>
      </dl>
      <section className="mb-6 border-t border-line pt-5">
        <h2 className="mb-3 text-lg font-semibold">Deliveries</h2>
        <div className="divide-y divide-line">
          {event.deliveries.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <RecordLink href={"/dashboard/deliveries/" + d.id}>
                Open delivery <span className="font-mono text-xs">{d.id}</span>
              </RecordLink>
              <StatusBadge status={d.status} />
            </div>
          ))}
        </div>
      </section>
      <h2 className="mb-3 text-lg font-semibold">Exact delivery body</h2>
      <CodeViewer value={event.deliveryBody} label="Exact delivery body" />
    </>
  );
}
