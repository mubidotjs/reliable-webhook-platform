import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { performance } from "node:perf_hooks";
import type { AddressInfo } from "node:net";
import { parseHardeningEnvironment } from "@rwp/config";
import { parseSigningSecret, verifyWebhookSignature } from "@rwp/domain";
import { db } from "../src/lib/db";
import { createEndpointService } from "../src/modules/endpoints/service";
import { createEventService } from "../src/modules/events/service";
import { createDeliveryProcessor } from "../src/modules/deliveries/processor";
import { createOutboxPublisher } from "../src/modules/deliveries/outbox";
import { createDeliveryQueries } from "../src/modules/deliveries/queries";
import { LocalQueue } from "../src/modules/deliveries/queue";

const database = new URL(process.env.DATABASE_URL ?? "");
if (
  process.env.NODE_ENV !== "test" ||
  !["localhost", "127.0.0.1"].includes(database.hostname) ||
  !database.pathname.endsWith("_m4")
) {
  throw new Error(
    "Load tests require NODE_ENV=test and a dedicated loopback database ending in _m4.",
  );
}
const count = Number(process.argv[2] ?? 1000);
const concurrency = Number(process.argv[3] ?? 8);
if (
  !Number.isInteger(count) ||
  count < 1 ||
  count > 10000 ||
  !Number.isInteger(concurrency) ||
  concurrency < 1 ||
  concurrency > 32
)
  throw new Error("Use 1–10000 events and 1–32 workers.");
const limits = parseHardeningEnvironment(process.env);
if (
  limits.DAILY_GLOBAL_DELIVERY_LIMIT < count ||
  limits.DAILY_TENANT_DELIVERY_LIMIT < count
)
  throw new Error(
    "Explicitly raise both delivery quotas for this isolated benchmark.",
  );
const empty = await db.delivery.count();
if (empty)
  throw new Error(
    "Load database must contain no deliveries; use a fresh isolated database.",
  );
