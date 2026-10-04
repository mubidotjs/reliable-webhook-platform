import { recordMetric } from "@/modules/deliveries/metrics";
import { consumeAcceptanceQuota } from "@/modules/deliveries/quotas";
import { createHash, randomUUID } from "node:crypto";
import type { CreateEventInput } from "@rwp/contracts";
import { RETRY_WINDOW_MS } from "@rwp/domain";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-errors";
import type { WorkspaceRequestContext } from "@/lib/api-request";
import { scheduleWork } from "@/modules/deliveries/store";
import { deliveryLog } from "@/modules/deliveries/log";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, child]) => JSON.stringify(key) + ":" + canonical(child))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function createEventService(
  database: PrismaClient = db,
  now = () => new Date(),
) {
  return {
    async ingest(actor: WorkspaceRequestContext, input: CreateEventInput) {
      const producerEventId = input.eventId ?? randomUUID();
      const requestHash = createHash("sha256")
        .update(
          canonical({
            endpointId: input.endpointId,
            type: input.type,
            payload: input.payload,
          }),
        )
        .digest("hex");
      for (let retry = 0; ; retry++) {
        try {
          const result = await database.$transaction(
            async (tx) => {
              // Stable advisory locks serialize quota and duplicate requests across processes.
              await tx.$queryRaw`SELECT pg_advisory_xact_lock(721001)::text`;
              const existing = await tx.webhookEvent.findUnique({
                where: {
                  workspaceId_producerEventId: {
                    workspaceId: actor.workspaceId,
                    producerEventId,
                  },
                },
                include: { deliveries: { where: { replayOfId: null } } },
              });
              if (existing) {
                if (existing.requestHash !== requestHash)
                  throw new ApiError(
                    409,
                    "EVENT_ID_CONFLICT",
                    "Event ID conflict",
                    "This event ID was accepted with different content.",
                  );
                const delivery = existing.deliveries[0];
                if (!delivery)
                  throw new Error("Accepted event has no delivery");
                return {
                  eventId: producerEventId,
                  deliveryId: delivery.id,
                  status: delivery.status,
                  created: false as const,
                };
              }
              // Lock against disablement and rotation while snapshotting endpoint configuration.
              await tx.$queryRaw`SELECT id FROM webhook_endpoints WHERE id = ${input.endpointId} AND "workspaceId" = ${actor.workspaceId} FOR UPDATE`;
              const endpoint = await tx.webhookEndpoint.findFirst({
                where: { id: input.endpointId, workspaceId: actor.workspaceId },
                include: { secrets: true },
              });
              if (!endpoint)
                throw new ApiError(
                  404,
                  "ENDPOINT_NOT_FOUND",
                  "Endpoint not found",
                  "The endpoint does not exist in this workspace.",
                );
              if (endpoint.status !== "ENABLED")
                throw new ApiError(
                  409,
                  "ENDPOINT_DISABLED",
                  "Endpoint disabled",
                  "Disabled endpoints cannot accept new events.",
                );
              const secret = endpoint.secrets.find(
                (s) => s.version === endpoint.currentSecretVersion,
              );
              if (!secret) throw new Error("Endpoint secret missing");
              const acceptedAt = now();
              await consumeAcceptanceQuota(tx, actor.workspaceId, acceptedAt);
              const event = await tx.webhookEvent.create({
                data: {
                  workspaceId: actor.workspaceId,
                  endpointId: endpoint.id,
                  producerEventId,
                  requestHash,
                  type: input.type,
                  payload:
                    input.payload === null ? Prisma.JsonNull : input.payload,
                  deliveryBody: JSON.stringify({
                    eventId: producerEventId,
                    type: input.type,
                    createdAt: acceptedAt.toISOString(),
                    payload: input.payload,
                  }),
                  creationSource: "session-api",
                  correlationId: actor.correlationId,
                  createdAt: acceptedAt,
                },
              });
              const delivery = await tx.delivery.create({
                data: {
                  workspaceId: actor.workspaceId,
                  eventId: event.id,
                  endpointId: endpoint.id,
                  endpointSecretId: secret.id,
                  destinationUrl: endpoint.url,
                  timeoutMs: 5000,
                  createdAt: acceptedAt,
                  nextAttemptAt: acceptedAt,
                  retryDeadline: new Date(
                    acceptedAt.getTime() + RETRY_WINDOW_MS,
                  ),
                  correlationId: actor.correlationId,
                },
              });
              const outbox = await scheduleWork(
                tx,
                delivery.id,
                1,
                acceptedAt,
                acceptedAt,
              );
              await tx.auditEvent.create({
                data: {
                  workspaceId: actor.workspaceId,
                  actorId: actor.userId,
                  action: "event.accepted",
                  targetType: "event",
                  targetId: event.id,
                  metadata: {
                    deliveryId: delivery.id,
                    endpointId: endpoint.id,
                    eventId: producerEventId,
                  },
                },
              });
              await recordMetric(tx, "events.accepted", acceptedAt);
              await recordMetric(tx, "deliveries.created", acceptedAt);
              return {
                created: true as const,
                outboxId: outbox.id,
                eventId: producerEventId,
                deliveryId: delivery.id,
                status: delivery.status,
              };
            },
            { timeout: 15_000 },
          );
          const fields = {
            tenantId: actor.workspaceId,
            eventId: result.eventId,
            endpointId: input.endpointId,
            deliveryId: result.deliveryId,
            correlationId: actor.correlationId,
          };
          if (result.created) {
            deliveryLog("event.accepted", fields);
            deliveryLog("delivery.created", fields);
            deliveryLog("outbox.created", {
              ...fields,
              outboxId: result.outboxId,
            });
          }
          return {
            eventId: result.eventId,
            deliveryId: result.deliveryId,
            status: result.status,
          };
        } catch (error) {
          if (
            retry < 3 &&
            error instanceof Prisma.PrismaClientKnownRequestError &&
            ["P2034", "P2002"].includes(error.code)
          )
            continue;
          throw error;
        }
      }
    },
  };
}
