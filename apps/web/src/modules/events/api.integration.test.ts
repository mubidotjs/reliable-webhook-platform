import { randomUUID } from "node:crypto";
import { serializeSignedCookie } from "better-call";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { createEndpointService } from "@/modules/endpoints/service";
import { POST } from "@/app/api/events/route";
vi.mock("next/server", () => ({ after: vi.fn() }));
describe.runIf(Boolean(process.env.DATABASE_URL))(
  "event HTTP ingestion",
  () => {
    afterAll(async () => db.$disconnect());
    it("requires session and origin, persists before 202, and handles duplicates and limits", async () => {
      const userId = randomUUID();
      const token = randomUUID();
      const user = await db.user.create({
        data: {
          id: userId,
          name: "API test",
          email: userId + "@api.test",
          workspace: { create: { name: "API test" } },
          sessions: {
            create: {
              id: randomUUID(),
              token,
              expiresAt: new Date(Date.now() + 3_600_000),
            },
          },
        },
        include: { workspace: true },
      });
      const workspaceId = user.workspace!.id;
      const endpoint = await createEndpointService({
        database: db,
        keyring: {
          activeVersion: "v1",
          keys: new Map([["v1", Buffer.alloc(32, 4)]]),
        },
        resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      }).create(
        { userId, workspaceId },
        { url: "https://example.com/api-test", timeoutMs: 5000 },
      );
      const cookie = (
        await serializeSignedCookie(
          "better-auth.session_token",
          token,
          process.env.BETTER_AUTH_SECRET ??
            "development-only-secret-change-before-deploying",
          { httpOnly: true, sameSite: "lax", path: "/" },
        )
      ).split(";")[0]!;
      const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
      const input = {
        eventId: randomUUID(),
        endpointId: endpoint.data.id,
        type: "api.test",
        payload: { value: "é" },
      };
      const request = (
        body: string,
        headers: Record<string, string> = { cookie, origin },
      ) =>
        new Request(origin + "/api/events", { method: "POST", headers, body });
      try {
        expect((await POST(request(JSON.stringify(input), {}))).status).toBe(
          401,
        );
        expect(
          (
            await POST(
              request(JSON.stringify(input), {
                cookie,
                origin: "https://evil.test",
              }),
            )
          ).status,
        ).toBe(403);
        expect((await POST(request("{"))).status).toBe(400);
        expect((await POST(request(" ".repeat(256 * 1024 + 1)))).status).toBe(
          413,
        );
        const response = await POST(request(JSON.stringify(input)));
        expect(response.status).toBe(202);
        const accepted = await response.json();
        const delivery = await db.delivery.findUniqueOrThrow({
          where: { id: accepted.data.deliveryId },
        });
        expect(
          await db.outboxMessage.count({ where: { aggregateId: delivery.id } }),
        ).toBe(1);
        expect((await POST(request(JSON.stringify(input)))).status).toBe(202);
        expect(
          (await POST(request(JSON.stringify({ ...input, payload: {} }))))
            .status,
        ).toBe(409);
        expect(
          (
            await POST(
              request(
                JSON.stringify({
                  ...input,
                  eventId: randomUUID(),
                  endpointId: "missing",
                }),
              ),
            )
          ).status,
        ).toBe(404);
      } finally {
        const events = await db.webhookEvent.findMany({
          where: { workspaceId },
        });
        for (const event of events) {
          const day = new Date(event.createdAt);
          day.setUTCHours(0, 0, 0, 0);
          await db.quotaBucket.updateMany({
            where: {
              workspaceId: null,
              subject: "accepted-deliveries",
              bucketStart: day,
              count: { gt: 0 },
            },
            data: { count: { decrement: 1 } },
          });
        }
        const rows = await db.delivery.findMany({ where: { workspaceId } });
        await db.outboxMessage.deleteMany({
          where: { aggregateId: { in: rows.map((row) => row.id) } },
        });
        await db.delivery.deleteMany({ where: { workspaceId } });
        await db.webhookEvent.deleteMany({ where: { workspaceId } });
        await db.user.delete({ where: { id: userId } });
      }
    });
  },
);
