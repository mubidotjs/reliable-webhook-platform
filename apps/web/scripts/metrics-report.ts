import { errorDiagnostic } from "../src/lib/error-diagnostic";
import { db } from "../src/lib/db";
const hours = Number(process.argv[2] ?? 24);
if (!Number.isInteger(hours) || hours < 1 || hours > 720)
  throw new Error("Hours must be between 1 and 720.");
try {
  const rows = await db.metricAggregate.groupBy({
    by: ["metric"],
    where: { bucketStart: { gte: new Date(Date.now() - hours * 3600000) } },
    _sum: { count: true, total: true },
    orderBy: { metric: "asc" },
  });
  console.info(
    JSON.stringify(
      {
        hours,
        note: "UTC hourly buckets; counters are transitions, not cohort success rates. Timing totals are milliseconds; divide total by count for a mean. Database errors may prevent failure metrics from being stored; consult structured logs.",
        metrics: rows.map((row) => ({
          metric: row.metric,
          count: String(row._sum.count ?? 0n),
          total: String(row._sum.total ?? 0n),
        })),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      event: "metrics.report_failed",
      ...errorDiagnostic(error),
    }),
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
