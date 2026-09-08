import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";

export type Transaction = Prisma.TransactionClient;
export const terminalStatuses = [
  "SUCCEEDED",
  "EXHAUSTED",
  "CANCELLED",
] as const;

export async function scheduleWork(
  tx: Transaction,
  deliveryId: string,
  generation: number,
  dueAt: Date,
  availableAt = new Date(),
) {
  const id = randomUUID();
  return tx.outboxMessage.upsert({
    where: { dedupeKey: `delivery:${deliveryId}:${generation}` },
    create: {
      id,
      topic: "delivery",
      aggregateId: deliveryId,
      generation,
      dedupeKey: `delivery:${deliveryId}:${generation}`,
      payload: { outboxId: id, deliveryId, generation },
      dueAt,
      availableAt,
    },
    update: {},
  });
}
export async function consumeWork(
  tx: Transaction,
  deliveryId: string,
  generation: number,
  now: Date,
) {
  await tx.outboxMessage.updateMany({
    where: {
      topic: "delivery",
      aggregateId: deliveryId,
      generation,
      status: { not: "CONSUMED" },
    },
    data: {
      status: "CONSUMED",
      consumedAt: now,
      leaseExpiresAt: null,
      claimToken: null,
    },
  });
}
