import { db } from "@/lib/db";
// Bounded cleanup touches operational counters only, never delivery audit history.
export async function pruneOperationalCounters() {
  const cutoff = new Date(Date.now() - 2 * 86400000);
  await db.$executeRaw`DELETE FROM quota_buckets WHERE id IN (
    SELECT id FROM quota_buckets WHERE "updatedAt" < ${cutoff}
    AND (subject = 'mutation-minute' OR subject LIKE 'auth:%')
    ORDER BY "updatedAt", id LIMIT 1000 FOR UPDATE SKIP LOCKED)`;
}
