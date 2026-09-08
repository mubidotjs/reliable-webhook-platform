import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { parseSigningSecret, verifyWebhookSignature } from "@rwp/domain";
import type { EncryptionKeyringConfig } from "@rwp/config";
import { db } from "@/lib/db";
import { createEndpointService } from "@/modules/endpoints/service";
import { createEventService } from "@/modules/events/service";
import { createDeliveryProcessor } from "./processor";
import { createOutboxPublisher } from "./outbox";
import { LocalQueue, type DeliveryQueue } from "./queue";
import type { Transport } from "./transport";

const keyring: EncryptionKeyringConfig = {
  activeVersion: "v1",
  keys: new Map([["v1", Buffer.alloc(32, 4)]]),
};
const owners: string[] = [];
async function fixture() {
  const userId = randomUUID();
  const user = await db.user.create({
    data: { id: userId, name: "M2", email: userId + "@m2.test" },
  });
  owners.push(user.id);
  const workspace = await db.workspace.create({
    data: { name: "M2", ownerId: user.id },
  });
  const actor = {
    userId: user.id,
    workspaceId: workspace.id,
    correlationId: randomUUID(),
  };
  const endpoints = createEndpointService({
    database: db,
    keyring,
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
  });
  const endpoint = await endpoints.create(actor, {
    url: "https://example.com/hooks",
    timeoutMs: 10_000,
  });
  let currentTime = new Date();
  const clock = () => currentTime;
  const ingest = createEventService(db, clock);
  const input = {
    eventId: randomUUID(),
    endpointId: endpoint.data.id,
    type: "invoice.paid",
    payload: { amount: 5, unicode: "é", nested: { b: 2, a: 1 } },
  };
  const accepted = await ingest.ingest(actor, input);
  const job = async () => {
    const delivery = await db.delivery.findUniqueOrThrow({
      where: { id: accepted.deliveryId },
    });
    const outbox = await db.outboxMessage.findUniqueOrThrow({
      where: { dedupeKey: `delivery:${delivery.id}:${delivery.generation}` },
    });
    return {
      outboxId: outbox.id,
      deliveryId: delivery.id,
      generation: delivery.generation,
    };
  };
  const advance = async () => {
    const delivery = await db.delivery.findUniqueOrThrow({
      where: { id: accepted.deliveryId },
    });
    currentTime = delivery.nextAttemptAt ?? new Date(+currentTime + 60_000);
  };
  const processor = (transport: Transport) =>
    createDeliveryProcessor({
      database: db,
      keyring,
      clock,
      random: () => 0,
      transport,
    });
  const history = () =>
    db.delivery.findUniqueOrThrow({
      where: { id: accepted.deliveryId },
      include: {
        event: true,
        attempts: { orderBy: { sequence: "asc" }, include: { outcome: true } },
      },
    });
  return {
    actor,
    endpoints,
    endpoint,
    accepted,
    input,
    ingest,
    job,
    advance,
    processor,
    history,
    clock,
    jump: (ms: number) => {
      currentTime = new Date(+currentTime + ms);
    },
  };
}
describe.runIf(Boolean(process.env.DATABASE_URL))("M2 durable delivery", () => {
  afterEach(async () => {
    const workspaces = await db.workspace.findMany({
      where: { ownerId: { in: owners } },
    });
    const deliveries = await db.delivery.findMany({
      where: { workspaceId: { in: workspaces.map((w) => w.id) } },
    });
    const acceptedEvents = await db.webhookEvent.findMany({
      where: { workspaceId: { in: workspaces.map((w) => w.id) } },
      select: { createdAt: true },
    });
    const buckets = new Map<string, number>();
    for (const event of acceptedEvents) {
      const day = event.createdAt.toISOString().slice(0, 10);
      buckets.set(day, (buckets.get(day) ?? 0) + 1);
    }
    for (const [day, count] of buckets) {
      await db.quotaBucket.updateMany({
        where: {
          workspaceId: null,
          subject: "accepted-deliveries",
          bucketStart: new Date(day + "T00:00:00Z"),
          count: { gte: count },
        },
        data: { count: { decrement: count } },
      });
    }
    await db.outboxMessage.deleteMany({
      where: { aggregateId: { in: deliveries.map((d) => d.id) } },
    });
    await db.delivery.deleteMany({
      where: { id: { in: deliveries.map((d) => d.id) } },
    });
    await db.webhookEvent.deleteMany({
      where: { workspaceId: { in: workspaces.map((w) => w.id) } },
    });
    await db.user.deleteMany({ where: { id: { in: owners.splice(0) } } });
  });
  afterAll(async () => db.$disconnect());

  it("delivers immutable signed bytes and appends a successful outcome", async () => {
    const f = await fixture();
    const p = f.processor(async (request) => {
      expect(request.body).toBe((await f.history()).event.deliveryBody);
      expect(
        verifyWebhookSignature(
          parseSigningSecret(f.endpoint.signingSecret),
          request.headers["webhook-id"]!,
          Number(request.headers["webhook-timestamp"]),
          request.body,
          request.headers["webhook-signature"]!,
        ),
      ).toBe(true);
      return { httpStatus: 204, errorClass: null, durationMs: 8 };
    });
    await p.process(await f.job());
    const history = await f.history();
    expect(history).toMatchObject({
      status: "SUCCEEDED",
      attemptCount: 1,
      timeoutMs: 5000,
    });
    expect(history.terminalAt).not.toBeNull();
    expect(history.attempts[0]?.outcome).toMatchObject({
      status: "SUCCEEDED",
      httpStatus: 204,
      resultingState: "SUCCEEDED",
    });
    await expect(
      db.deliveryAttempt.update({
        where: { id: history.attempts[0]!.id },
        data: { httpStatus: 400 },
      }),
    ).rejects.toThrow();
    await expect(
      db.deliveryAttemptOutcome.update({
        where: { attemptId: history.attempts[0]!.id },
        data: { httpStatus: 400 },
      }),
    ).rejects.toThrow();
    await expect(
      db.webhookEvent.update({
        where: { id: history.eventId },
        data: { deliveryBody: "{}" },
      }),
    ).rejects.toThrow();
  });

  it.each([
    [
      { httpStatus: 500, errorClass: null, durationMs: 1 },
      { httpStatus: 500, errorClass: null, durationMs: 2 },
    ],
    [{ httpStatus: null, errorClass: "TIMEOUT", durationMs: 5000 }],
    [{ httpStatus: null, errorClass: "NETWORK", durationMs: 1 }],
  ])("retries transient failures and succeeds", async (...failures) => {
    const f = await fixture();
    const results = [
      ...failures,
      { httpStatus: 200, errorClass: null, durationMs: 1 },
    ];
    const p = f.processor(async () => results.shift()!);
    const count = results.length;
    for (let i = 0; i < count; i++) {
      await p.process(await f.job());
      await f.advance();
    }
    const history = await f.history();
    expect(history.status).toBe("SUCCEEDED");
    expect(history.attemptCount).toBe(count);
    expect(history.attempts.map((a) => a.sequence)).toEqual(
      Array.from({ length: count }, (_, i) => i + 1),
    );
    expect(history.attempts.every((a) => a.outcome !== null)).toBe(true);
  });

  it("exhausts unavailable destinations after five attempts", async () => {
    const f = await fixture();
    const p = f.processor(async () => ({
      httpStatus: null,
      errorClass: "NETWORK",
      durationMs: 1,
    }));
    for (let i = 0; i < 5; i++) {
      await p.process(await f.job());
      await f.advance();
    }
    expect(await f.history()).toMatchObject({
      status: "EXHAUSTED",
      attemptCount: 5,
      exhaustedReason: "ATTEMPT_LIMIT",
    });
  });

  it("deduplicates concurrent producer submissions and rejects conflicts", async () => {
    const f = await fixture();
    const copies = await Promise.all(
      Array.from({ length: 5 }, () => f.ingest.ingest(f.actor, f.input)),
    );
    expect(
      copies.every((copy) => copy.deliveryId === f.accepted.deliveryId),
    ).toBe(true);
    await expect(
      f.ingest.ingest(f.actor, { ...f.input, type: "changed" }),
    ).rejects.toMatchObject({ code: "EVENT_ID_CONFLICT" });
    expect(
      await db.webhookEvent.count({
        where: { workspaceId: f.actor.workspaceId },
      }),
    ).toBe(1);
    expect(
      await db.quotaBucket.findFirst({
        where: {
          workspaceId: f.actor.workspaceId,
          subject: "accepted-deliveries",
        },
      }),
    ).toMatchObject({ count: 1 });
    const outsider = await fixture();
    await expect(
      f.ingest.ingest(outsider.actor, { ...f.input, eventId: randomUUID() }),
    ).rejects.toMatchObject({ code: "ENDPOINT_NOT_FOUND" });
  });

  it("serializes duplicate callbacks without spending additional attempts", async () => {
    const f = await fixture();
    let sends = 0;
    const p = f.processor(async () => {
      sends++;
      return { httpStatus: 200, errorClass: null, durationMs: 1 };
    });
    const job = await f.job();
    await Promise.all(Array.from({ length: 8 }, () => p.process(job)));
    await p.process(job);
    expect(sends).toBe(1);
    expect((await f.history()).attemptCount).toBe(1);
  });

  it("recovers outbox failure, expired publication leases, and lost callbacks", async () => {
    const f = await fixture();
    let publications = 0;
    const queue: DeliveryQueue = {
      kind: "qstash",
      publish: async () => {
        publications++;
        if (publications === 1) throw new Error("outage");
        return "provider-id";
      },
    };
    const publisher = createOutboxPublisher({
      database: db,
      clock: f.clock,
      queue,
    });
    await publisher.drain(1);
    expect(
      await db.outboxMessage.findUnique({
        where: { id: (await f.job()).outboxId },
      }),
    ).toMatchObject({ status: "PENDING", lastError: "PUBLISH_FAILED" });
    f.jump(300_000);
    await publisher.drain(1);
    expect(publications).toBe(2);
    f.jump(301_000);
    await publisher.drain(1);
    expect(publications).toBe(3);
    await db.outboxMessage.update({
      where: { id: (await f.job()).outboxId },
      data: { status: "PUBLISHING", leaseExpiresAt: new Date(+f.clock() - 1) },
    });
    await publisher.drain(1);
    expect(publications).toBe(4);
    await f
      .processor(async () => ({
        httpStatus: 200,
        errorClass: null,
        durationMs: 1,
      }))
      .process(await f.job());
    expect((await f.history()).status).toBe("SUCCEEDED");
  });

  it("recovers a crashed in-flight request and fences its late success", async () => {
    const f = await fixture();
    let release!: () => void;
    let started!: () => void;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const old = f.processor(async () => {
      started();
      await gate;
      return { httpStatus: 200, errorClass: null, durationMs: 1 };
    });
    const running = old.process(await f.job());
    await began;
    f.jump(31_000);
    const restarted = f.processor(async () => ({
      httpStatus: 200,
      errorClass: null,
      durationMs: 1,
    }));
    await restarted.recover();
    release();
    await running;
    expect(await f.history()).toMatchObject({
      status: "RETRY_SCHEDULED",
      attemptCount: 1,
    });
    expect((await f.history()).attempts[0]?.outcome?.status).toBe("UNCERTAIN");
    await f.advance();
    await restarted.process(await f.job());
    expect(await f.history()).toMatchObject({
      status: "SUCCEEDED",
      attemptCount: 2,
    });
  });

  it("cancels disabled endpoints and exhausts work past its deadline", async () => {
    const f = await fixture();
    const p = f.processor(async () => {
      throw new Error("must not send");
    });
    await f.endpoints.update(f.actor, f.endpoint.data.id, {
      status: "DISABLED",
    });
    await p.recover();
    expect(await f.history()).toMatchObject({
      status: "CANCELLED",
      attemptCount: 0,
    });
    const expired = await fixture();
    expired.jump(86_400_001);
    await expired
      .processor(async () => {
        throw new Error("must not send");
      })
      .recover();
    expect(await expired.history()).toMatchObject({
      status: "EXHAUSTED",
      attemptCount: 0,
      exhaustedReason: "RETRY_WINDOW_EXPIRED",
    });
  });

  it("uses the same PostgreSQL outbox for local dispatch and ignores early retries", async () => {
    const f = await fixture();
    let sends = 0;
    const processor = f.processor(async () => ({
      httpStatus: ++sends === 1 ? 500 : 200,
      errorClass: null,
      durationMs: 1,
    }));
    const publisher = createOutboxPublisher({
      database: db,
      clock: f.clock,
      queue: new LocalQueue(processor.process),
    });
    await publisher.drain(1);
    await processor.process(await f.job());
    expect(sends).toBe(1);
    await f.advance();
    await publisher.drain(1);
    expect(await f.history()).toMatchObject({
      status: "SUCCEEDED",
      attemptCount: 2,
    });
  });

  it.each(["after-claim", "after-send"])(
    "recovers an actual worker process exiting %s",
    async (mode) => {
      const f = await fixture();
      let received = 0;
      const receiver = createServer(async (request, response) => {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        expect(
          verifyWebhookSignature(
            parseSigningSecret(f.endpoint.signingSecret),
            String(request.headers["webhook-id"]),
            Number(request.headers["webhook-timestamp"]),
            Buffer.concat(chunks),
            String(request.headers["webhook-signature"]),
          ),
        ).toBe(true);
        received++;
        response.writeHead(200);
        response.end("ok");
      });
      await new Promise<void>((resolve) =>
        receiver.listen(0, "127.0.0.1", resolve),
      );
      const address = receiver.address() as AddressInfo;
      const run = (mode: string) =>
        new Promise<number | null>((resolve, reject) => {
          const child = spawn(
            process.execPath,
            [
              "--import",
              "tsx",
              "scripts/m2-test-worker.ts",
              f.accepted.deliveryId,
              mode,
              `http://127.0.0.1:${address.port}`,
              f.clock().toISOString(),
            ],
            {
              env: { ...process.env, NODE_ENV: "test" },
              windowsHide: true,
              stdio: ["ignore", "pipe", "pipe"],
            },
          );
          let output = "";
          child.stderr.on("data", (data) => {
            output += String(data);
          });
          child.on("error", reject);
          child.on("exit", (code) =>
            code === 0 || code === 17
              ? resolve(code)
              : reject(new Error(output)),
          );
        });
      try {
        expect(await run(mode)).toBe(17);
        expect((await f.history()).status).toBe("PROCESSING");
        f.jump(31_000);
        expect(await run("recover")).toBe(0);
        expect((await f.history()).attempts[0]?.outcome?.status).toBe(
          "UNCERTAIN",
        );
        await f.advance();
        expect(await run("success")).toBe(0);
        expect(await f.history()).toMatchObject({
          status: "SUCCEEDED",
          attemptCount: 2,
        });
        expect(received).toBe(mode === "after-send" ? 2 : 1);
      } finally {
        await new Promise<void>((resolve) => receiver.close(() => resolve()));
      }
    },
    30_000,
  );

  it("rolls back event, quota, delivery, and audit if outbox insertion fails", async () => {
    const f = await fixture();
    await db.$executeRawUnsafe(`CREATE FUNCTION m2_test_reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF EXISTS (SELECT 1 FROM deliveries d JOIN events e ON e.id = d."eventId"
        WHERE d.id = NEW."aggregateId" AND e.type = 'm2.rollback') THEN
        RAISE EXCEPTION 'simulated outbox persistence failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(
      "CREATE TRIGGER m2_test_outbox_failure BEFORE INSERT ON outbox_messages FOR EACH ROW EXECUTE FUNCTION m2_test_reject_outbox()",
    );
    try {
      await expect(
        f.ingest.ingest(f.actor, {
          ...f.input,
          eventId: randomUUID(),
          type: "m2.rollback",
        }),
      ).rejects.toThrow();
      expect(
        await db.webhookEvent.count({
          where: { workspaceId: f.actor.workspaceId },
        }),
      ).toBe(1);
      expect(
        await db.delivery.count({
          where: { workspaceId: f.actor.workspaceId },
        }),
      ).toBe(1);
      expect(
        await db.quotaBucket.findFirst({
          where: {
            workspaceId: f.actor.workspaceId,
            subject: "accepted-deliveries",
          },
        }),
      ).toMatchObject({ count: 1 });
    } finally {
      await db.$executeRawUnsafe(
        "DROP TRIGGER m2_test_outbox_failure ON outbox_messages",
      );
      await db.$executeRawUnsafe("DROP FUNCTION m2_test_reject_outbox()");
    }
  });

  it("pins the secret and URL through endpoint edits and rotation", async () => {
    const f = await fixture();
    await f.endpoints.rotateSecret(f.actor, f.endpoint.data.id);
    await f.endpoints.update(f.actor, f.endpoint.data.id, {
      url: "https://example.com/new",
    });
    await f
      .processor(async (request) => {
        expect(request.url).toBe("https://example.com/hooks");
        expect(
          verifyWebhookSignature(
            parseSigningSecret(f.endpoint.signingSecret),
            request.headers["webhook-id"]!,
            Number(request.headers["webhook-timestamp"]),
            request.body,
            request.headers["webhook-signature"]!,
          ),
        ).toBe(true);
        return { httpStatus: 200, errorClass: null, durationMs: 1 };
      })
      .process(await f.job());
    expect((await f.history()).status).toBe("SUCCEEDED");
  });

  it("reconstructs missing queue work without changing accepted event history", async () => {
    const f = await fixture();
    await db.outboxMessage.delete({ where: { id: (await f.job()).outboxId } });
    const p = f.processor(async () => ({
      httpStatus: 200,
      errorClass: null,
      durationMs: 1,
    }));
    await p.recover();
    await p.process(await f.job());
    expect((await f.history()).status).toBe("SUCCEEDED");
  });
});
