import { setTimeout as waitForDemo } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseSigningSecret, verifyWebhookSignature } from "@rwp/domain";
import { db } from "../src/lib/db";
import { createEndpointService } from "../src/modules/endpoints/service";
import { createEventService } from "../src/modules/events/service";
import { createOutboxPublisher } from "../src/modules/deliveries/outbox";

// This harness uses synthetic data and an injected loopback test transport.
// It deliberately does not weaken production destination validation.
const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1"].includes(databaseUrl.hostname))
  throw new Error("Use an isolated local test database");
const userId = randomUUID();
await db.user.create({
  data: { id: userId, name: "M2 demo", email: userId + "@demo.test" },
});
const workspace = await db.workspace.create({
  data: { name: "M2 demo", ownerId: userId },
});
const actor = {
  workspaceId: workspace.id,
  userId,
  correlationId: randomUUID(),
};
const endpoint = await createEndpointService({
  database: db,
  keyring: {
    activeVersion: "v1",
    keys: new Map([["v1", Buffer.alloc(32, 4)]]),
  },
  resolver: async () => [{ address: "93.184.216.34", family: 4 }],
}).create(actor, { url: "https://example.com/m2-demo", timeoutMs: 5000 });
const clock = () => new Date();
const ingestion = createEventService(db, clock);
const input = {
  eventId: randomUUID(),
  endpointId: endpoint.data.id,
  type: "demo.m2",
  payload: { synthetic: true },
};
const accepted = await ingestion.ingest(actor, input);
const duplicate = await ingestion.ingest(actor, input);
let receives = 0;
const receiver = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const valid = verifyWebhookSignature(
    parseSigningSecret(endpoint.signingSecret),
    String(request.headers["webhook-id"]),
    Number(request.headers["webhook-timestamp"]),
    Buffer.concat(chunks),
    String(request.headers["webhook-signature"]),
  );
  if (!valid) {
    response.writeHead(401);
    response.end();
    return;
  }
  response.writeHead(++receives === 1 ? 500 : 200);
  response.end("synthetic");
});
await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`;
const runWorker = () =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/m2-test-worker.ts",
        accepted.deliveryId,
        "demo",
        url,
        clock().toISOString(),
      ],
      {
        env: { ...process.env, NODE_ENV: "test" },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let errors = "";
    child.stderr.on("data", (data) => {
      errors += String(data);
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(errors)),
    );
  });
try {
  let publishes = 0;
  const publisher = createOutboxPublisher({
    database: db,
    clock,
    queue: {
      kind: "local",
      publish: async (job) => {
        if (++publishes === 1)
          throw new Error("Simulated QStash publishing outage");
        if (job.deliveryId !== accepted.deliveryId)
          throw new Error("Use a fresh isolated demo database");
        await runWorker();
        return "local-demo";
      },
    },
  });
  await publisher.drain(1);
  await waitForDemo(2100);
  await publisher.drain(1);
  let delivery = await db.delivery.findUniqueOrThrow({
    where: { id: accepted.deliveryId },
  });
  if (delivery.status !== "RETRY_SCHEDULED" || !delivery.nextAttemptAt)
    throw new Error("Expected first attempt to retry");
  await waitForDemo(Math.max(0, +delivery.nextAttemptAt - Date.now()) + 20);
  // The first child exited; a fresh OS process handles the durable retry.
  await publisher.drain(1);
  await runWorker(); // Duplicate invocation after success must not send.
  delivery = await db.delivery.findUniqueOrThrow({
    where: { id: accepted.deliveryId },
  });
  const attempts = await db.deliveryAttempt.findMany({
    where: { deliveryId: delivery.id },
    orderBy: { sequence: "asc" },
    include: { outcome: true },
  });
  if (
    delivery.status !== "SUCCEEDED" ||
    delivery.attemptCount !== 2 ||
    receives !== 2 ||
    duplicate.deliveryId !== delivery.id
  )
    throw new Error("M2 proof failed");
  const evidence = {
    generatedAt: new Date().toISOString(),
    mode: "local subprocess harness; simulated queue outage",
    accepted,
    duplicateDeliveryId: duplicate.deliveryId,
    status: delivery.status,
    receiverRequests: receives,
    freshWorkerProcesses: 3,
    publications: publishes,
    history: attempts.map((a) => ({
      attemptId: a.id,
      sequence: a.sequence,
      startedAt: a.startedAt,
      outcome: a.outcome,
    })),
  };
  const output = resolve("../../docs/reviews/m2-local-evidence.json");
  await mkdir(resolve("../../docs/reviews"), { recursive: true });
  await writeFile(output, JSON.stringify(evidence, null, 2) + "\n");
  console.info(
    "M2 local proof passed: 500 -> fresh worker -> 200; queue outage recovered; duplicate ignored.",
  );
  console.info(output);
} finally {
  await new Promise<void>((resolve) => receiver.close(() => resolve()));
  await db.$disconnect();
}
