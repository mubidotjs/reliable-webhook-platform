import { parseQueueEnvironment } from "@rwp/config";
import { randomUUID } from "node:crypto";
import { LEASE_MS, RECOVERY_GRACE_MS } from "@rwp/domain";
import type { PrismaClient } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createDeliveryProcessor } from "./processor";
import {
  deliveryJobSchema,
  LocalQueue,
  QStashQueue,
  type DeliveryQueue,
} from "./queue";
import { deliveryLog } from "./log";

export function createOutboxPublisher(
  options: {
    database?: PrismaClient;
    queue?: DeliveryQueue;
    clock?: () => Date;
  } = {},
) {
  const database = options.database ?? db;
  const clock = options.clock ?? (() => new Date());
  const queue =
    options.queue ??
    (parseQueueEnvironment(process.env).QUEUE_ADAPTER === "qstash"
      ? new QStashQueue()
      : new LocalQueue(createDeliveryProcessor({ database, clock }).process));
  return {
    async drain(limit = 10) {
      const stopAt = Date.now() + 20_000;
      for (let index = 0; index < limit; index++) {
        if (index > 0 && Date.now() >= stopAt) break;
        const now = clock();
        const claimed = await database.$transaction(async (tx) => {
          const ids = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM outbox_messages WHERE topic = 'delivery' AND (
              (status = 'PENDING' AND "availableAt" <= ${now}) OR
              (status = 'PUBLISHING' AND ("leaseExpiresAt" <= ${now} OR "leaseExpiresAt" IS NULL)) OR
              (status = 'PUBLISHED' AND "dueAt" <= ${new Date(now.getTime() - RECOVERY_GRACE_MS)}
                AND "publishedAt" <= ${new Date(now.getTime() - RECOVERY_GRACE_MS)})
            ) AND (${queue.kind} = 'qstash' OR "dueAt" <= ${now})
            ORDER BY "availableAt", id FOR UPDATE SKIP LOCKED LIMIT 1`;
          const id = ids[0]?.id;
          if (!id) return null;
          if (queue.kind === "qstash") {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(721002)::text`;
            const bucketStart = new Date(now);
            bucketStart.setUTCHours(0, 0, 0, 0);
            const bucket = await tx.quotaBucket.findFirst({
              where: {
                subject: "qstash-publications",
                workspaceId: null,
                bucketStart,
              },
            });
            if ((bucket?.count ?? 0) >= 650) {
              await tx.outboxMessage.update({
                where: { id },
                data: {
                  status: "PENDING",
                  availableAt: new Date(bucketStart.getTime() + 86_400_000),
                  lastError: "PUBLICATION_BUDGET",
                },
              });
              return null;
            }
            if (bucket)
              await tx.quotaBucket.update({
                where: { id: bucket.id },
                data: { count: { increment: 1 } },
              });
            else
              await tx.quotaBucket.create({
                data: {
                  subject: "qstash-publications",
                  workspaceId: null,
                  bucketStart,
                  count: 1,
                },
              });
          }
          return tx.outboxMessage.update({
            where: { id },
            data: {
              status: "PUBLISHING",
              claimToken: randomUUID(),
              leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
              publishCount: { increment: 1 },
            },
          });
        });
        if (!claimed) break;
        try {
          const job = deliveryJobSchema.parse({
            outboxId: claimed.id,
            deliveryId: claimed.aggregateId,
            generation: claimed.generation,
          });
          const providerId = await queue.publish(job, claimed.dueAt);
          // A fast callback may already have consumed this item.
          await database.outboxMessage.updateMany({
            where: {
              id: claimed.id,
              status: "PUBLISHING",
              claimToken: claimed.claimToken,
            },
            data: {
              status: "PUBLISHED",
              providerId,
              publishedAt: clock(),
              claimToken: null,
              leaseExpiresAt: null,
              lastError: null,
            },
          });
        } catch {
          const delivery = await database.delivery.findUnique({
            where: { id: claimed.aggregateId },
            include: { event: true },
          });
          deliveryLog("queue_failure", {
            ...(delivery
              ? {
                  tenantId: delivery.workspaceId,
                  eventId: delivery.event.producerEventId,
                  endpointId: delivery.endpointId,
                  correlationId: delivery.correlationId,
                }
              : {}),
            outboxId: claimed.id,
            deliveryId: claimed.aggregateId,
            reason: "PUBLISH_FAILED",
          });
          await database.outboxMessage.updateMany({
            where: {
              id: claimed.id,
              status: "PUBLISHING",
              claimToken: claimed.claimToken,
            },
            data: {
              status: "PENDING",
              availableAt: new Date(
                clock().getTime() +
                  Math.min(
                    300_000,
                    1000 * 2 ** Math.min(claimed.publishCount, 8),
                  ),
              ),
              claimToken: null,
              leaseExpiresAt: null,
              lastError: "PUBLISH_FAILED",
            },
          });
        }
      }
    },
  };
}

export async function recoverAndDispatch() {
  await createDeliveryProcessor().recover();
  await createOutboxPublisher().drain();
}
export async function dispatchSafely() {
  try {
    await createOutboxPublisher().drain(3);
  } catch {
    deliveryLog("outbox_failure", { reason: "DISPATCH_FAILED" });
  }
}
