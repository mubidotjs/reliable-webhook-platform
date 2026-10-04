import { parseHardeningEnvironment } from "@rwp/config";
import type { Transaction } from "./store";
import { ApiError } from "@/lib/api-errors";
// Call after taking acceptance lock 721001, shared by ingestion and replay.
export async function consumeAcceptanceQuota(
  tx: Transaction,
  workspaceId: string,
  now: Date,
) {
  const limits = parseHardeningEnvironment(process.env);
  const bucketStart = new Date(now);
  bucketStart.setUTCHours(0, 0, 0, 0);
  for (const [tenant, limit] of [
    [null, limits.DAILY_GLOBAL_DELIVERY_LIMIT],
    [workspaceId, limits.DAILY_TENANT_DELIVERY_LIMIT],
  ] as const) {
    const bucket = await tx.quotaBucket.findFirst({
      where: {
        workspaceId: tenant,
        subject: "accepted-deliveries",
        bucketStart,
      },
    });
    if ((bucket?.count ?? 0) >= limit)
      throw new ApiError(
        429,
        "DAILY_QUOTA_EXCEEDED",
        "Daily quota exceeded",
        "Try again after the next UTC day.",
        Math.max(1, Math.ceil((+bucketStart + 86_400_000 - +now) / 1000)),
      );
    if (bucket)
      await tx.quotaBucket.update({
        where: { id: bucket.id },
        data: { count: { increment: 1 } },
      });
    else
      await tx.quotaBucket.create({
        data: {
          workspaceId: tenant,
          subject: "accepted-deliveries",
          bucketStart,
          count: 1,
        },
      });
  }
}
