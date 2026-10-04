import type { Transaction } from "./store";
import { db } from "@/lib/db";
import { deliveryLog } from "./log";
export type Metric =
  | "events.accepted"
  | "deliveries.created"
  | "deliveries.succeeded"
  | "attempts.failed"
  | "retries.scheduled"
  | "deliveries.exhausted"
  | "deliveries.cancelled"
  | "deliveries.replayed"
  | "outbox.publish_failed"
  | "queue.processing_failed"
  | "attempt.duration_ms"
  | "delivery.acceptance_to_success_ms"
  | "outbox.delay_ms"
  | "queue.delay_ms";
// Fixed metric names and no resource-ID dimensions keep cardinality bounded.
export async function recordMetric(
  tx: Transaction,
  metric: Metric,
  now: Date,
  value = 1,
) {
  const bucketStart = new Date(now);
  bucketStart.setUTCMinutes(0, 0, 0);
  await tx.metricAggregate.upsert({
    where: {
      metric_bucketStart_dimensionKey: {
        metric,
        bucketStart,
        dimensionKey: "global",
      },
    },
    create: {
      metric,
      bucketStart,
      dimensionKey: "global",
      dimensions: {},
      count: 1,
      total: BigInt(Math.max(0, Math.round(value))),
    },
    update: {
      count: { increment: 1 },
      total: { increment: BigInt(Math.max(0, Math.round(value))) },
    },
  });
}
// Failures outside a domain transaction must not hide the original error.
export async function recordFailure(metric: "queue.processing_failed") {
  try {
    await recordMetric(db, metric, new Date());
  } catch {
    deliveryLog("metrics.write_failed", {
      reason: "METRIC_STORAGE_UNAVAILABLE",
    });
  }
}
