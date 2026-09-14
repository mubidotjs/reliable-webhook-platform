import { notFound } from "next/navigation";
import { requireDashboardWorkspace } from "@/modules/dashboard/session";
import { dashboardQueries } from "@/modules/dashboard/queries";
import {
  PageHeading,
  RecordLink,
  StatusBadge,
  Time,
  panel,
} from "@/components/dashboard/common";
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
      <PageHeading
        title={event.type}
        description="The delivery body was stored at acceptance and is reused unchanged for every attempt."
      />
      <div className={panel + " space-y-4 text-sm"}>
        <p className="break-all">
          Event ID: <code>{event.producerEventId}</code>
        </p>
        <p>
          Accepted: <Time value={event.createdAt} />
        </p>
        <p>
          <RecordLink href={`/dashboard/endpoints/${event.endpointId}`}>
            {event.endpoint.url}
          </RecordLink>
        </p>
        {event.deliveries.map((d) => (
          <div key={d.id} className="flex flex-wrap gap-4">
            <RecordLink href={`/dashboard/deliveries/${d.id}`}>
              Open delivery
            </RecordLink>
            <StatusBadge status={d.status} />
          </div>
        ))}
      </div>
      <h2 className="mb-3 mt-7 font-semibold">Exact delivery body</h2>
      <pre
        className={
          panel +
          " overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-slate-300"
        }
      >
        {event.deliveryBody}
      </pre>
    </>
  );
}
