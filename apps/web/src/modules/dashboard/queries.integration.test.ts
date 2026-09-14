import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createDashboardQueries } from "./queries";
const queries = createDashboardQueries(db);
describe.runIf(Boolean(process.env.DATABASE_URL))(
  "dashboard workspace queries",
  () => {
    afterAll(async () => db.$disconnect());
    it("isolates pages and details, projects no secrets, and paginates tied timestamps", async () => {
      const owners = [randomUUID(), randomUUID()];
      const workspaces: string[] = [];
      try {
        for (const owner of owners) {
          const created = await db.user.create({
            data: {
              id: owner,
              name: "Query test",
              email: owner + "@query.test",
              workspace: { create: { name: "Query test" } },
            },
            include: { workspace: true },
          });
          workspaces.push(created.workspace!.id);
        }
        const own = workspaces[0]!,
          other = workspaces[1]!;
        const date = new Date("2026-09-13T00:00:00Z");
        await db.webhookEndpoint.createMany({
          data: Array.from({ length: 27 }, (_, i) => ({
            id: randomUUID(),
            workspaceId: own,
            url: `https://example.test/${i}`,
            createdAt: date,
          })),
        });
        const foreign = await db.webhookEndpoint.create({
          data: { workspaceId: other, url: "https://other.test" },
        });
        const first = await queries.endpoints(own);
        const second = await queries.endpoints(own, first.nextCursor!);
        expect(first.data).toHaveLength(25);
        expect(second.data).toHaveLength(2);
        expect(
          new Set([...first.data, ...second.data].map((row) => row.id)).size,
        ).toBe(27);
        expect(JSON.stringify(first)).not.toMatch(
          /encryptedSecret|encryptionKeyVersion|workspaceId/,
        );
        expect(await queries.endpoint(own, foreign.id)).toBeNull();
        const endpoint = first.data[0]!;
        const secret = await db.endpointSecret.create({
          data: {
            endpointId: endpoint.id,
            version: 1,
            encryptedSecret: "not-a-readable-secret",
            encryptionKeyVersion: "v1",
          },
        });
        const event = await db.webhookEvent.create({
          data: {
            workspaceId: own,
            endpointId: endpoint.id,
            type: "test",
            payload: {},
            deliveryBody: "{}",
            producerEventId: randomUUID(),
            requestHash: "test",
            creationSource: "test",
            correlationId: randomUUID(),
          },
        });
        const delivery = await db.delivery.create({
          data: {
            workspaceId: own,
            eventId: event.id,
            endpointId: endpoint.id,
            endpointSecretId: secret.id,
            destinationUrl: endpoint.url,
            timeoutMs: 5000,
            retryDeadline: new Date(Date.now() + 86400000),
            correlationId: randomUUID(),
          },
        });
        expect(await queries.event(other, event.id)).toBeNull();
        expect(await queries.delivery(other, delivery.id)).toBeNull();
        expect((await queries.events(other)).data).toHaveLength(0);
        expect((await queries.deliveries(other)).data).toHaveLength(0);
        expect(
          JSON.stringify(await queries.delivery(own, delivery.id)),
        ).not.toMatch(/encryptedSecret|endpointSecretId|claimToken/);
        await expect(queries.events(own, "invalid")).rejects.toThrow(
          "Invalid page cursor",
        );
      } finally {
        await db.delivery.deleteMany({
          where: { workspaceId: { in: workspaces } },
        });
        await db.webhookEvent.deleteMany({
          where: { workspaceId: { in: workspaces } },
        });
        await db.user.deleteMany({ where: { id: { in: owners } } });
      }
    });
  },
);