const keyring = {
  activeVersion: "v1",
  keys: new Map([["v1", Buffer.alloc(32, 4)]]),
};
const keys = new Map<string, Buffer>();
const receipts = new Map<string, number>();
const server = createServer(async (request, response) => {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const key = keys.get(request.url ?? "");
    const id = String(request.headers["webhook-id"]);
    const valid =
      key &&
      verifyWebhookSignature(
        key,
        id,
        Number(request.headers["webhook-timestamp"]),
        Buffer.concat(chunks),
        String(request.headers["webhook-signature"]),
      );
    if (!valid) {
      response.writeHead(401).end();
      return;
    }
    const attempts = (receipts.get(id) ?? 0) + 1;
    receipts.set(id, attempts);
    response
      .writeHead(
        Number(id.split(".").at(-1)) % 10 === 0 && attempts === 1 ? 500 : 200,
      )
      .end();
  } catch {
    response.writeHead(500).end();
  }
});
let ownerId: string | undefined;
let acceptedCount = 0;
const day = new Date();
day.setUTCHours(0, 0, 0, 0);
async function parallel<T>(items: T[], operation: (item: T) => Promise<void>) {
  let index = 0;
  const results = await Promise.allSettled(
    Array.from({ length: concurrency }, async () => {
      while (index < items.length) {
        const item = items[index++];
        if (item !== undefined) await operation(item);
      }
    }),
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}
function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(
    (
      sorted[
        Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
      ] ?? 0
    ).toFixed(2),
  );
}
try {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  ownerId = randomUUID();
  const user = await db.user.create({
    data: {
      id: ownerId,
      name: "Load test",
      email: ownerId + "@load.invalid",
      workspace: { create: { name: "Load test" } },
    },
    include: { workspace: true },
  });
  const actor = {
    userId: ownerId,
    workspaceId: user.workspace!.id,
    correlationId: randomUUID(),
  };
  const endpointService = createEndpointService({
    database: db,
    keyring,
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
  });
  const endpoints: Awaited<ReturnType<typeof endpointService.create>>[] = [];
  for (let i = 0; i < 3; i++) {
    const endpoint = await endpointService.create(actor, {
      url: "https://example.com/load/" + i,
      timeoutMs: 5000,
    });
    endpoints.push(endpoint);
    keys.set("/load/" + i, parseSigningSecret(endpoint.signingSecret));
  }
  const latencies: number[] = [];
  let clockTime = new Date();
  const clock = () => clockTime;
  const ingest = createEventService(db, clock);
  const start = performance.now();
  await parallel(
    Array.from({ length: count }, (_, i) => i),
    async (i) => {
      const at = performance.now();
      await ingest.ingest(actor, {
        eventId: "load." + ownerId + "." + i,
        endpointId: endpoints[i % 3]!.data.id,
        type: "load.created",
        payload: { i, body: "x".repeat(512) },
      });
      acceptedCount++;
      latencies.push(performance.now() - at);
    },
  );
  const ingestionMs = performance.now() - start;
  const processor = createDeliveryProcessor({
    database: db,
    clock,
    keyring,
    random: () => 0,
    // Test-only loopback transport: production policy is never relaxed.
    transport: async (request) => {
      const at = performance.now();
      const response = await fetch(origin + new URL(request.url).pathname, {
        method: "POST",
        body: request.body,
        headers: request.headers,
        signal: AbortSignal.timeout(5000),
        redirect: "manual",
      });
      await response.body?.cancel();
      return {
        httpStatus: response.status,
        errorClass: null,
        durationMs: Math.round(performance.now() - at),
      };
    },
  });
  const publisher = createOutboxPublisher({
    database: db,
    clock,
    queue: new LocalQueue(processor.process),
  });
  const deliveryStart = performance.now();
  for (let round = 0; round < 3; round++) {
    while (
      await db.outboxMessage.count({
        where: { status: "PENDING", dueAt: { lte: clockTime } },
      })
    ) {
      await parallel(
        Array.from({ length: concurrency }, (_, i) => i),
        async () => {
          await publisher.drain(25);
        },
      );
    }
    clockTime = new Date(+clockTime + 3600000);
  }
  const deliveryMs = performance.now() - deliveryStart;
  const queries = createDeliveryQueries(db);
  let cursor: string | undefined;
  const seen = new Set<string>();
  const queryMs: number[] = [];
  do {
    const at = performance.now();
    const page = await queries.list(actor.workspaceId, {
      limit: 50,
      ...(cursor ? { cursor } : {}),
    });
    queryMs.push(performance.now() - at);
    for (const row of page.data) {
      if (seen.has(row.id)) throw new Error("Duplicate history row");
      seen.add(row.id);
    }
    cursor = page.page.nextCursor ?? undefined;
  } while (cursor);
  const succeeded = await db.delivery.count({
    where: { workspaceId: actor.workspaceId, status: "SUCCEEDED" },
  });
  const attempts = await db.deliveryAttempt.count({
    where: { delivery: { workspaceId: actor.workspaceId } },
  });
  if (succeeded !== count || seen.size !== count || receipts.size !== count)
    throw new Error("Load correctness invariant failed");
  const plan =
    await db.$queryRaw`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM outbox_messages WHERE "aggregateId" = ${(await db.delivery.findFirstOrThrow({ where: { workspaceId: actor.workspaceId } })).id} AND topic='delivery' AND generation=1 AND status != 'CONSUMED'`;
  console.info(
    JSON.stringify(
      {
        events: count,
        endpoints: 3,
        concurrency,
        succeeded,
        attempts,
        historyRows: seen.size,
        ingestionMs: Math.round(ingestionMs),
        ingestionP95Ms: percentile(latencies, 0.95),
        deliveryMs: Math.round(deliveryMs),
        historyP95Ms: percentile(queryMs, 0.95),
        queryPlan: plan,
        limitations:
          "Service-level ingestion (HTTP/auth excluded); real signed loopback HTTP via injected test transport; local queue; retry clock accelerated; not a QStash benchmark.",
      },
      null,
      2,
    ),
  );
} finally {
  if (ownerId) {
    const workspace = await db.workspace.findUnique({ where: { ownerId } });
    if (workspace) {
      const deliveries = await db.delivery.findMany({
        where: { workspaceId: workspace.id },
        select: { id: true },
      });
      await db.outboxMessage.deleteMany({
        where: { aggregateId: { in: deliveries.map((d) => d.id) } },
      });
      await db.delivery.deleteMany({ where: { workspaceId: workspace.id } });
      await db.webhookEvent.deleteMany({
        where: { workspaceId: workspace.id },
      });
      await db.quotaBucket.updateMany({
        where: {
          workspaceId: null,
          subject: "accepted-deliveries",
          bucketStart: day,
          count: { gte: acceptedCount },
        },
        data: { count: { decrement: acceptedCount } },
      });
    }
    await db.user.delete({ where: { id: ownerId } });
  }
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
}
