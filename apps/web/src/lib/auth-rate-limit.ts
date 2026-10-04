import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { db } from "./db";
export async function consumeAuthLimit(
  key: string,
  rule: { window: number; max: number },
  database: PrismaClient = db,
  now = new Date(),
) {
  const subject = "auth:" + createHash("sha256").update(key).digest("hex");
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${subject}, 0))::text`;
    const row = await tx.quotaBucket.findFirst({
      where: { subject, workspaceId: null, bucketStart: new Date(0) },
    });
    const expired = !row || +now - +row.updatedAt >= rule.window * 1000;
    if (!expired && row.count >= rule.max)
      return {
        allowed: false,
        retryAfter: Math.max(
          1,
          Math.ceil((+row.updatedAt + rule.window * 1000 - +now) / 1000),
        ),
      };
    if (row)
      await tx.quotaBucket.update({
        where: { id: row.id },
        data: { count: expired ? 1 : row.count + 1, updatedAt: now },
      });
    else
      await tx.quotaBucket.create({
        data: {
          subject,
          workspaceId: null,
          bucketStart: new Date(0),
          count: 1,
          updatedAt: now,
        },
      });
    return { allowed: true, retryAfter: null };
  });
}
