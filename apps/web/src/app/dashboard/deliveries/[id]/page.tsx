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
  panel,
} from "@/components/dashboard/common";
import { RefreshDelivery } from "@/components/dashboard/refresh";
import { ReplayDialog } from "@/components/dashboard/replay-dialog";
import { CopyId } from "@/components/dashboard/copy-id";
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
  return (
    <>
      <div className="mb-5">
        <RecordLink href={back}>← Back to deliveries</RecordLink>
      </div>
      <PageHeading title="Delivery details" description={delivery.event.type} />
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <StatusBadge status={delivery.status} />
        <span>
          {delivery.attemptCount} of {MAX_ATTEMPTS} attempts
        </span>
        <ReplayDialog deliveryId={delivery.id} target={delivery.replay} />
      </div>
      <CopyId value={delivery.id} label="delivery ID" />
      {delivery.replayOfId && (
        <p className="mt-4 text-sm">
          Replayed from delivery{" "}
          <RecordLink href={"/dashboard/deliveries/" + delivery.replayOfId}>
            {delivery.replayOfId}
          </RecordLink>
        </p>
      )}
      <RefreshDelivery active={active} />
      <section className={panel}>
        <h2 className="mb-4 text-lg font-semibold">Delivery summary</h2>
        <dl className="grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-slate-400">Created</dt>
            <dd>
              <Time value={delivery.createdAt} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Last attempt</dt>
            <dd>
              <Time value={latest?.startedAt ?? null} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Last HTTP status</dt>
            <dd>{latest?.outcome?.httpStatus ?? "No response recorded"}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Last duration</dt>
            <dd>{duration(latest?.outcome?.durationMs)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Terminal time</dt>
            <dd>
              <Time value={delivery.terminalAt} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Retry deadline</dt>
            <dd>
              <Time value={delivery.retryDeadline} />
            </dd>
          </div>
        </dl>
        {delivery.status === "RETRY_SCHEDULED" && (
          <div className="mt-5 rounded-lg bg-amber-300/5 p-4 text-sm">
            <p>
              Next attempt: <Time value={delivery.nextAttemptAt} />
            </p>
            <p className="mt-2">
              Attempt {Math.min(delivery.attemptCount + 1, MAX_ATTEMPTS)} of{" "}
              {MAX_ATTEMPTS}
            </p>
            <p className="mt-2">
              Previous failure:{" "}
              {failureDescription(
                latest?.outcome?.errorClass,
                latest?.outcome?.httpStatus,
              )}
            </p>
          </div>
        )}
        {delivery.status === "EXHAUSTED" && (
          <p className="mt-5 text-sm text-red-300">
            {failureDescription(delivery.exhaustedReason ?? delivery.lastError)}
          </p>
        )}
        {delivery.status === "CANCELLED" && (
          <p className="mt-5 text-sm">
            {failureDescription(delivery.lastError)}
          </p>
        )}
        {delivery.status === "SUCCEEDED" && (
          <p className="mt-5 text-sm text-emerald-300">
            HTTP delivery succeeded. Your receiver must verify the signature
            before returning success; this platform cannot independently confirm
            that verification.
          </p>
        )}
        {delivery.status === "PENDING" && (
          <p className="mt-5 text-sm text-slate-400">
            Accepted and queued, awaiting dispatch.
          </p>
        )}
      </section>
      <section className={panel + " mt-6"}>
        <h2 className="mb-4 text-lg font-semibold">Endpoint</h2>
        <p>{endpointLabel(delivery.endpoint)}</p>
        <p className="my-3">
          <StatusBadge status={delivery.endpoint.status} />
        </p>
        <CopyId value={delivery.endpointId} label="endpoint ID" />
        <p className="mt-3 text-sm text-slate-400">Delivery destination</p>
        <p className="break-all text-sm">{delivery.destinationUrl}</p>
        {delivery.endpoint.url !== delivery.destinationUrl && (
          <>
            <p className="mt-3 text-sm text-slate-400">
              Current destination for replay
            </p>
            <p className="break-all text-sm">{delivery.endpoint.url}</p>
          </>
        )}
      </section>
      <section className={panel + " mt-6"}>
        <h2 className="mb-4 text-lg font-semibold">Event payload</h2>
        <p className="mb-2 text-sm">{delivery.event.type}</p>
        <CopyId value={delivery.event.producerEventId} label="event ID" />
        <div className="my-3 text-xs text-slate-400">
          Event record:{" "}
          <CopyId value={delivery.eventId} label="event record ID" />
        </div>
        <p className="mb-4 text-sm">
          <Time value={delivery.event.createdAt} />
        </p>
        <pre
          tabIndex={0}
          aria-label="Event JSON payload"
          className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-6"
        >
          <code>{JSON.stringify(delivery.event.payload, null, 2)}</code>
        </pre>
      </section>
      <h2 className="mb-4 mt-8 text-lg font-semibold">Attempt history</h2>
      {!delivery.attempts.length && (
        <p className={panel}>No outbound attempt has started yet.</p>
      )}
      <ol className="space-y-4">
        {delivery.attempts.map((a) => (
          <li key={a.id} className={panel}>
            <div className="flex flex-wrap items-center gap-4">
              <h3 className="font-semibold">Attempt #{a.sequence}</h3>
              <StatusBadge status={a.outcome?.status ?? "STARTED"} />
            </div>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-400">Started</dt>
                <dd>
                  <Time value={a.startedAt} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Completed</dt>
                <dd>
                  <Time value={a.outcome?.completedAt ?? null} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">HTTP status</dt>
                <dd>{a.outcome?.httpStatus ?? "No response recorded"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Duration</dt>
                <dd>{duration(a.outcome?.durationMs)}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Outcome</dt>
                <dd>
                  {a.outcome
                    ? failureDescription(
                        a.outcome.errorClass,
                        a.outcome.httpStatus,
                      )
                    : "Awaiting outcome"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Resulting delivery state</dt>
                <dd>
                  {a.outcome ? (
                    <StatusBadge status={a.outcome.resultingState} />
                  ) : (
                    "Awaiting outcome"
                  )}
                </dd>
              </div>
            </dl>
            <p className="mt-4 break-all font-mono text-xs text-slate-500">
              Attempt ID: {a.id}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-sm text-slate-400">
        Response bodies were not retained. Recorded HTTP status and failure
        classifications are shown above.
      </p>
    </>
  );
}
