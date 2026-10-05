import type { deliveryQueries } from "@/modules/deliveries/queries";
import { StatusBadge, Time, EmptyState } from "./common";
import { CopyId } from "./copy-id";
import { duration, failureDescription } from "./delivery-format";
type Delivery = NonNullable<Awaited<ReturnType<typeof deliveryQueries.detail>>>;
export function AttemptTimeline({ delivery }: { delivery: Delivery }) {
  return (
    <section aria-labelledby="attempt-history">
      <h2 id="attempt-history" className="mb-4 text-lg font-semibold">
        Attempt history
      </h2>
      {!delivery.attempts.length ? (
        <EmptyState>No outbound attempt has started yet.</EmptyState>
      ) : (
        <ol className="ml-2 border-l border-line">
          {delivery.attempts.map((attempt, index) => {
            const outcome = attempt.outcome;
            const next = delivery.attempts[index + 1];
            const gap =
              outcome && next
                ? next.startedAt.getTime() - outcome.completedAt.getTime()
                : null;
            return (
              <li key={attempt.id} className="relative pb-6 pl-6 last:pb-0">
                <span
                  className={
                    "absolute -left-[5px] top-2 size-[9px] rounded-full border-2 border-canvas " +
                    (outcome?.status === "SUCCEEDED"
                      ? "bg-emerald-300"
                      : outcome?.status === "FAILED"
                        ? "bg-rose-300"
                        : outcome?.status === "UNCERTAIN"
                          ? "bg-amber-300"
                          : "bg-accent")
                  }
                  aria-hidden="true"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Attempt #{attempt.sequence}</h3>
                  <StatusBadge status={outcome?.status ?? "STARTED"} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-medium">
                    {outcome?.httpStatus != null ? (
                      <>
                        HTTP <span>{outcome.httpStatus}</span>
                      </>
                    ) : outcome?.errorClass === "TIMEOUT" ? (
                      "Timeout"
                    ) : outcome ? (
                      "No response recorded"
                    ) : (
                      "Awaiting outcome"
                    )}
                  </span>
                  <span className="tabular-nums text-muted">
                    {duration(outcome?.durationMs)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  <Time value={attempt.startedAt} />
                </p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {outcome
                    ? failureDescription(outcome.errorClass, outcome.httpStatus)
                    : "An outbound attempt has started. Its outcome has not been recorded yet."}
                </p>
                <details className="mt-2">
                  <summary className="w-fit rounded py-2 text-xs text-accent">
                    Technical details
                  </summary>
                  <dl className="space-y-3 border-t border-line py-3 text-xs">
                    <div>
                      <dt className="text-muted">Completed</dt>
                      <dd className="mt-1">
                        <Time value={outcome?.completedAt ?? null} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Resulting delivery state</dt>
                      <dd className="mt-1">
                        {outcome ? (
                          <StatusBadge status={outcome.resultingState} />
                        ) : (
                          "Awaiting outcome"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Attempt ID</dt>
                      <dd>
                        <CopyId
                          value={attempt.id}
                          label={"attempt " + attempt.sequence + " ID"}
                        />
                      </dd>
                    </div>
                  </dl>
                </details>
                {outcome?.resultingState === "RETRY_SCHEDULED" && (
                  <p className="mt-3 border-t border-dashed border-line pt-3 text-xs text-amber-200">
                    Retry scheduled
                    {gap != null && gap >= 0 ? (
                      <span className="mt-1 block text-muted">
                        Next attempt started {duration(gap)} later.
                      </span>
                    ) : null}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-5 text-xs leading-6 text-muted">
        Response bodies were not retained. Recorded HTTP status and failure
        classifications are shown above.
      </p>
    </section>
  );
}
