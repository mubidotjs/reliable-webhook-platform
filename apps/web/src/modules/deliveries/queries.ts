import { createHash } from "node:crypto";
import { z } from "zod";
import { deliveryQuerySchema, type DeliveryQuery } from "@rwp/contracts";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api-errors";
import { parseRequest } from "@/lib/api-validation";
import { terminalStatuses } from "./store";
export function endpointRevision(endpoint: {
  url: string;
  currentSecretVersion: number;
  status: string;
  updatedAt: Date;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        endpoint.url,
        endpoint.currentSecretVersion,
        endpoint.status,
        endpoint.updatedAt.toISOString(),
      ]),
    )
    .digest("hex");
}
const cursorSchema = z
  .object({ id: z.string().min(1).max(64), createdAt: z.string().datetime() })
  .strict();
function cursorWhere(cursor?: string): Prisma.DeliveryWhereInput {
  if (!cursor) return {};
  try {
    const value = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString()),
    );
    const date = new Date(value.createdAt);
    return {
      OR: [
        { createdAt: { lt: date } },
        { createdAt: date, id: { lt: value.id } },
      ],
    };
  } catch {
    throw new ApiError(
      400,
      "INVALID_CURSOR",
      "Invalid cursor",
      "The pagination cursor is invalid.",
    );
  }
}
export const attemptSelect = {
  id: true,
  sequence: true,
  startedAt: true,
  outcome: {
    select: {
      status: true,
      completedAt: true,
      httpStatus: true,
      durationMs: true,
      errorClass: true,
      resultingState: true,
    },
  },
} as const;
export const deliverySelect = {
  id: true,
  eventId: true,
  endpointId: true,
  destinationUrl: true,
  status: true,
  attemptCount: true,
  createdAt: true,
  nextAttemptAt: true,
  terminalAt: true,
  lastError: true,
  event: { select: { producerEventId: true, type: true } },
  endpoint: { select: { name: true, url: true, status: true } },
  attempts: { orderBy: { sequence: "desc" }, take: 1, select: attemptSelect },
} as const;
export function createDeliveryQueries(database: PrismaClient = db) {
  return {
    async list(workspaceId: string, input: Partial<DeliveryQuery> = {}) {
      const query = parseRequest(deliveryQuerySchema, input, 400);
      const filters: Prisma.DeliveryWhereInput[] = [
        { workspaceId },
        cursorWhere(query.cursor),
      ];
      if (query.status) filters.push({ status: query.status });
      if (query.endpointId) filters.push({ endpointId: query.endpointId });
      if (query.eventType)
        filters.push({ event: { type: query.eventType, workspaceId } });
      if (query.from || query.to)
        filters.push({
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        });
      if (query.search)
        filters.push({
          OR: [
            { id: query.search },
            { eventId: query.search },
            { event: { producerEventId: query.search, workspaceId } },
          ],
        });
      const rows = await database.delivery.findMany({
        where: { AND: filters },
        select: deliverySelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
      });
      const data = rows.slice(0, query.limit);
      const last = data.at(-1);
      return {
        data,
        page: {
          limit: query.limit,
          nextCursor:
            rows.length > query.limit && last
              ? Buffer.from(
                  JSON.stringify({
                    id: last.id,
                    createdAt: last.createdAt.toISOString(),
                  }),
                ).toString("base64url")
              : null,
        },
      };
    },
    async detail(workspaceId: string, id: string) {
      const row = await database.delivery.findFirst({
        where: { workspaceId, id },
        select: {
          ...deliverySelect,
          timeoutMs: true,
          retryDeadline: true,
          exhaustedReason: true,
          replayOfId: true,
          event: {
            select: {
              producerEventId: true,
              type: true,
              createdAt: true,
              payload: true,
            },
          },
          endpoint: {
            select: {
              name: true,
              url: true,
              status: true,
              currentSecretVersion: true,
              updatedAt: true,
            },
          },
          attempts: { orderBy: { sequence: "asc" }, select: attemptSelect },
        },
      });
      if (!row) return null;
      const { endpoint, ...delivery } = row;
      return {
        ...delivery,
        endpoint: {
          name: endpoint.name,
          url: endpoint.url,
          status: endpoint.status,
        },
        replay: {
          eligible:
            terminalStatuses.some((s) => s === row.status) &&
            endpoint.status === "ENABLED",
          endpointRevision: endpointRevision(endpoint),
          destinationUrl: endpoint.url,
        },
      };
    },
    endpoints(workspaceId: string, cursor?: string) {
      return database.webhookEndpoint.findMany({
        where: { workspaceId, ...(cursor ? { id: { gt: cursor } } : {}) },
        select: { id: true, name: true, url: true, status: true },
        orderBy: { id: "asc" },
        take: 100,
      });
    },
  };
}
export const deliveryQueries = createDeliveryQueries();
