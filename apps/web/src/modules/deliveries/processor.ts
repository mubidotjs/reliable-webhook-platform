import { randomUUID } from "node:crypto";
import {
  parseEncryptionKeyring,
  type EncryptionKeyringConfig,
} from "@rwp/config";
import {
  LEASE_MS,
  MAX_ATTEMPTS,
  retryDecision,
  signWebhook,
  type SendResult,
} from "@rwp/domain";
import type { PrismaClient, Delivery } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { decryptEndpointSecret } from "@/modules/endpoints/secret-crypto";
import { consumeWork, scheduleWork, type Transaction } from "./store";
import { deliveryLog } from "./log";
import { sendWebhook, type Transport } from "./transport";

export type DeliveryJob = {
  outboxId: string;
  deliveryId: string;
  generation: number;
};
type Options = {
  database?: PrismaClient;
  clock?: () => Date;
  random?: () => number;
  transport?: Transport;
  keyring?: EncryptionKeyringConfig;
};
export function createDeliveryProcessor(options: Options = {}) {
  const database = options.database ?? db;
  const clock = options.clock ?? (() => new Date());
  const random = options.random ?? Math.random;
  const transport = options.transport ?? sendWebhook;

  async function terminate(
    tx: Transaction,
    delivery: Delivery,
    status: "CANCELLED" | "EXHAUSTED",
    reason: string,
    now: Date,
  ) {
    await tx.delivery.update({
      where: { id: delivery.id },
      data: {
        status,
        terminalAt: now,
        nextAttemptAt: null,
        claimToken: null,
        leaseExpiresAt: null,
        lastError: reason,
        exhaustedReason: status === "EXHAUSTED" ? reason : null,
      },
    });
    await consumeWork(tx, delivery.id, delivery.generation, now);
    const event = await tx.webhookEvent.findUniqueOrThrow({
      where: { id: delivery.eventId },
    });
    deliveryLog(status === "CANCELLED" ? "cancelled" : "exhausted", {
      tenantId: delivery.workspaceId,
      eventId: event.producerEventId,
      endpointId: delivery.endpointId,
      deliveryId: delivery.id,
      correlationId: delivery.correlationId,
      reason,
    });
  }

  async function finish(
    deliveryId: string,
    token: string,
    result: SendResult,
    uncertain = false,
  ) {
    return database
      .$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM deliveries WHERE id = ${deliveryId} FOR UPDATE`;
        const delivery = await tx.delivery.findUnique({
          where: { id: deliveryId },
          include: { event: true },
        });
        if (
          !delivery ||
          delivery.status !== "PROCESSING" ||
          delivery.claimToken !== token
        )
          return;
        const now = clock();
        const attempt = await tx.deliveryAttempt.findUniqueOrThrow({
          where: {
            deliveryId_sequence: {
              deliveryId,
              sequence: delivery.attemptCount,
            },
          },
        });
        const decision = retryDecision({
          result,
          attemptCount: delivery.attemptCount,
          now,
          deadline: delivery.retryDeadline,
          random,
        });
        await tx.deliveryAttemptOutcome.create({
          data: {
            attemptId: attempt.id,
            status: uncertain
              ? "UNCERTAIN"
              : decision.status === "SUCCEEDED"
                ? "SUCCEEDED"
                : "FAILED",
            completedAt: now,
            httpStatus: result.httpStatus,
            durationMs: uncertain ? null : result.durationMs,
            errorClass: result.errorClass,
            responseMetadata: {},
            resultingState: decision.status,
          },
        });
        const retrying = decision.status === "RETRY_SCHEDULED";
        await tx.delivery.update({
          where: { id: delivery.id },
          data: {
            status: decision.status,
            nextAttemptAt: decision.nextAttemptAt,
            terminalAt: retrying ? null : now,
            claimToken: null,
            leaseExpiresAt: null,
            lastError: decision.reason,
            exhaustedReason:
              decision.status === "EXHAUSTED" ? decision.reason : null,
            ...(retrying ? { generation: { increment: 1 } } : {}),
          },
        });
        await consumeWork(tx, delivery.id, delivery.generation, now);
        if (decision.nextAttemptAt)
          await scheduleWork(
            tx,
            delivery.id,
            delivery.generation + 1,
            decision.nextAttemptAt,
            now,
          );
        return {
          event:
            decision.status === "SUCCEEDED"
              ? "success"
              : retrying
                ? "retry_scheduled"
                : "exhausted",
          fields: {
            tenantId: delivery.workspaceId,
            eventId: delivery.event.producerEventId,
            endpointId: delivery.endpointId,
            deliveryId,
            attemptId: attempt.id,
            correlationId: delivery.correlationId,
            ...(decision.reason ? { reason: decision.reason } : {}),
          },
        };
      })
      .then((result) => {
        if (result) deliveryLog(result.event, result.fields);
      });
  }

  return {
    async process(job: DeliveryJob) {
      const claimed = await database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM deliveries WHERE id = ${job.deliveryId} FOR UPDATE`;
        const delivery = await tx.delivery.findUnique({
          where: { id: job.deliveryId },
          include: { event: true, endpointSecret: true },
        });
        const work = await tx.outboxMessage.findUnique({
          where: { id: job.outboxId },
        });
        const now = clock();
        if (
          !delivery ||
          !work ||
          work.aggregateId !== delivery.id ||
          work.generation !== job.generation ||
          work.status === "CONSUMED" ||
          delivery.generation !== job.generation ||
          !["PENDING", "RETRY_SCHEDULED"].includes(delivery.status)
        )
          return null;
        await tx.$queryRaw`SELECT id FROM webhook_endpoints WHERE id = ${delivery.endpointId} FOR UPDATE`;
        const endpoint = await tx.webhookEndpoint.findUniqueOrThrow({
          where: { id: delivery.endpointId },
        });
        if (endpoint.status === "DISABLED") {
          await terminate(tx, delivery, "CANCELLED", "ENDPOINT_DISABLED", now);
          return null;
        }
        if (
          now >= delivery.retryDeadline ||
          delivery.attemptCount >= MAX_ATTEMPTS
        ) {
          await terminate(
            tx,
            delivery,
            "EXHAUSTED",
            now >= delivery.retryDeadline
              ? "RETRY_WINDOW_EXPIRED"
              : "ATTEMPT_LIMIT",
            now,
          );
          return null;
        }
        if (delivery.nextAttemptAt && delivery.nextAttemptAt > now) return null;
        const token = randomUUID();
        const attempt = await tx.deliveryAttempt.create({
          data: {
            deliveryId: delivery.id,
            sequence: delivery.attemptCount + 1,
            requestTimestamp: now,
            startedAt: now,
            destinationUrl: delivery.destinationUrl,
          },
        });
        await tx.delivery.update({
          where: { id: delivery.id },
          data: {
            status: "PROCESSING",
            attemptCount: { increment: 1 },
            claimToken: token,
            leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
          },
        });
        return { delivery, attempt, token };
      });
      if (!claimed) return;
      const { delivery, attempt, token } = claimed;
      deliveryLog("processing", {
        tenantId: delivery.workspaceId,
        eventId: delivery.event.producerEventId,
        endpointId: delivery.endpointId,
        deliveryId: delivery.id,
        attemptId: attempt.id,
        correlationId: delivery.correlationId,
      });
      let result: SendResult;
      let key: Buffer;
      try {
        key = decryptEndpointSecret(
          delivery.endpointSecret.encryptedSecret,
          delivery.endpointSecret.encryptionKeyVersion,
          {
            workspaceId: delivery.workspaceId,
            endpointId: delivery.endpointId,
            secretVersion: delivery.endpointSecret.version,
          },
          options.keyring ?? parseEncryptionKeyring(process.env),
        );
      } catch {
        await finish(delivery.id, token, {
          httpStatus: null,
          errorClass: "KEY_UNAVAILABLE",
          durationMs: 0,
        });
        return;
      }
      try {
        // A suspended worker must recheck its fence immediately before initiating I/O.
        const eligible = await database.delivery.count({
          where: {
            id: delivery.id,
            claimToken: token,
            status: "PROCESSING",
            leaseExpiresAt: { gt: clock() },
          },
        });
        if (!eligible) return;
        const timestamp = Math.floor(attempt.requestTimestamp.getTime() / 1000);
        result = await transport({
          url: delivery.destinationUrl,
          body: delivery.event.deliveryBody,
          headers: {
            "webhook-id": delivery.event.producerEventId,
            "webhook-timestamp": String(timestamp),
            "webhook-signature": signWebhook(
              key,
              delivery.event.producerEventId,
              timestamp,
              delivery.event.deliveryBody,
            ),
            "user-agent": "reliable-webhook-platform/0.2",
          },
        });
      } catch {
        result = {
          httpStatus: null,
          errorClass: "NETWORK",
          durationMs: Math.max(
            0,
            clock().getTime() - attempt.startedAt.getTime(),
          ),
        };
      } finally {
        key.fill(0);
      }
      await finish(delivery.id, token, result);
    },

    async recover(limit = 50) {
      const now = clock();
      const stale = await database.delivery.findMany({
        where: {
          status: "PROCESSING",
          OR: [{ leaseExpiresAt: { lte: now } }, { leaseExpiresAt: null }],
        },
        take: limit,
      });
      for (const delivery of stale) {
        // Old unfinished rows have no token. Assign one while holding the row lock.
        const token = await database.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM deliveries WHERE id = ${delivery.id} FOR UPDATE`;
          const current = await tx.delivery.findUniqueOrThrow({
            where: { id: delivery.id },
          });
          if (
            current.status !== "PROCESSING" ||
            (current.leaseExpiresAt && current.leaseExpiresAt > now)
          )
            return null;
          const token = randomUUID();
          await tx.delivery.update({
            where: { id: current.id },
            data: {
              claimToken: token,
              leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
            },
          });
          return token;
        });
        if (token)
          await finish(
            delivery.id,
            token,
            { httpStatus: null, errorClass: "UNCERTAIN", durationMs: 0 },
            true,
          );
      }
      const pending = await database.$queryRaw<{ id: string }[]>`
        SELECT d.id FROM deliveries d JOIN webhook_endpoints e ON e.id = d."endpointId"
        WHERE d.status IN ('PENDING', 'RETRY_SCHEDULED') AND (
          e.status = 'DISABLED' OR d."retryDeadline" <= ${now} OR d."attemptCount" >= 5 OR
          NOT EXISTS (SELECT 1 FROM outbox_messages o WHERE o."aggregateId" = d.id
            AND o.topic = 'delivery' AND o.generation = d.generation AND o.status != 'CONSUMED')
        ) ORDER BY d."nextAttemptAt", d.id LIMIT ${limit}`;
      for (const candidate of pending) {
        await database.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM deliveries WHERE id = ${candidate.id} FOR UPDATE`;
          const delivery = await tx.delivery.findUniqueOrThrow({
            where: { id: candidate.id },
          });
          if (!["PENDING", "RETRY_SCHEDULED"].includes(delivery.status)) return;
          const endpoint = await tx.webhookEndpoint.findUniqueOrThrow({
            where: { id: delivery.endpointId },
          });
          if (endpoint.status === "DISABLED")
            await terminate(
              tx,
              delivery,
              "CANCELLED",
              "ENDPOINT_DISABLED",
              now,
            );
          else if (
            delivery.retryDeadline <= now ||
            delivery.attemptCount >= MAX_ATTEMPTS
          )
            await terminate(
              tx,
              delivery,
              "EXHAUSTED",
              delivery.retryDeadline <= now
                ? "RETRY_WINDOW_EXPIRED"
                : "ATTEMPT_LIMIT",
              now,
            );
          else {
            const work = await scheduleWork(
              tx,
              delivery.id,
              delivery.generation,
              delivery.nextAttemptAt ?? now,
              now,
            );
            if (work.status === "CONSUMED") {
              await tx.delivery.update({
                where: { id: delivery.id },
                data: { generation: { increment: 1 } },
              });
              await scheduleWork(
                tx,
                delivery.id,
                delivery.generation + 1,
                delivery.nextAttemptAt ?? now,
                now,
              );
            }
          }
        });
      }
    },
  };
}
