import { randomUUID } from "node:crypto";
import { serializeSignedCookie } from "better-call";
import { afterAll, afterEach, describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import { createEndpointService } from "@/modules/endpoints/service";
import { createEventService } from "@/modules/events/service";
import { createDeliveryQueries, deliveryQueries } from "./queries";
import { createReplayService } from "./replay";
import { createDeliveryProcessor } from "./processor";
import { GET as listRoute } from "@/app/api/deliveries/route";
import { GET as detailRoute } from "@/app/api/deliveries/[id]/route";
import { POST as replayRoute } from "@/app/api/deliveries/[id]/replay/route";
import {
  deliveryDetailResponseSchema,
  deliveryListResponseSchema,
} from "@rwp/contracts";
vi.mock("next/server", () => ({ after: vi.fn() }));
const owners: string[] = [];
const queries = createDeliveryQueries(db);
const keyring = {
  activeVersion: "v1",
  keys: new Map([["v1", Buffer.alloc(32, 4)]]),
};
async function fixture() {
  const userId = randomUUID();
  owners.push(userId);
  const token = randomUUID();
  const user = await db.user.create({
    data: {
      id: userId,
      name: "Operations",
      email: userId + "@operations.test",
      workspace: { create: { name: "Operations" } },
      sessions: {
        create: {
          id: randomUUID(),
          token,
          expiresAt: new Date(Date.now() + 3600000),
        },
      },
    },
    include: { workspace: true },
  });
  const actor = {
    userId,
    workspaceId: user.workspace!.id,
    correlationId: randomUUID(),
  };
  const endpoints = createEndpointService({
    database: db,
    keyring,
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
  });
  const endpoint = await endpoints.create(actor, {
    name: "  Production CRM  ",
    url: "https://example.com/hooks",
    timeoutMs: 5000,
  });
  const input = {
    eventId: randomUUID(),
    endpointId: endpoint.data.id,
    type: "invoice.paid",
    payload: { html: "<script>alert('test')</script>" },
  };
  const accepted = await createEventService(db).ingest(actor, input);
  const cookie = (
    await serializeSignedCookie(
      "better-auth.session_token",
      token,
      process.env.BETTER_AUTH_SECRET ??
        "development-only-secret-change-before-deploying",
      { httpOnly: true, sameSite: "lax", path: "/" },
    )
  ).split(";")[0]!;
  const detail = () => queries.detail(actor.workspaceId, accepted.deliveryId);
  const finish = async (
    status: "SUCCEEDED" | "EXHAUSTED" | "CANCELLED" = "EXHAUSTED",
  ) => {
    await db.delivery.update({
      where: { id: accepted.deliveryId },
      data: { status, terminalAt: new Date(), nextAttemptAt: null },
    });
    return (await detail())!;
  };
  return {
    actor,
    endpoint,
    endpoints,
    input,
    accepted,
    cookie,
    detail,
    finish,
  };
}
async function cleanup() {
  const workspaces = await db.workspace.findMany({
    where: { ownerId: { in: owners } },
  });
  const ids = workspaces.map((w) => w.id);
  const deliveries = await db.delivery.findMany({
    where: { workspaceId: { in: ids } },
  });
  const buckets = await db.quotaBucket.findMany({
    where: { workspaceId: { in: ids }, subject: "accepted-deliveries" },
  });
  for (const bucket of buckets)
    await db.quotaBucket.updateMany({
      where: {
        workspaceId: null,
        subject: bucket.subject,
        bucketStart: bucket.bucketStart,
        count: { gte: bucket.count },
      },
      data: { count: { decrement: bucket.count } },
    });
  await db.outboxMessage.deleteMany({
    where: { aggregateId: { in: deliveries.map((d) => d.id) } },
  });
  await db.delivery.deleteMany({ where: { workspaceId: { in: ids } } });
  await db.webhookEvent.deleteMany({ where: { workspaceId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: owners.splice(0) } } });
}
describe.runIf(Boolean(process.env.DATABASE_URL))("M3 operations", () => {
  afterEach(cleanup);
  afterAll(() => db.$disconnect());
  it("filters, searches, scopes and paginates tied timestamps with lightweight projections", async () => {
    const f = await fixture();
    const foreign = await fixture();
    const d = await f.finish();
    const event = await db.webhookEvent.findUniqueOrThrow({
      where: { id: d.eventId },
    });
    const secret = await db.endpointSecret.findFirstOrThrow({
      where: { endpointId: f.endpoint.data.id },
    });
    const date = new Date("2026-09-01T00:00:00Z");
    for (let i = 0; i < 3; i++)
      await db.delivery.create({
        data: {
          workspaceId: f.actor.workspaceId,
          eventId: event.id,
          endpointId: f.endpoint.data.id,
          endpointSecretId: secret.id,
          destinationUrl: f.endpoint.data.url,
          timeoutMs: 5000,
          replayOfId: d.id,
          retryDeadline: new Date(+date + 86400000),
          createdAt: date,
          correlationId: randomUUID(),
        },
      });
    const first = await queries.list(f.actor.workspaceId, { limit: 2 });
    const second = await queries.list(f.actor.workspaceId, {
      limit: 2,
      cursor: first.page.nextCursor!,
    });
    expect(new Set([...first.data, ...second.data].map((r) => r.id)).size).toBe(
      4,
    );
    expect(second.page.nextCursor).toBeNull();
    for (const search of [d.id, d.eventId, f.input.eventId])
      expect(
        (await queries.list(f.actor.workspaceId, { search })).data.some(
          (r) => r.id === d.id,
        ),
      ).toBe(true);
    for (const filter of [
      { status: "EXHAUSTED" as const },
      { endpointId: f.endpoint.data.id },
      { eventType: "invoice.paid" },
      { from: d.createdAt.toISOString(), to: d.createdAt.toISOString() },
    ])
      expect(
        (await queries.list(f.actor.workspaceId, filter)).data.some(
          (r) => r.id === d.id,
        ),
      ).toBe(true);
    for (const filter of [
      { endpointId: foreign.endpoint.data.id },
      { eventType: "missing" },
      { search: foreign.accepted.deliveryId },
      { to: "2000-01-01T00:00:00Z" },
    ])
      expect(
        (await queries.list(f.actor.workspaceId, filter)).data,
      ).toHaveLength(0);
    await expect(
      queries.list(f.actor.workspaceId, { cursor: "invalid" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await queries.detail(foreign.actor.workspaceId, d.id)).toBeNull();
    expect(JSON.stringify(first)).not.toMatch(
      /encryptedSecret|endpointSecretId|claimToken|payload|deliveryBody/,
    );
    expect(
      deliveryListResponseSchema.safeParse(JSON.parse(JSON.stringify(first)))
        .success,
    ).toBe(true);
    expect(
      deliveryDetailResponseSchema.safeParse(
        JSON.parse(JSON.stringify({ data: d })),
      ).success,
    ).toBe(true);
  }, 15000);
  it("deduplicates concurrent replay, preserves history, and pins current endpoint configuration", async () => {
    const f = await fixture();
    await f.finish();
    const original = await db.delivery.findUniqueOrThrow({
      where: { id: f.accepted.deliveryId },
      include: { attempts: true, event: true },
    });
    await f.endpoints.update(f.actor, f.endpoint.data.id, {
      url: "https://example.com/new",
      name: "Updated CRM",
    });
    await f.endpoints.rotateSecret(f.actor, f.endpoint.data.id);
    const detail = (await f.detail())!;
    const key = randomUUID();
    const service = createReplayService(db);
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        service.replay(f.actor, detail.id, key, {
          endpointRevision: detail.replay.endpointRevision,
        }),
      ),
    );
    expect(new Set(results.map((r) => r.deliveryId)).size).toBe(1);
    const replay = await db.delivery.findUniqueOrThrow({
      where: { id: results[0]!.deliveryId },
      include: { endpointSecret: true },
    });
    expect(replay).toMatchObject({
      status: "PENDING",
      attemptCount: 0,
      eventId: original.eventId,
      replayOfId: original.id,
      destinationUrl: "https://example.com/new",
    });
    expect(replay.endpointSecret.version).toBe(2);
    expect(+replay.retryDeadline).toBeGreaterThan(+replay.createdAt);
    expect(
      await db.delivery.findUniqueOrThrow({
        where: { id: original.id },
        include: { attempts: true, event: true },
      }),
    ).toEqual(original);
    expect(
      (await createEventService(db).ingest(f.actor, f.input)).deliveryId,
    ).toBe(original.id);
    expect(
      await db.outboxMessage.count({ where: { aggregateId: replay.id } }),
    ).toBe(1);
    expect(
      await db.auditEvent.count({
        where: { targetId: replay.id, action: "delivery.replay.created" },
      }),
    ).toBe(1);
    expect(
      (
        await db.quotaBucket.findFirstOrThrow({
          where: {
            workspaceId: f.actor.workspaceId,
            subject: "accepted-deliveries",
          },
        })
      ).count,
    ).toBe(2);
    // A lost response can be recovered even if the endpoint is subsequently disabled.
    await f.endpoints.update(f.actor, f.endpoint.data.id, {
      status: "DISABLED",
    });
    expect(
      await service.replay(f.actor, detail.id, key, {
        endpointRevision: detail.replay.endpointRevision,
      }),
    ).toEqual(results[0]);
  }, 15000);
  it("rejects active, foreign, disabled, changed and conflicting replay requests", async () => {
    const f = await fixture();
    const other = await fixture();
    const service = createReplayService(db);
    let d = (await f.detail())!;
    await expect(
      service.replay(f.actor, d.id, randomUUID(), {
        endpointRevision: d.replay.endpointRevision,
      }),
    ).rejects.toMatchObject({ code: "DELIVERY_ACTIVE" });
    await expect(
      service.replay(other.actor, d.id, randomUUID(), {
        endpointRevision: d.replay.endpointRevision,
      }),
    ).rejects.toMatchObject({ status: 404 });
    d = await f.finish("SUCCEEDED");
    await f.endpoints.update(f.actor, f.endpoint.data.id, { name: "Changed" });
    await expect(
      service.replay(f.actor, d.id, randomUUID(), {
        endpointRevision: d.replay.endpointRevision,
      }),
    ).rejects.toMatchObject({ code: "ENDPOINT_CHANGED" });
    d = (await f.detail())!;
    const key = randomUUID();
    const result = await service.replay(f.actor, d.id, key, {
      endpointRevision: d.replay.endpointRevision,
    });
    await expect(
      service.replay(f.actor, result.deliveryId, key, {
        endpointRevision: d.replay.endpointRevision,
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await f.endpoints.update(f.actor, f.endpoint.data.id, {
      status: "DISABLED",
    });
    await expect(
      service.replay(f.actor, d.id, randomUUID(), {
        endpointRevision: d.replay.endpointRevision,
      }),
    ).rejects.toMatchObject({ code: "ENDPOINT_DISABLED" });
  }, 15000);
  it("enforces replay quotas and rolls back all writes if outbox insertion fails", async () => {
    const f = await fixture();
    const d = await f.finish("CANCELLED");
    const key = randomUUID();
    const before = await db.quotaBucket.findFirstOrThrow({
      where: {
        workspaceId: f.actor.workspaceId,
        subject: "accepted-deliveries",
      },
    });
    await db.quotaBucket.update({
      where: { id: before.id },
      data: { count: 25 },
    });
    await expect(
      createReplayService(db).replay(f.actor, d.id, key, {
        endpointRevision: d.replay.endpointRevision,
      }),
    ).rejects.toMatchObject({ status: 429 });
    await db.quotaBucket.update({
      where: { id: before.id },
      data: { count: before.count },
    });
    const wrapped = new Proxy(db, {
      get(target, prop) {
        if (prop === "$transaction")
          return (operation: Parameters<typeof db.$transaction>[0]) =>
            db.$transaction(async (tx) => {
              const intercepted = new Proxy(tx, {
                get(t, p) {
                  return p === "outboxMessage"
                    ? {
                        upsert: async () => {
                          throw new Error("Injected outbox failure");
                        },
                      }
                    : Reflect.get(t, p);
                },
              });
              return (
                operation as unknown as (
                  tx: typeof intercepted,
                ) => Promise<unknown>
              )(intercepted);
            });
        return Reflect.get(target, prop);
      },
    });
    await expect(
      createReplayService(wrapped).replay(f.actor, d.id, key, {
        endpointRevision: d.replay.endpointRevision,
      }),
    ).rejects.toThrow("Injected outbox failure");
    expect(await db.delivery.count({ where: { replayOfId: d.id } })).toBe(0);
    expect(
      await db.idempotencyRecord.count({
        where: { workspaceId: f.actor.workspaceId },
      }),
    ).toBe(0);
    expect(
      await db.auditEvent.count({
        where: {
          workspaceId: f.actor.workspaceId,
          action: "delivery.replay.created",
        },
      }),
    ).toBe(0);
    expect(
      (await db.quotaBucket.findUniqueOrThrow({ where: { id: before.id } }))
        .count,
    ).toBe(before.count);
  }, 15000);
  it("keeps append-only history and original uniqueness after the migration", async () => {
    const f = await fixture();
    const d = await f.finish();
    const original = await db.delivery.findUniqueOrThrow({
      where: { id: d.id },
    });
    await expect(
      db.delivery.create({ data: { ...original, id: randomUUID() } }),
    ).rejects.toThrow();
    const attempt = await db.deliveryAttempt.create({
      data: {
        deliveryId: d.id,
        sequence: 1,
        requestTimestamp: new Date(),
        destinationUrl: original.destinationUrl,
        outcome: {
          create: {
            status: "FAILED",
            completedAt: new Date(),
            httpStatus: 500,
            durationMs: 10,
            responseMetadata: {},
            resultingState: "EXHAUSTED",
          },
        },
      },
    });
    await expect(
      db.deliveryAttempt.update({
        where: { id: attempt.id },
        data: { durationMs: 20 },
      }),
    ).rejects.toThrow("append-only");
    await expect(
      db.deliveryAttemptOutcome.update({
        where: { attemptId: attempt.id },
        data: { httpStatus: 200 },
      }),
    ).rejects.toThrow("append-only");
    await expect(
      db.webhookEvent.update({
        where: { id: d.eventId },
        data: { payload: { changed: true } },
      }),
    ).rejects.toThrow("immutable");
    const detail = (await f.detail())!;
    expect(detail.attempts.map((a) => a.sequence)).toEqual([1]);
    await createReplayService(db).replay(f.actor, d.id, randomUUID(), {
      endpointRevision: detail.replay.endpointRevision,
    });
  }, 15000);
  it("authorizes API reads and replay, requires origin and key, and never serializes secrets", async () => {
    const f = await fixture();
    const other = await fixture();
    const d = await f.finish();
    const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    const ctx = { params: Promise.resolve({ id: d.id }) };
    expect(
      (await listRoute(new Request(origin + "/api/deliveries"))).status,
    ).toBe(401);
    const read = await detailRoute(
      new Request(origin + "/api/deliveries/" + d.id, {
        headers: { cookie: f.cookie },
      }),
      ctx,
    );
    expect(read.status).toBe(200);
    expect(await read.text()).not.toMatch(
      /encryptedSecret|endpointSecretId|currentSecretVersion|claimToken|whsec_/,
    );
    expect(
      (
        await detailRoute(
          new Request(origin + "/api/deliveries/" + d.id, {
            headers: { cookie: other.cookie },
          }),
          ctx,
        )
      ).status,
    ).toBe(404);
    const request = (headers: Record<string, string>) =>
      new Request(origin + "/api/deliveries/" + d.id + "/replay", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ endpointRevision: d.replay.endpointRevision }),
      });
    expect((await replayRoute(request({ cookie: f.cookie }), ctx)).status).toBe(
      403,
    );
    expect(
      (await replayRoute(request({ cookie: f.cookie, origin }), ctx)).status,
    ).toBe(422);
    expect(
      (
        await replayRoute(
          request({
            cookie: other.cookie,
            origin,
            "idempotency-key": randomUUID(),
          }),
          ctx,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await replayRoute(
          request({
            cookie: f.cookie,
            origin,
            "idempotency-key": randomUUID(),
          }),
          ctx,
        )
      ).status,
    ).toBe(202);
  }, 15000);
  it("executes replay through the unchanged processor using the immutable event", async () => {
    const f = await fixture();
    const d = await f.finish();
    const created = await createReplayService(db).replay(
      f.actor,
      d.id,
      randomUUID(),
      { endpointRevision: d.replay.endpointRevision },
    );
    const work = await db.outboxMessage.findFirstOrThrow({
      where: { aggregateId: created.deliveryId },
    });
    const processor = createDeliveryProcessor({
      database: db,
      keyring,
      transport: async (request) => {
        expect(JSON.parse(request.body).eventId).toBe(f.input.eventId);
        return { httpStatus: 200, errorClass: null, durationMs: 12 };
      },
    });
    await processor.process({
      deliveryId: created.deliveryId,
      outboxId: work.id,
      generation: 1,
    });
    expect(
      (await queries.detail(f.actor.workspaceId, created.deliveryId))?.status,
    ).toBe("SUCCEEDED");
    expect((await f.detail())?.status).toBe("EXHAUSTED");
  }, 15000);
  it("retains replay idempotency for 24 hours and validates optional endpoint names", async () => {
    const f = await fixture();
    expect(f.endpoint.data.name).toBe("Production CRM");
    expect(
      (await f.endpoints.update(f.actor, f.endpoint.data.id, { name: "   " }))
        .name,
    ).toBeNull();
    const d = await f.finish();
    let now = new Date();
    const service = createReplayService(db, () => now);
    const key = randomUUID();
    const first = await service.replay(f.actor, d.id, key, {
      endpointRevision: d.replay.endpointRevision,
    });
    const record = await db.idempotencyRecord.findFirstOrThrow({
      where: { workspaceId: f.actor.workspaceId, key },
    });
    now = new Date(+record.expiresAt - 1);
    expect(
      await service.replay(f.actor, d.id, key, {
        endpointRevision: d.replay.endpointRevision,
      }),
    ).toEqual(first);
    now = record.expiresAt;
    expect(
      (
        await service.replay(f.actor, d.id, key, {
          endpointRevision: d.replay.endpointRevision,
        })
      ).deliveryId,
    ).not.toBe(first.deliveryId);
  }, 15000);
  it("returns safe load failures and allows a subsequent retry", async () => {
    const f = await fixture();
    const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    const request = () =>
      new Request(origin + "/api/deliveries", {
        headers: { cookie: f.cookie },
      });
    const failure = vi
      .spyOn(deliveryQueries, "list")
      .mockRejectedValueOnce(new Error("private-database-diagnostic"));
    try {
      const response = await listRoute(request());
      expect(response.status).toBe(500);
      const body = await response.text();
      expect(body).toContain("INTERNAL_ERROR");
      expect(body).not.toContain("private-database-diagnostic");
    } finally {
      failure.mockRestore();
    }
    expect((await listRoute(request())).status).toBe(200);
  }, 15000);
});
