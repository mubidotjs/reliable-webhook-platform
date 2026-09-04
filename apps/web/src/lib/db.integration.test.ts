import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";

const runDatabaseTests = Boolean(process.env.DATABASE_URL);

describe.runIf(runDatabaseTests)("PostgreSQL foundation", () => {
  afterAll(async () => {
    await db.$disconnect();
  });

  it("connects to PostgreSQL and executes a query", async () => {
    const result = await db.$queryRaw<Array<{ value: number }>>`
      SELECT 1::int AS value
    `;

    expect(result).toEqual([{ value: 1 }]);
  });

  it("enforces the one-workspace-per-owner invariant", async () => {
    const userId = randomUUID();
    await db.user.create({
      data: {
        id: userId,
        name: "Workspace Owner",
        email: `${userId}@example.test`,
      },
    });

    try {
      await db.workspace.create({
        data: { name: "Primary", ownerId: userId },
      });

      await expect(
        db.workspace.create({
          data: { name: "Duplicate", ownerId: userId },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    } finally {
      await db.user.delete({ where: { id: userId } });
    }
  });

  it("rolls back an application transaction on failure", async () => {
    const userId = randomUUID();

    await expect(
      db.$transaction(async (transaction) => {
        await transaction.user.create({
          data: {
            id: userId,
            name: "Rolled Back",
            email: `${userId}@example.test`,
          },
        });
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");

    await expect(
      db.user.findUnique({ where: { id: userId } }),
    ).resolves.toBeNull();
  });

  it("enforces endpoint timeout bounds in PostgreSQL", async () => {
    const userId = randomUUID();
    const user = await db.user.create({
      data: {
        id: userId,
        name: "Constraint Owner",
        email: `${userId}@example.test`,
      },
    });
    const workspace = await db.workspace.create({
      data: { name: "Constraint Lab", ownerId: user.id },
    });

    try {
      await expect(
        db.webhookEndpoint.create({
          data: {
            workspaceId: workspace.id,
            url: "https://example.test/hooks",
            timeoutMs: 999,
          },
        }),
      ).rejects.toThrow();
    } finally {
      await db.user.delete({ where: { id: userId } });
    }
  });
});
