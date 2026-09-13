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
import { RefreshDelivery } from "@/components/dashboard/refresh";
export default async function DeliveryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const workspace = await requireDashboardWorkspace();
  const delivery = await dashboardQueries.delivery(
    workspace.id,
    (await params).id,
  );
  if (!delivery) notFound();
  const active = ["PENDING", "PROCESSING", "RETRY_SCHEDULED"].includes(
    delivery.status,
  );
  return (
    <>
      <PageHeading title="Delivery details" description={delivery.event.type} />
      <div className="flex flex-wrap items-center gap-4">
        <StatusBadge status={delivery.status} />
        <span className="text-sm text-slate-400">
          {delivery.attemptCount} of 5 attempts
        </span>
      </div>
      <RefreshDelivery active={active} />
      <div className={panel + " grid gap-5 text-sm sm:grid-cols-2"}>
        <div>
          <p className="text-slate-500">Event ID</p>
          <RecordLink href={`/dashboard/events/${delivery.eventId}`}>
            {delivery.event.producerEventId}
          </RecordLink>
        </div>
        <div>
          <p className="text-slate-500">Pinned destination</p>
          <p className="break-all">{delivery.destinationUrl}</p>
        </div>
        <div>
          <p className="text-slate-500">Next attempt</p>
          <Time value={delivery.nextAttemptAt} />
        </div>
        <div>
          <p className="text-slate-500">Terminal time</p>
          <Time value={delivery.terminalAt} />
        </div>
        <div>
          <p className="text-slate-500">Retry deadline</p>
          <Time value={delivery.retryDeadline} />
        </div>
        <div>
          <p className="text-slate-500">Last failure</p>
          <p>{delivery.lastError ?? "None recorded"}</p>
        </div>
      </div>
      {delivery.status === "SUCCEEDED" && (
        <p className="mt-5 text-sm leading-6 text-emerald-300">
          HTTP delivery succeeded. Your receiver must verify the signature
          before returning success; this platform cannot independently confirm
          that verification.{" "}
          <RecordLink href="/dashboard/guide">Verification guide</RecordLink>
        </p>
      )}
      {delivery.status === "PENDING" && (
        <p className="mt-5 text-sm text-slate-400">
          Accepted and queued, awaiting dispatch. If it stays pending, check the
          worker or hosted queue configuration; acceptance alone does not
          confirm queue health.
        </p>
      )}
      <h2 className="mb-4 mt-8 text-lg font-semibold">Attempt history</h2>
      {!delivery.attempts.length && (
        <p className="text-sm text-slate-400">
          No outbound attempt has started yet.
        </p>
      )}
      <ol className="space-y-4">
        {delivery.attempts.map((a) => (
          <li key={a.id} className={panel}>
            <div className="flex flex-wrap items-center gap-4">
              <h3 className="font-semibold">Attempt #{a.sequence}</h3>
              <StatusBadge status={a.outcome?.status ?? "STARTED"} />
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Started</dt>
                <dd>
                  <Time value={a.startedAt} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Completed</dt>
                <dd>
                  <Time value={a.outcome?.completedAt ?? null} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">HTTP status</dt>
                <dd>{a.outcome?.httpStatus ?? "No response recorded"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Duration</dt>
                <dd>
                  {a.outcome?.durationMs == null
                    ? "Unknown"
                    : `${a.outcome.durationMs} ms`}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Failure classification</dt>
                <dd>{a.outcome?.errorClass ?? "None recorded"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Resulting delivery state</dt>
                <dd>{a.outcome?.resultingState ?? "Awaiting outcome"}</dd>
              </div>
            </dl>
            <p className="mt-3 break-all text-xs text-slate-500">
              {a.destinationUrl}
            </p>
            <p className="mt-2 break-all font-mono text-xs text-slate-500">
              Attempt ID: {a.id}
            </p>
            {a.outcome?.status === "UNCERTAIN" && (
              <p className="mt-4 text-sm leading-6 text-amber-300">
                The worker stopped before saving a definitive outcome. Your
                receiver may have received this attempt. A later attempt can
                deliver the same event again.
              </p>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}
