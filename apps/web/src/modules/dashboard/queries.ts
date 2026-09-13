import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const cursorSchema = z.object({
  id: z.string().min(1).max(128),
  createdAt: z.string().datetime(),
});
export function cursorWhere(cursor?: string) {
  if (!cursor) return {};
  if (cursor.length > 512) throw new Error("Invalid page cursor");
  let value;
  try {
    value = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString()),
    );
  } catch {
    throw new Error("Invalid page cursor");
  }
  const date = new Date(value.createdAt);
  return {
    OR: [
      { createdAt: { lt: date } },
      { createdAt: date, id: { lt: value.id } },
    ],
  };
}
function page<T extends { id: string; createdAt: Date }>(rows: T[]) {
  const data = rows.slice(0, 25);
  const last = data.at(-1);
  return {
    data,
    nextCursor:
      rows.length > 25 && last
        ? Buffer.from(
            JSON.stringify({
              id: last.id,
              createdAt: last.createdAt.toISOString(),
            }),
          ).toString("base64url")
        : null,
  };
}
const endpointSelect = {
  id: true,
  url: true,
  status: true,
  currentSecretVersion: true,
  createdAt: true,
} as const;
const eventSelect = {
  id: true,
  producerEventId: true,
  type: true,
  createdAt: true,
  endpointId: true,
  endpoint: { select: { url: true } },
  deliveries: { select: { id: true, status: true } },
} as const;
const deliverySelect = {
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
} as const;
const orderBy = [{ createdAt: "desc" }, { id: "desc" }] as const;
export function createDashboardQueries(database: PrismaClient = db) {
  return {
    async overview(workspaceId: string) {
      const [endpoints, events, deliveries, recent] = await Promise.all([
        database.webhookEndpoint.count({ where: { workspaceId } }),
        database.webhookEvent.count({ where: { workspaceId } }),
        database.delivery.count({ where: { workspaceId } }),
        database.delivery.findMany({
          where: { workspaceId },
          select: deliverySelect,
          orderBy: [...orderBy],
          take: 5,
        }),
      ]);
      return { endpoints, events, deliveries, recent };
    },
    async endpoints(workspaceId: string, cursor?: string) {
      return page(
        await database.webhookEndpoint.findMany({
          where: { workspaceId, ...cursorWhere(cursor) },
          select: endpointSelect,
          orderBy: [...orderBy],
          take: 26,
        }),
      );
    },
    enabledEndpoints(workspaceId: string) {
      return database.webhookEndpoint.findMany({
        where: { workspaceId, status: "ENABLED" },
        select: { id: true, url: true },
        orderBy: [...orderBy],
        take: 5,
      });
    },
    endpoint(workspaceId: string, id: string) {
      return database.webhookEndpoint.findFirst({
        where: { workspaceId, id },
        select: endpointSelect,
      });
    },
    async events(workspaceId: string, cursor?: string) {
      return page(
        await database.webhookEvent.findMany({
          where: { workspaceId, ...cursorWhere(cursor) },
          select: eventSelect,
          orderBy: [...orderBy],
          take: 26,
        }),
      );
    },
    event(workspaceId: string, id: string) {
      return database.webhookEvent.findFirst({
        where: { workspaceId, id },
        select: { ...eventSelect, deliveryBody: true },
      });
    },
    async deliveries(workspaceId: string, cursor?: string) {
      return page(
        await database.delivery.findMany({
          where: { workspaceId, ...cursorWhere(cursor) },
          select: deliverySelect,
          orderBy: [...orderBy],
          take: 26,
        }),
      );
    },
    delivery(workspaceId: string, id: string) {
      return database.delivery.findFirst({
        where: { workspaceId, id },
        select: {
          ...deliverySelect,
          retryDeadline: true,
          attempts: {
            orderBy: { sequence: "asc" },
            select: {
              id: true,
              sequence: true,
              startedAt: true,
              destinationUrl: true,
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
            },
          },
        },
      });
    },
  };
}
export const dashboardQueries = createDashboardQueries();
