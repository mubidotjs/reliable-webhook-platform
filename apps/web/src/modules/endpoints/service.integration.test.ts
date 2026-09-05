import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import type { EncryptionKeyringConfig } from "@rwp/config";
import { parseSigningSecret } from "@rwp/domain";

import { ApiError } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { decryptEndpointSecret } from "@/modules/endpoints/secret-crypto";
import { createEndpointService } from "@/modules/endpoints/service";

const runDatabaseTests = Boolean(process.env.DATABASE_URL);
const keyring: EncryptionKeyringConfig = {
  activeVersion: "v1",
  keys: new Map([["v1", Buffer.alloc(32, 4)]]),
};
const resolver = async () => [{ address: "93.184.216.34", family: 4 as const }];

async function createOwner(label: string) {
  const id = randomUUID();
  const user = await db.user.create({
    data: { id, name: `${label} Owner`, email: `${id}@example.test` },
  });
  const workspace = await db.workspace.create({
    data: { name: `${label} Workspace`, ownerId: user.id },
  });
  return {
    actor: { userId: user.id, workspaceId: workspace.id },
    user,
    workspace,
  };
}

describe.runIf(runDatabaseTests)("secure endpoint service", () => {
  afterAll(async () => db.$disconnect());

  it("atomically creates, encrypts, rotates, updates, audits, and disables", async () => {
    const owner = await createOwner("Lifecycle");
    const service = createEndpointService({ database: db, resolver, keyring });
    try {
      const created = await service.create(owner.actor, {
        url: "https://EXAMPLE.com:443/hooks?token=synthetic",
        timeoutMs: 4_000,
      });
      expect(created.data).toMatchObject({
        url: "https://example.com/hooks?token=synthetic",
        status: "ENABLED",
        secretVersion: 1,
      });

      const stored = await db.endpointSecret.findUniqueOrThrow({
        where: {
          endpointId_version: { endpointId: created.data.id, version: 1 },
        },
      });
      expect(stored.encryptedSecret).not.toContain(created.signingSecret);
      expect(
        decryptEndpointSecret(
          stored.encryptedSecret,
          stored.encryptionKeyVersion,
          {
            workspaceId: owner.workspace.id,
            endpointId: created.data.id,
            secretVersion: 1,
          },
          keyring,
        ),
      ).toEqual(parseSigningSecret(created.signingSecret));

      const updated = await service.update(owner.actor, created.data.id, {
        timeoutMs: 7_000,
      });
      expect(updated.timeoutMs).toBe(7_000);

      const [rotationA, rotationB] = await Promise.all([
        service.rotateSecret(owner.actor, created.data.id),
        service.rotateSecret(owner.actor, created.data.id),
      ]);
      expect([rotationA.secretVersion, rotationB.secretVersion].sort()).toEqual(
        [2, 3],
      );
      expect(
        await db.endpointSecret.count({
          where: { endpointId: created.data.id, retiredAt: null },
        }),
      ).toBe(1);

      const disabled = await service.update(owner.actor, created.data.id, {
        status: "DISABLED",
      });
      expect(disabled.status).toBe("DISABLED");
      await expect(
        service.update(owner.actor, created.data.id, { timeoutMs: 8_000 }),
      ).rejects.toMatchObject({ code: "ENDPOINT_DISABLED" });
      await expect(
        service.rotateSecret(owner.actor, created.data.id),
      ).rejects.toMatchObject({ code: "ENDPOINT_DISABLED" });

      const auditActions = await db.auditEvent.findMany({
        where: { workspaceId: owner.workspace.id },
        orderBy: { createdAt: "asc" },
        select: { action: true, metadata: true },
      });
      expect(auditActions.map(({ action }) => action)).toEqual([
        "endpoint.created",
        "endpoint.updated",
        "endpoint.secret_rotated",
        "endpoint.secret_rotated",
        "endpoint.disabled",
      ]);
      expect(JSON.stringify(auditActions)).not.toContain(created.signingSecret);
    } finally {
      await db.user.delete({ where: { id: owner.user.id } });
    }
  });

  it("isolates workspaces, pages stably, and enforces five enabled endpoints", async () => {
    const owner = await createOwner("Limits");
    const outsider = await createOwner("Outsider");
    const service = createEndpointService({ database: db, resolver, keyring });
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, (_, index) =>
          service.create(owner.actor, {
            url: `https://example.com/hooks/${index}`,
            timeoutMs: 5_000,
          }),
        ),
      );
      const failureSummary = results
        .filter((result) => result.status === "rejected")
        .map(({ reason }: PromiseRejectedResult) => ({
          code: (reason as { code?: string }).code,
          message: (reason as { message?: string }).message,
        }));
      expect(
        results.filter(({ status }) => status === "fulfilled"),
        JSON.stringify(failureSummary),
      ).toHaveLength(5);
      const rejected = results.find(({ status }) => status === "rejected");
      expect(rejected).toMatchObject({
        status: "rejected",
        reason: expect.objectContaining({ code: "ENDPOINT_LIMIT_REACHED" }),
      });

      const firstPage = await service.list(owner.actor, { limit: 2 });
      expect(firstPage.data).toHaveLength(2);
      expect(firstPage.page.nextCursor).toEqual(expect.any(String));
      const secondPage = await service.list(owner.actor, {
        limit: 2,
        cursor: firstPage.page.nextCursor!,
      });
      expect(secondPage.data).toHaveLength(2);
      expect(
        new Set([...firstPage.data, ...secondPage.data].map(({ id }) => id))
          .size,
      ).toBe(4);

      await expect(
        service.read(outsider.actor, firstPage.data[0]!.id),
      ).rejects.toBeInstanceOf(ApiError);
      await expect(
        service.read(outsider.actor, firstPage.data[0]!.id),
      ).rejects.toMatchObject({ code: "ENDPOINT_NOT_FOUND" });
    } finally {
      await db.user.deleteMany({
        where: { id: { in: [owner.user.id, outsider.user.id] } },
      });
    }
  });

  it("rolls back endpoint creation when encryption cannot complete", async () => {
    const owner = await createOwner("Rollback");
    const service = createEndpointService({
      database: db,
      resolver,
      keyring: { activeVersion: "missing", keys: new Map() },
    });
    try {
      await expect(
        service.create(owner.actor, {
          url: "https://example.com/rollback",
          timeoutMs: 5_000,
        }),
      ).rejects.toThrow(/unavailable/);
      expect(
        await db.webhookEndpoint.count({
          where: { workspaceId: owner.workspace.id },
        }),
      ).toBe(0);
      expect(
        await db.auditEvent.count({
          where: { workspaceId: owner.workspace.id },
        }),
      ).toBe(0);
    } finally {
      await db.user.delete({ where: { id: owner.user.id } });
    }
  });
});
