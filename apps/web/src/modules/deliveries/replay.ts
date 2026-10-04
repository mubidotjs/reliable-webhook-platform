import { recordMetric } from "./metrics";
import { RETRY_WINDOW_MS } from "@rwp/domain";
import { replayKeySchema, replayRequestSchema } from "@rwp/contracts";
import type { PrismaClient } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-errors";
import { parseRequest } from "@/lib/api-validation";
import type { WorkspaceRequestContext } from "@/lib/api-request";
import { scheduleWork, terminalStatuses } from "./store";
import { consumeAcceptanceQuota } from "./quotas";
import { endpointRevision } from "./queries";
import { deliveryLog } from "./log";
export function createReplayService(
  database: PrismaClient = db,
  clock = () => new Date(),
) {
  return {
    async replay(
      actor: WorkspaceRequestContext,
      id: string,
      key: string,
      input: { endpointRevision: string },
    ) {
      key = parseRequest(replayKeySchema, key);
      parseRequest(replayRequestSchema, input);
      deliveryLog("delivery.replay_requested", {
        tenantId: actor.workspaceId,
        deliveryId: id,
        correlationId: actor.correlationId,
      });
      const result = await database.$transaction(
        async (tx) => {
          // Same lock order as ingestion: acceptance, then endpoint configuration.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(721001)::text`;
          const source = await tx.delivery.findFirst({
            where: { id, workspaceId: actor.workspaceId },
          });
          if (!source)
            throw new ApiError(
              404,
              "DELIVERY_NOT_FOUND",
              "Delivery not found",
              "The delivery does not exist in this workspace.",
            );
          const now = clock();
          const existing = await tx.idempotencyRecord.findUnique({
            where: {
              workspaceId_operation_key: {
                workspaceId: actor.workspaceId,
                operation: "delivery.replay",
                key,
              },
            },
          });
          if (existing && existing.expiresAt > now) {
            if (existing.requestHash !== id)
              throw new ApiError(
                409,
                "IDEMPOTENCY_CONFLICT",
                "Conflicting replay key",
                "This key was already used for another delivery.",
              );
            return { deliveryId: existing.resourceId, created: false as const };
          }
          if (existing)
            await tx.idempotencyRecord.delete({ where: { id: existing.id } });
          if (!terminalStatuses.some((s) => s === source.status))
            throw new ApiError(
              409,
              "DELIVERY_ACTIVE",
              "Delivery is active",
              "Wait for this delivery to finish before replaying it.",
            );
          await tx.$queryRaw`SELECT id FROM webhook_endpoints WHERE id = ${source.endpointId} AND "workspaceId" = ${actor.workspaceId} FOR UPDATE`;
          const endpoint = await tx.webhookEndpoint.findFirst({
            where: { id: source.endpointId, workspaceId: actor.workspaceId },
            include: { secrets: { where: { retiredAt: null } } },
          });
          if (!endpoint || endpoint.status !== "ENABLED")
            throw new ApiError(
              409,
              "ENDPOINT_DISABLED",
              "Endpoint disabled",
              "This endpoint must be enabled before replay.",
            );
          if (endpointRevision(endpoint) !== input.endpointRevision)
            throw new ApiError(
              409,
              "ENDPOINT_CHANGED",
              "Endpoint changed",
              "The endpoint configuration changed. Review the current destination and confirm again.",
            );
          const secret = endpoint.secrets.find(
            (s) => s.version === endpoint.currentSecretVersion,
          );
          if (!secret) throw new Error("Endpoint secret missing");
          await consumeAcceptanceQuota(tx, actor.workspaceId, now);
          const delivery = await tx.delivery.create({
            data: {
              workspaceId: actor.workspaceId,
              eventId: source.eventId,
              endpointId: endpoint.id,
              endpointSecretId: secret.id,
              destinationUrl: endpoint.url,
              timeoutMs: 5000,
              replayOfId: source.id,
              createdAt: now,
              nextAttemptAt: now,
              retryDeadline: new Date(+now + RETRY_WINDOW_MS),
              correlationId: actor.correlationId,
            },
          });
          const outbox = await scheduleWork(tx, delivery.id, 1, now, now);
          await tx.idempotencyRecord.create({
            data: {
              workspaceId: actor.workspaceId,
              operation: "delivery.replay",
              key,
              requestHash: id,
              resourceId: delivery.id,
              expiresAt: new Date(+now + 86_400_000),
            },
          });
          await tx.auditEvent.create({
            data: {
              workspaceId: actor.workspaceId,
              actorId: actor.userId,
              action: "delivery.replay.created",
              targetType: "delivery",
              targetId: delivery.id,
              metadata: { replayOfId: id, endpointId: endpoint.id },
            },
          });
          await recordMetric(tx, "deliveries.created", now);
          await recordMetric(tx, "deliveries.replayed", now);
          return {
            deliveryId: delivery.id,
            created: true as const,
            outboxId: outbox.id,
          };
        },
        { timeout: 15_000 },
      );
      if (result.created) {
        deliveryLog("delivery.created", {
          tenantId: actor.workspaceId,
          deliveryId: result.deliveryId,
          correlationId: actor.correlationId,
        });
        deliveryLog("outbox.created", {
          deliveryId: result.deliveryId,
          outboxId: result.outboxId,
        });
        deliveryLog("delivery.replay_created", {
          tenantId: actor.workspaceId,
          deliveryId: result.deliveryId,
          correlationId: actor.correlationId,
        });
      }
      return { deliveryId: result.deliveryId };
    },
  };
}
