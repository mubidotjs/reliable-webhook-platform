import { notFound } from "next/navigation";
import { MAX_ATTEMPTS } from "@rwp/domain";
import { deliveryQuerySchema } from "@rwp/contracts";
import { requireDashboardWorkspace } from "@/modules/dashboard/session";
import { deliveryQueries } from "@/modules/deliveries/queries";
import {
  PageHeading,
  RecordLink,
  StatusBadge,
  Time,
} from "@/components/dashboard/common";
import { RefreshDelivery } from "@/components/dashboard/refresh";
import { ReplayDialog } from "@/components/dashboard/replay-dialog";
import { CopyId } from "@/components/dashboard/copy-id";
import { CodeViewer } from "@/components/dashboard/code-viewer";
import { AttemptTimeline } from "@/components/dashboard/attempt-timeline";
import {
  duration,
  endpointLabel,
  failureDescription,
} from "@/components/dashboard/delivery-format";
export default async function DeliveryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ list?: string }>;
}) {
  const workspace = await requireDashboardWorkspace();
  const delivery = await deliveryQueries.detail(
    workspace.id,
    (await params).id,
  );
  if (!delivery) notFound();
  const { list } = await searchParams;
  const back =
    list &&
    list.length <= 4096 &&
    deliveryQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(list)))
      .success
      ? "/dashboard/deliveries?" + new URLSearchParams(list)
      : "/dashboard/deliveries";
  const active = ["PENDING", "PROCESSING", "RETRY_SCHEDULED"].includes(
    delivery.status,
  );
  const latest = delivery.attempts.at(-1);
  const outcome = latest?.outcome;
  return (
    <>
      <div className="mb-4">
        <RecordLink href={back}>← Back to deliveries</RecordLink>
      </div>
      <PageHeading
        title="Delivery details"
        description={delivery.event.type}
        actions={
          <ReplayDialog deliveryId={delivery.id} target={delivery.replay} />
        }
      />
      <div className="mb-4">
        <CopyId value={delivery.id} label="delivery ID" />
        {delivery.replayOfId && (
          <p className="mt-2 text-sm text-muted">
            Replayed from delivery{" "}
            <RecordLink href={"/dashboard/deliveries/" + delivery.replayOfId}>
              {delivery.replayOfId}
            </RecordLink>
          </p>
        )}
      </div>
      <section
        aria-label="Delivery outcome"
        className="rounded-lg border border-line bg-surface p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={delivery.status} />
          <span className="text-sm tabular-nums text-muted">
            {delivery.attemptCount} of {MAX_ATTEMPTS} attempts
          </span>
          {outcome && (
            <span className="text-sm tabular-nums">
              {outcome.httpStatus != null
                ? "HTTP " + outcome.httpStatus
                : "No response recorded"}{" "}
              · {duration(outcome.durationMs)}
            </span>
          )}
        </div>
        <div className="mt-3 text-sm leading-6">
          {delivery.status === "PENDING" && (
            <p>Accepted and queued, awaiting dispatch.</p>
          )}
          {delivery.status === "PROCESSING" && (
            <p>
              An outbound attempt is in progress. Waiting for its recorded
              outcome.
            </p>
          )}
          {delivery.status === "RETRY_SCHEDULED" && (
            <>
              <p className="font-medium text-amber-200">
                Next attempt: <Time value={delivery.nextAttemptAt} />
              </p>
              <p className="text-muted">
                Attempt {Math.min(delivery.attemptCount + 1, MAX_ATTEMPTS)} of{" "}
                {MAX_ATTEMPTS}. Previous failure:{" "}
                {failureDescription(outcome?.errorClass, outcome?.httpStatus)}
              </p>
            </>
          )}
          {delivery.status === "EXHAUSTED" && (
            <p className="text-rose-200">
              {failureDescription(
                delivery.exhaustedReason ?? delivery.lastError,
              )}
            </p>
          )}
          {delivery.status === "CANCELLED" && (
            <p>{failureDescription(delivery.lastError)}</p>
          )}
          {delivery.status === "SUCCEEDED" && (
            <>
              <p className="text-emerald-200">HTTP delivery succeeded.</p>
              <p className="mt-1 text-muted">
                Your receiver must verify the signature before returning
                success; this platform cannot independently confirm that
                verification.
              </p>
            </>
          )}
        </div>
      </section>
      <RefreshDelivery active={active} />
      <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <AttemptTimeline delivery={delivery} />
        <aside
          aria-label="Delivery metadata"
          className="min-w-0 space-y-6 border-t border-line pt-6 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0"
        >
          <section>
            <h2 className="text-lg font-semibold">Endpoint</h2>
            <p className="mt-3">
              <RecordLink href={"/dashboard/endpoints/" + delivery.endpointId}>
                {endpointLabel(delivery.endpoint)}
              </RecordLink>
            </p>
            <div className="mt-2">
              <StatusBadge status={delivery.endpoint.status} />
            </div>
            <dl className="mt-3 space-y-3 text-xs">
              <div>
                <dt className="text-muted">Endpoint ID</dt>
                <dd>
                  <CopyId value={delivery.endpointId} label="endpoint ID" />
                </dd>
              </div>
              <div>
                <dt className="text-muted">Delivery destination</dt>
                <dd>
                  <CopyId
                    value={delivery.destinationUrl}
                    label="delivery destination URL"
                  />
                </dd>
              </div>
              {delivery.endpoint.url !== delivery.destinationUrl && (
                <div>
                  <dt className="text-muted">Current destination for replay</dt>
                  <dd>
                    <CopyId
                      value={delivery.endpoint.url}
                      label="current destination URL"
                    />
                  </dd>
                </div>
              )}
            </dl>
          </section>
          <section className="border-t border-line pt-5">
            <h2 className="text-lg font-semibold">Lifecycle</h2>
            <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-1">
              {[
                ["Created", delivery.createdAt],
                ["Last attempt", latest?.startedAt ?? null],
                ["Terminal time", delivery.terminalAt],
                ["Retry deadline", delivery.retryDeadline],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-muted">{String(label)}</dt>
                  <dd className="mt-1">
                    <Time value={value as Date | null} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
      <section
        className="mt-8 min-w-0 border-t border-line pt-6"
        aria-labelledby="payload-heading"
      >
        <h2 id="payload-heading" className="text-lg font-semibold">
          Event payload
        </h2>
        <div className="my-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          <div>
            <p className="text-muted">Producer event ID</p>
            <CopyId value={delivery.event.producerEventId} label="event ID" />
          </div>
          <div>
            <p className="text-muted">Event record</p>
            <CopyId value={delivery.eventId} label="event record ID" />
          </div>
          <p className="sm:col-span-2 text-muted">
            Accepted <Time value={delivery.event.createdAt} /> ·{" "}
            <RecordLink href={"/dashboard/events/" + delivery.eventId}>
              Open event
            </RecordLink>
          </p>
        </div>
        <CodeViewer
          value={JSON.stringify(delivery.event.payload, null, 2)}
          label="Event JSON payload"
        />
      </section>
    </>
  );
}
