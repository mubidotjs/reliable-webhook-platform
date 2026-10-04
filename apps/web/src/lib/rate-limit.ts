import { parseHardeningEnvironment } from "@rwp/config";
import { db } from "./db";
import { ApiError } from "./api-errors";
import type { PrismaClient } from "@/generated/prisma/client";
export async function enforceMutationLimit(
  workspaceId: string,
  database: PrismaClient = db,
  now = new Date(),
) {
  const limit = parseHardeningEnvironment(
    process.env,
  ).MUTATION_REQUESTS_PER_MINUTE;
  const bucketStart = new Date(now);
  bucketStart.setUTCSeconds(0, 0);
  const allowed = await database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"mutation:" + workspaceId}, 0))::text`;
    const key = { subject: "mutation-minute", workspaceId, bucketStart };
    const bucket = await tx.quotaBucket.findUnique({
      where: { subject_bucketStart_workspaceId: key },
    });
    if ((bucket?.count ?? 0) >= limit) return false;
    await tx.quotaBucket.upsert({
      where: { subject_bucketStart_workspaceId: key },
      create: { ...key, count: 1 },
      update: { count: { increment: 1 } },
    });
    return true;
  });
  if (!allowed)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Too many requests",
      "Retry after the current minute.",
      Math.max(1, Math.ceil((+bucketStart + 60000 - +now) / 1000)),
    );
}
